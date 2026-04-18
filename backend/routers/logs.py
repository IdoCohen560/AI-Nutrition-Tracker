import asyncio
import json
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from config import settings
from database import get_db
from datetimeutil import utc_day_range, utc_today
from deps import get_current_user
from models import FoodLogEntry, User
from schemas import (
    BarcodeLookupOut,
    CreateLogRequest,
    FoodItemOut,
    FoodLogEntryOut,
    FoodLogEntryUpdate,
    ParseLogRequest,
    ParseLogResponse,
    QuickLogFromRecRequest,
    RecipeImportRequest,
    RecipeImportResponse,
)
from services.nlp import parse_meal_description
from services.nutrition import enrich_item, lookup_by_barcode
from services.recipe_import import import_recipe_from_url

router = APIRouter(prefix="/logs", tags=["logs"])


def _serialize_items(items: list[FoodItemOut]) -> str:
    return json.dumps([i.model_dump() for i in items])


def _deserialize_items(raw: str) -> list[FoodItemOut]:
    try:
        data = json.loads(raw or "[]")
        return [FoodItemOut(**x) for x in data]
    except (json.JSONDecodeError, TypeError, ValueError):
        return []


def _entry_to_out(entry: FoodLogEntry) -> FoodLogEntryOut:
    return FoodLogEntryOut(
        id=entry.id,
        meal_type=entry.meal_type,
        description_text=entry.description_text,
        items=_deserialize_items(entry.items_json),
        parse_confidence=entry.parse_confidence,
        total_calories=entry.total_calories,
        total_protein_g=entry.total_protein_g,
        total_carbs_g=entry.total_carbs_g,
        total_fat_g=entry.total_fat_g,
        total_saturated_fat_g=entry.total_saturated_fat_g or 0.0,
        total_cholesterol_mg=entry.total_cholesterol_mg or 0.0,
        total_sodium_mg=entry.total_sodium_mg or 0.0,
        total_fiber_g=entry.total_fiber_g or 0.0,
        total_sugars_g=entry.total_sugars_g or 0.0,
        total_added_sugars_g=entry.total_added_sugars_g or 0.0,
        created_at=entry.created_at,
    )


async def _run_parse(text: str, db: Session | None = None) -> ParseLogResponse:
    raw_items, conf, err = await parse_meal_description(text)
    if err:
        return ParseLogResponse(
            items=[],
            parse_confidence=0.0,
            requires_confirmation=False,
            nlp_error=err,
            nutrition_warnings=[],
        )
    if not raw_items:
        return ParseLogResponse(
            items=[],
            parse_confidence=conf,
            requires_confirmation=True,
            nlp_error="Could not parse any food items from the description.",
            nutrition_warnings=[],
        )
    warnings: list[str] = []
    out_items: list[FoodItemOut] = []
    for raw in raw_items:
        name = (raw.get("name") or "").strip()
        if not name:
            continue
        qty = raw.get("quantity")
        fi, source = await enrich_item(name, qty, db=db)
        out_items.append(fi)
        if source == "generic":
            warnings.append(fi.name)
    requires_confirmation = conf < 0.8
    return ParseLogResponse(
        items=out_items,
        parse_confidence=conf,
        requires_confirmation=requires_confirmation,
        nlp_error=None,
        nutrition_warnings=warnings,
    )


@router.post("/parse", response_model=ParseLogResponse)
async def parse_log(body: ParseLogRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    timeout = max(settings.nlp_timeout_seconds, 12.0)
    try:
        return await asyncio.wait_for(_run_parse(body.text, db=db), timeout=timeout)
    except asyncio.TimeoutError:
        return ParseLogResponse(
            items=[],
            parse_confidence=0.0,
            requires_confirmation=False,
            nlp_error="NLP service did not respond in time. Try again or use manual entry.",
            nutrition_warnings=[],
        )


@router.get("/barcode/{gtin}", response_model=BarcodeLookupOut)
async def barcode_lookup(gtin: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    item = await lookup_by_barcode(gtin, db=db)
    if not item:
        return BarcodeLookupOut(found=False)
    return BarcodeLookupOut(found=True, item=item)


@router.post("/import-recipe", response_model=RecipeImportResponse)
async def import_recipe(
    body: RecipeImportRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        result = await import_recipe_from_url(body.url, db=db)
    except Exception as exc:
        return RecipeImportResponse(found=False, error=str(exc))
    return result


@router.post("", response_model=FoodLogEntryOut, status_code=status.HTTP_201_CREATED)
def create_log(
    body: CreateLogRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if body.parse_confidence is not None and body.parse_confidence < 0.8 and not body.confirmed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Confirmation required: parse confidence is below 80%. Review items and confirm.",
        )
    if not body.items:
        raise HTTPException(status_code=400, detail="At least one food item is required")
    totals = _totals_from_items(body.items)
    created_at = _resolve_created_at(body.for_date, body.tz_offset, user)
    entry = FoodLogEntry(
        user_id=user.id,
        meal_type=body.meal_type,
        description_text=body.description_text,
        items_json=_serialize_items(body.items),
        parse_confidence=body.parse_confidence,
        total_calories=totals["cal"],
        total_protein_g=totals["p"],
        total_carbs_g=totals["c"],
        total_fat_g=totals["f"],
        total_saturated_fat_g=totals["sf"],
        total_cholesterol_mg=totals["chol"],
        total_sodium_mg=totals["sod"],
        total_fiber_g=totals["fib"],
        total_sugars_g=totals["sug"],
        total_added_sugars_g=totals["asug"],
        created_at=created_at,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return _entry_to_out(entry)


def _resolve_created_at(for_date: str | None, tz_offset: int, user: User) -> datetime:
    """Build a UTC-naive created_at. If for_date is a past local day in user's tz,
    pin it to that day's noon UTC-shifted time. Reject future dates and dates earlier
    than the first of the local current month."""
    if not for_date:
        return datetime.utcnow()
    try:
        target = date.fromisoformat(for_date)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid for_date format (YYYY-MM-DD)")
    now_local = datetime.utcnow() - timedelta(minutes=tz_offset)
    today_local = now_local.date()
    if target > today_local:
        raise HTTPException(status_code=400, detail="Cannot log for a future date")
    first_of_month = today_local.replace(day=1)
    if target < first_of_month:
        raise HTTPException(status_code=400, detail="Can only edit dates in the current month")
    if target == today_local:
        return datetime.utcnow()
    # Past day: pin to local noon, then convert to naive UTC.
    local_noon = datetime(target.year, target.month, target.day, 12, 0, 0)
    return local_noon + timedelta(minutes=tz_offset)


def _totals_from_items(items: list[FoodItemOut]) -> dict:
    return {
        "cal": sum(i.calories for i in items),
        "p": sum(i.protein_g for i in items),
        "c": sum(i.carbs_g for i in items),
        "f": sum(i.fat_g for i in items),
        "sf": sum(i.saturated_fat_g for i in items),
        "chol": sum(i.cholesterol_mg for i in items),
        "sod": sum(i.sodium_mg for i in items),
        "fib": sum(i.fiber_g for i in items),
        "sug": sum(i.sugars_g for i in items),
        "asug": sum(i.added_sugars_g for i in items),
    }


@router.post("/quick", response_model=FoodLogEntryOut, status_code=status.HTTP_201_CREATED)
def quick_log_from_recommendation(
    body: QuickLogFromRecRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    item = FoodItemOut(
        name=body.food_name,
        quantity="quick add",
        calories=body.estimated_calories,
        protein_g=body.protein_g,
        carbs_g=body.carbs_g,
        fat_g=body.fat_g,
        saturated_fat_g=body.saturated_fat_g,
        cholesterol_mg=body.cholesterol_mg,
        sodium_mg=body.sodium_mg,
        fiber_g=body.fiber_g,
        sugars_g=body.sugars_g,
        added_sugars_g=body.added_sugars_g,
    )
    totals = _totals_from_items([item])
    entry = FoodLogEntry(
        user_id=user.id,
        meal_type=body.meal_type,
        description_text=f"Quick log: {body.food_name}",
        items_json=_serialize_items([item]),
        parse_confidence=1.0,
        total_calories=totals["cal"],
        total_protein_g=totals["p"],
        total_carbs_g=totals["c"],
        total_fat_g=totals["f"],
        total_saturated_fat_g=totals["sf"],
        total_cholesterol_mg=totals["chol"],
        total_sodium_mg=totals["sod"],
        total_fiber_g=totals["fib"],
        total_sugars_g=totals["sug"],
        total_added_sugars_g=totals["asug"],
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return _entry_to_out(entry)


@router.get("", response_model=list[FoodLogEntryOut])
def list_logs_for_date(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    log_date: date | None = Query(None, alias="date"),
):
    d = log_date or utc_today()
    start, end = utc_day_range(d)
    rows = (
        db.query(FoodLogEntry)
        .filter(
            FoodLogEntry.user_id == user.id,
            FoodLogEntry.created_at >= start,
            FoodLogEntry.created_at < end,
        )
        .order_by(FoodLogEntry.created_at.desc())
        .all()
    )
    return [_entry_to_out(e) for e in rows]


@router.get("/history", response_model=list[FoodLogEntryOut])
def history(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    start: date = Query(..., description="Start date (inclusive)"),
    end: date = Query(..., description="End date (inclusive)"),
):
    if end < start:
        raise HTTPException(400, "end must be on or after start")
    start_dt, _ = utc_day_range(start)
    _, end_next = utc_day_range(end + timedelta(days=1))
    rows = (
        db.query(FoodLogEntry)
        .filter(
            FoodLogEntry.user_id == user.id,
            FoodLogEntry.created_at >= start_dt,
            FoodLogEntry.created_at < end_next,
        )
        .order_by(FoodLogEntry.created_at.desc())
        .all()
    )
    return [_entry_to_out(e) for e in rows]


@router.patch("/{entry_id}", response_model=FoodLogEntryOut)
def update_log(
    entry_id: int,
    body: FoodLogEntryUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    entry = db.get(FoodLogEntry, entry_id)
    if not entry or entry.user_id != user.id:
        raise HTTPException(404, "Entry not found")
    if body.meal_type is not None:
        entry.meal_type = body.meal_type
    if body.description_text is not None:
        entry.description_text = body.description_text
    if body.items is not None:
        if not body.items:
            raise HTTPException(400, "Items cannot be empty")
        entry.items_json = _serialize_items(body.items)
        t = _totals_from_items(body.items)
        entry.total_calories = t["cal"]
        entry.total_protein_g = t["p"]
        entry.total_carbs_g = t["c"]
        entry.total_fat_g = t["f"]
        entry.total_saturated_fat_g = t["sf"]
        entry.total_cholesterol_mg = t["chol"]
        entry.total_sodium_mg = t["sod"]
        entry.total_fiber_g = t["fib"]
        entry.total_sugars_g = t["sug"]
        entry.total_added_sugars_g = t["asug"]
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return _entry_to_out(entry)


@router.delete("/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_log(
    entry_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    entry = db.get(FoodLogEntry, entry_id)
    if not entry or entry.user_id != user.id:
        raise HTTPException(404, "Entry not found")
    db.delete(entry)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
