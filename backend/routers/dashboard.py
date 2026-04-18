from collections import defaultdict
from datetime import date, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from database import get_db
from datetimeutil import utc_day_range, utc_today
from deps import get_current_user
from models import FoodLogEntry, User
from routers.logs import _deserialize_items, _entry_to_out
from schemas import (
    BreakdownOut,
    CalendarDayOut,
    CalendarRangeOut,
    CaloriesBreakdown,
    DashboardTodayOut,
    MacroDetail,
    MacrosBreakdown,
    MealBreakdown,
    WeeklyDashboardOut,
    WeeklyDayOut,
)

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

FDA_DV_FAT_G = 78.0
FDA_DV_SAT_FAT_G = 20.0
FDA_DV_CHOLESTEROL_MG = 300.0
FDA_DV_SODIUM_MG = 2300.0
FDA_DV_CARBS_G = 275.0
FDA_DV_FIBER_G = 28.0
FDA_DV_ADDED_SUGARS_G = 50.0
FDA_DV_PROTEIN_G = 50.0


@router.get("/today", response_model=DashboardTodayOut)
def dashboard_today(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    today = utc_today()
    start, end = utc_day_range(today)
    entries = (
        db.query(FoodLogEntry)
        .filter(
            FoodLogEntry.user_id == user.id,
            FoodLogEntry.created_at >= start,
            FoodLogEntry.created_at < end,
        )
        .order_by(FoodLogEntry.created_at.desc())
        .all()
    )
    consumed = sum(e.total_calories for e in entries)
    protein = sum(e.total_protein_g for e in entries)
    carbs = sum(e.total_carbs_g for e in entries)
    fat = sum(e.total_fat_g for e in entries)
    goal = user.daily_calorie_goal
    remaining = (goal - consumed) if goal is not None else None
    return DashboardTodayOut(
        date=today.isoformat(),
        daily_calorie_goal=goal,
        consumed_calories=consumed,
        remaining_calories=remaining,
        total_protein_g=protein,
        total_carbs_g=carbs,
        total_fat_g=fat,
        recent_entries=[_entry_to_out(e) for e in entries[:20]],
    )


@router.get("/weekly", response_model=WeeklyDashboardOut)
def dashboard_weekly(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    today = utc_today()
    days: list[WeeklyDayOut] = []
    for i in range(6, -1, -1):
        d = today - timedelta(days=i)
        start, end = utc_day_range(d)
        rows = (
            db.query(FoodLogEntry)
            .filter(
                FoodLogEntry.user_id == user.id,
                FoodLogEntry.created_at >= start,
                FoodLogEntry.created_at < end,
            )
            .all()
        )
        consumed = sum(r.total_calories for r in rows)
        days.append(
            WeeklyDayOut(
                date=d.isoformat(),
                consumed_calories=consumed,
                goal=user.daily_calorie_goal,
            )
        )
    return WeeklyDashboardOut(days=days)


@router.get("/calendar", response_model=CalendarRangeOut)
def dashboard_calendar(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    from_date: date | None = Query(None, alias="from"),
    to_date: date | None = Query(None, alias="to"),
    tz_offset: int = Query(0, alias="tz"),
):
    today = utc_today()
    end = to_date or today
    start_d = from_date or (end - timedelta(days=29))
    if end > today:
        end = today
    if start_d > end:
        start_d = end

    start_dt, _ = utc_day_range(start_d, tz_offset)
    _, end_dt = utc_day_range(end, tz_offset)
    rows = (
        db.query(FoodLogEntry)
        .filter(
            FoodLogEntry.user_id == user.id,
            FoodLogEntry.created_at >= start_dt,
            FoodLogEntry.created_at < end_dt,
        )
        .all()
    )

    buckets: dict[str, dict] = {}
    for r in rows:
        local_dt = r.created_at - timedelta(minutes=tz_offset)
        key = local_dt.date().isoformat()
        b = buckets.setdefault(key, {"cal": 0, "p": 0.0, "c": 0.0, "f": 0.0, "n": 0})
        b["cal"] += r.total_calories or 0
        b["p"] += r.total_protein_g or 0.0
        b["c"] += r.total_carbs_g or 0.0
        b["f"] += r.total_fat_g or 0.0
        b["n"] += 1

    days = [
        CalendarDayOut(
            date=k,
            consumed_calories=v["cal"],
            total_protein_g=round(v["p"], 1),
            total_carbs_g=round(v["c"], 1),
            total_fat_g=round(v["f"], 1),
            entries_count=v["n"],
        )
        for k, v in sorted(buckets.items())
    ]
    return CalendarRangeOut(from_date=start_d.isoformat(), to_date=end.isoformat(), days=days)


@router.get("/breakdown", response_model=BreakdownOut)
def dashboard_breakdown(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    date_param: date | None = Query(None, alias="date"),
    range_param: str = Query("daily", alias="range"),
    tz_offset: int = Query(0, alias="tz"),
):
    target = date_param or utc_today()

    if range_param == "weekly":
        first_day = target - timedelta(days=6)
        start, _ = utc_day_range(first_day, tz_offset)
        _, end = utc_day_range(target, tz_offset)
    else:
        start, end = utc_day_range(target, tz_offset)

    entries = (
        db.query(FoodLogEntry)
        .filter(
            FoodLogEntry.user_id == user.id,
            FoodLogEntry.created_at >= start,
            FoodLogEntry.created_at < end,
        )
        .all()
    )

    total_cal = sum(e.total_calories or 0 for e in entries)
    total_fat = sum(e.total_fat_g or 0.0 for e in entries)
    total_sat_fat = sum(e.total_saturated_fat_g or 0.0 for e in entries)
    total_chol = sum(e.total_cholesterol_mg or 0.0 for e in entries)
    total_sodium = sum(e.total_sodium_mg or 0.0 for e in entries)
    total_carbs = sum(e.total_carbs_g or 0.0 for e in entries)
    total_fiber = sum(e.total_fiber_g or 0.0 for e in entries)
    total_sugars = sum(e.total_sugars_g or 0.0 for e in entries)
    total_added_sugars = sum(e.total_added_sugars_g or 0.0 for e in entries)
    total_protein = sum(e.total_protein_g or 0.0 for e in entries)

    budget = user.daily_calorie_goal
    if range_param == "weekly" and budget is not None:
        budget = budget * 7
    consumed = total_cal
    burned = 0
    net = consumed - burned
    delta = (budget - net) if budget is not None else None
    state = None
    if delta is not None:
        state = "under" if delta >= 0 else "over"

    calories = CaloriesBreakdown(
        consumed=consumed, burned=burned, net=net,
        budget=budget, delta=delta, state=state,
    )

    macros = MacrosBreakdown(
        fat=MacroDetail(grams=total_fat, pct_dv=round(total_fat / FDA_DV_FAT_G * 100)),
        saturated_fat=MacroDetail(grams=total_sat_fat, pct_dv=round(total_sat_fat / FDA_DV_SAT_FAT_G * 100)),
        cholesterol=MacroDetail(mg=total_chol, pct_dv=round(total_chol / FDA_DV_CHOLESTEROL_MG * 100)),
        sodium=MacroDetail(mg=total_sodium, pct_dv=round(total_sodium / FDA_DV_SODIUM_MG * 100)),
        carbs=MacroDetail(grams=total_carbs, pct_dv=round(total_carbs / FDA_DV_CARBS_G * 100)),
        fiber=MacroDetail(grams=total_fiber, pct_dv=round(total_fiber / FDA_DV_FIBER_G * 100)),
        sugars=MacroDetail(grams=total_sugars, pct_dv=None),
        added_sugars=MacroDetail(grams=total_added_sugars, pct_dv=round(total_added_sugars / FDA_DV_ADDED_SUGARS_G * 100)),
        protein=MacroDetail(grams=total_protein, pct_dv=round(total_protein / FDA_DV_PROTEIN_G * 100)),
    )

    grouped: dict[str, list[FoodLogEntry]] = defaultdict(list)
    for e in entries:
        grouped[e.meal_type].append(e)

    meals: dict[str, MealBreakdown] = {}
    for meal_type in ["breakfast", "lunch", "dinner", "snack"]:
        meal_entries = grouped.get(meal_type, [])
        meal_cal = sum(e.total_calories or 0 for e in meal_entries)
        items = []
        for e in meal_entries:
            items.extend(_deserialize_items(e.items_json))
        key = "snacks" if meal_type == "snack" else meal_type
        suggested = None
        if key == "snacks":
            daily_budget = user.daily_calorie_goal
            suggested = max(0, (daily_budget - consumed) // 4) if daily_budget else 0
        meals[key] = MealBreakdown(calories=meal_cal, items=items, suggested_calories=suggested)

    return BreakdownOut(
        date=target.isoformat(),
        range=range_param,
        calories=calories,
        macros=macros,
        meals=meals,
    )
