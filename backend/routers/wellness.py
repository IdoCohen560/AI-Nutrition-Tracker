"""Wellness endpoints: weight tracking, water tracking, fasting timer, favorites, streak."""

import json
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from datetimeutil import utc_today
from deps import get_current_user
from models import FoodLogEntry, StepsEntry, User, WaterEntry, WeightEntry
from schemas import StepsDayOut, StepsUpdate

router = APIRouter(prefix="", tags=["wellness"])


# ---------- shared ----------

def _local_today_iso(tz_offset_minutes: int) -> str:
    return (datetime.utcnow() - timedelta(minutes=tz_offset_minutes)).date().isoformat()


# ---------- weight ----------

class WeightCreate(BaseModel):
    weight_kg: float
    for_date: str | None = None
    tz_offset: int = 0


class WeightOut(BaseModel):
    id: int
    weight_kg: float
    recorded_for: str
    created_at: str

    model_config = {"from_attributes": True}


@router.post("/weight", response_model=WeightOut, status_code=201)
def add_weight(body: WeightCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if body.weight_kg <= 0 or body.weight_kg > 600:
        raise HTTPException(400, "weight_kg out of range")
    target = body.for_date or _local_today_iso(body.tz_offset)
    # Upsert: replace existing entry for the same day so the chart stays one-per-day.
    existing = db.query(WeightEntry).filter(
        WeightEntry.user_id == user.id, WeightEntry.recorded_for == target
    ).first()
    if existing:
        existing.weight_kg = body.weight_kg
        entry = existing
    else:
        entry = WeightEntry(user_id=user.id, weight_kg=body.weight_kg, recorded_for=target)
        db.add(entry)
    user.weight_kg = body.weight_kg  # mirror current weight onto profile
    db.commit()
    db.refresh(entry)
    return WeightOut(
        id=entry.id, weight_kg=entry.weight_kg, recorded_for=entry.recorded_for,
        created_at=entry.created_at.isoformat(),
    )


@router.get("/weight", response_model=list[WeightOut])
def list_weight(days: int = Query(90, ge=1, le=365), user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = (
        db.query(WeightEntry)
        .filter(WeightEntry.user_id == user.id)
        .order_by(WeightEntry.recorded_for.asc())
        .all()
    )
    cutoff = (utc_today() - timedelta(days=days)).isoformat()
    return [
        WeightOut(id=r.id, weight_kg=r.weight_kg, recorded_for=r.recorded_for, created_at=r.created_at.isoformat())
        for r in rows if r.recorded_for >= cutoff
    ]


# ---------- water ----------

class WaterAdjust(BaseModel):
    delta: int = 1
    for_date: str | None = None
    tz_offset: int = 0


class WaterDayOut(BaseModel):
    date: str
    cups: int


@router.post("/water", response_model=WaterDayOut)
def adjust_water(body: WaterAdjust, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    target = body.for_date or _local_today_iso(body.tz_offset)
    entry = db.query(WaterEntry).filter(WaterEntry.user_id == user.id, WaterEntry.recorded_for == target).first()
    if not entry:
        entry = WaterEntry(user_id=user.id, cups=0, recorded_for=target)
        db.add(entry)
    entry.cups = max(0, (entry.cups or 0) + body.delta)
    db.commit()
    db.refresh(entry)
    return WaterDayOut(date=target, cups=entry.cups)


@router.get("/water", response_model=WaterDayOut)
def get_water(tz_offset: int = Query(0, alias="tz"), user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    target = _local_today_iso(tz_offset)
    entry = db.query(WaterEntry).filter(WaterEntry.user_id == user.id, WaterEntry.recorded_for == target).first()
    return WaterDayOut(date=target, cups=entry.cups if entry else 0)


# ---------- fasting ----------

class FastStart(BaseModel):
    target_hours: float = 16.0


class FastStatus(BaseModel):
    active: bool
    started_at: str | None = None
    target_hours: float | None = None
    elapsed_hours: float | None = None


@router.post("/fast/start", response_model=FastStatus)
def start_fast(body: FastStart, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if body.target_hours <= 0 or body.target_hours > 168:
        raise HTTPException(400, "target_hours must be between 0 and 168")
    user.fast_start = datetime.utcnow()
    user.fast_target_hours = body.target_hours
    db.commit()
    return _fast_status(user)


@router.post("/fast/stop", response_model=FastStatus)
def stop_fast(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    user.fast_start = None
    user.fast_target_hours = None
    db.commit()
    return _fast_status(user)


@router.get("/fast", response_model=FastStatus)
def get_fast(user: User = Depends(get_current_user)):
    return _fast_status(user)


def _fast_status(user: User) -> FastStatus:
    if not user.fast_start:
        return FastStatus(active=False)
    elapsed = (datetime.utcnow() - user.fast_start).total_seconds() / 3600.0
    # Append "Z" so the frontend parses it as UTC, not local time.
    # Stored value is naive UTC (via datetime.utcnow()), so this is correct.
    started_iso = user.fast_start.isoformat()
    if not started_iso.endswith("Z") and "+" not in started_iso[10:]:
        started_iso += "Z"
    return FastStatus(
        active=True,
        started_at=started_iso,
        target_hours=user.fast_target_hours,
        elapsed_hours=round(elapsed, 2),
    )


# ---------- favorites ----------

class FavoritesUpdate(BaseModel):
    foods: list[str]


@router.get("/favorites", response_model=list[str])
def get_favorites(user: User = Depends(get_current_user)):
    try:
        v = json.loads(user.favorite_foods or "[]")
        return v if isinstance(v, list) else []
    except json.JSONDecodeError:
        return []


@router.put("/favorites", response_model=list[str])
def set_favorites(body: FavoritesUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    cleaned = list(dict.fromkeys([s.strip() for s in body.foods if s and s.strip()]))[:30]
    user.favorite_foods = json.dumps(cleaned)
    db.commit()
    return cleaned


# ---------- recent foods + streak (stats) ----------

class StatsOut(BaseModel):
    streak_days: int
    diet_score: int | None
    diet_score_breakdown: dict
    recent_foods: list[str]


@router.get("/stats", response_model=StatsOut)
def stats(tz_offset: int = Query(0, alias="tz"), user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    today_iso = _local_today_iso(tz_offset)
    # Streak: walk back day by day until we hit a day with no entries.
    days_back = 0
    while days_back < 365:
        target = (datetime.fromisoformat(today_iso) - timedelta(days=days_back)).date()
        start_local = datetime.combine(target, datetime.min.time()) + timedelta(minutes=tz_offset)
        end_local = start_local + timedelta(days=1)
        n = (
            db.query(FoodLogEntry)
            .filter(
                FoodLogEntry.user_id == user.id,
                FoodLogEntry.created_at >= start_local,
                FoodLogEntry.created_at < end_local,
            )
            .count()
        )
        if n == 0:
            # Today might not be logged yet — only break the streak if it's not today.
            if days_back == 0:
                days_back += 1
                continue
            break
        days_back += 1
    streak = days_back if days_back == 0 else (days_back if days_back <= 1 else days_back)

    # Recent foods: distinct names from last 14 days, most recent first.
    recent_cutoff = datetime.utcnow() - timedelta(days=14)
    recent_rows = (
        db.query(FoodLogEntry)
        .filter(FoodLogEntry.user_id == user.id, FoodLogEntry.created_at >= recent_cutoff)
        .order_by(FoodLogEntry.created_at.desc())
        .limit(60)
        .all()
    )
    seen: list[str] = []
    seen_lower = set()
    for r in recent_rows:
        try:
            items = json.loads(r.items_json or "[]")
        except json.JSONDecodeError:
            items = []
        for it in items:
            name = (it.get("name") or "").strip()
            if name and name.lower() not in seen_lower:
                seen.append(name)
                seen_lower.add(name.lower())
            if len(seen) >= 12:
                break
        if len(seen) >= 12:
            break

    # Diet score: composite 0–100 for *today*.
    score, breakdown = _diet_score_today(db, user, tz_offset)
    return StatsOut(streak_days=streak, diet_score=score, diet_score_breakdown=breakdown, recent_foods=seen)


def _diet_score_today(db: Session, user: User, tz_offset: int) -> tuple[int | None, dict]:
    target = (datetime.utcnow() - timedelta(minutes=tz_offset)).date()
    start_local = datetime.combine(target, datetime.min.time()) + timedelta(minutes=tz_offset)
    end_local = start_local + timedelta(days=1)
    rows = (
        db.query(FoodLogEntry)
        .filter(
            FoodLogEntry.user_id == user.id,
            FoodLogEntry.created_at >= start_local,
            FoodLogEntry.created_at < end_local,
        )
        .all()
    )
    if not rows:
        return None, {}
    cal = sum(r.total_calories or 0 for r in rows)
    pro = sum(r.total_protein_g or 0 for r in rows)
    fib = sum(r.total_fiber_g or 0 for r in rows)
    sod = sum(r.total_sodium_mg or 0 for r in rows)
    sat = sum(r.total_saturated_fat_g or 0 for r in rows)
    sug = sum(r.total_added_sugars_g or 0 for r in rows)

    # Targets vs actual. Each component is 0–25.
    body_kg = user.weight_kg or 70.0
    pro_target = max(50.0, body_kg * 0.8)         # ≥0.8 g/kg
    fib_target = 28.0                              # daily reference
    sod_cap = 2300.0
    sat_cap = 20.0
    sug_cap = 50.0

    pro_score = min(25.0, (pro / pro_target) * 25.0) if pro_target else 0
    fib_score = min(25.0, (fib / fib_target) * 25.0)
    sod_score = max(0.0, 25.0 - max(0.0, sod - sod_cap) / sod_cap * 25.0)
    sat_score = max(0.0, 25.0 - max(0.0, sat - sat_cap) / sat_cap * 25.0)
    # Weight the four; sugars cap it.
    raw = pro_score + fib_score + (sod_score * 0.5) + (sat_score * 0.5)
    sugar_penalty = min(15.0, max(0.0, sug - sug_cap) / max(sug_cap, 1.0) * 15.0)
    score = max(0, min(100, round(raw - sugar_penalty)))
    return int(score), {
        "calories": cal,
        "protein_g": round(pro, 1),
        "fiber_g": round(fib, 1),
        "sodium_mg": round(sod, 1),
        "saturated_fat_g": round(sat, 1),
        "added_sugars_g": round(sug, 1),
        "protein_target_g": round(pro_target, 1),
    }


# ---------- steps (manual entry; stub for future Google Fit/Apple Health sync) ----------

@router.post("/steps", response_model=StepsDayOut)
def set_steps(body: StepsUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    target = body.for_date or _local_today_iso(body.tz_offset)
    entry = db.query(StepsEntry).filter(
        StepsEntry.user_id == user.id, StepsEntry.recorded_for == target
    ).first()
    if entry:
        entry.steps = body.steps
    else:
        entry = StepsEntry(user_id=user.id, steps=body.steps, recorded_for=target)
        db.add(entry)
    db.commit()
    return StepsDayOut(date=target, steps=body.steps)


@router.get("/steps", response_model=StepsDayOut)
def get_steps(tz_offset: int = Query(0, alias="tz"), user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    target = _local_today_iso(tz_offset)
    entry = db.query(StepsEntry).filter(
        StepsEntry.user_id == user.id, StepsEntry.recorded_for == target
    ).first()
    return StepsDayOut(date=target, steps=entry.steps if entry else 0)
