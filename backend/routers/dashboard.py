from datetime import timedelta

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from datetimeutil import utc_day_range, utc_today
from deps import get_current_user
from models import FoodLogEntry, User
from routers.logs import _entry_to_out
from schemas import DashboardTodayOut, WeeklyDashboardOut, WeeklyDayOut

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


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
