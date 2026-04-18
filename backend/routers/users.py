import json
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from datetimeutil import utc_today
from deps import get_current_user
from models import FoodLogEntry, User, WeightEntry
from schemas import AdaptiveTargetOut, UserOut, UserUpdate

router = APIRouter(prefix="/users", tags=["users"])

LIST_FIELDS = ("dietary_restrictions", "allergies", "dislikes")


def _parse_list(raw: str | None) -> list[str]:
    if not raw:
        return []
    try:
        v = json.loads(raw)
        return [str(x) for x in v] if isinstance(v, list) else []
    except json.JSONDecodeError:
        return []


def _compute_bmi(height_cm: float | None, weight_kg: float | None) -> float | None:
    if not height_cm or not weight_kg or height_cm <= 0:
        return None
    h_m = height_cm / 100.0
    return round(weight_kg / (h_m * h_m), 1)


def _to_out(user: User) -> UserOut:
    return UserOut(
        id=user.id,
        email=user.email,
        daily_calorie_goal=user.daily_calorie_goal,
        onboarding_completed=user.onboarding_completed,
        role=user.role or "user",
        sex=user.sex,
        date_of_birth=user.date_of_birth,
        height_cm=user.height_cm,
        weight_kg=user.weight_kg,
        activity_level=user.activity_level,
        fitness_goal=user.fitness_goal,
        dietary_restrictions=_parse_list(user.dietary_restrictions),
        allergies=_parse_list(user.allergies),
        dislikes=_parse_list(user.dislikes),
        notes=user.notes or "",
        bmi=_compute_bmi(user.height_cm, user.weight_kg),
        use_metric=bool(user.use_metric) if user.use_metric is not None else True,
        water_goal_cups=int(user.water_goal_cups) if user.water_goal_cups else 8,
    )


@router.get("/me", response_model=UserOut)
def get_profile(user: User = Depends(get_current_user)):
    return _to_out(user)


@router.patch("/me", response_model=UserOut)
def update_profile(
    body: UserUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    data = body.model_dump(exclude_unset=True)
    for field, value in data.items():
        if field in LIST_FIELDS:
            setattr(user, field, json.dumps([str(x).strip() for x in (value or []) if str(x).strip()]))
        else:
            setattr(user, field, value)
    db.add(user)
    db.commit()
    db.refresh(user)
    return _to_out(user)


# ---------- adaptive calorie target ----------
# Mifflin-St Jeor BMR + activity multiplier, then adjust by observed 14-day weight trend.

_ACTIVITY_MULT = {
    "sedentary": 1.2,
    "light":     1.375,
    "moderate":  1.55,
    "active":    1.725,
    "very_active": 1.9,
}


def _age_from_dob(dob_str: str | None) -> int | None:
    if not dob_str:
        return None
    try:
        dob = date.fromisoformat(dob_str)
    except ValueError:
        return None
    today = utc_today()
    years = today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
    return years if years > 0 else None


def _mifflin_bmr(sex: str | None, weight_kg: float | None, height_cm: float | None, age: int | None) -> float | None:
    if not all([weight_kg, height_cm, age]):
        return None
    if sex == "male":
        offset = 5
    elif sex == "female":
        offset = -161
    else:
        offset = -78  # average of male/female offsets
    return 10 * weight_kg + 6.25 * height_cm - 5 * age + offset


def _tdee_for(user: User) -> int | None:
    bmr = _mifflin_bmr(user.sex, user.weight_kg, user.height_cm, _age_from_dob(user.date_of_birth))
    if bmr is None:
        return None
    mult = _ACTIVITY_MULT.get(user.activity_level or "moderate", 1.55)
    return int(round(bmr * mult))


@router.get("/me/adaptive-target", response_model=AdaptiveTargetOut)
def adaptive_target(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    tdee = _tdee_for(user)

    # Average daily logged kcal over last 14 days
    cutoff = datetime.utcnow() - timedelta(days=14)
    rows = (
        db.query(FoodLogEntry.total_calories, FoodLogEntry.created_at)
        .filter(FoodLogEntry.user_id == user.id, FoodLogEntry.created_at >= cutoff)
        .all()
    )
    if rows:
        # Group by day to avoid over-weighting days with many entries
        by_day: dict[str, int] = {}
        for cal, created in rows:
            k = created.date().isoformat()
            by_day[k] = by_day.get(k, 0) + int(cal or 0)
        avg_logged = int(round(sum(by_day.values()) / max(len(by_day), 1)))
    else:
        avg_logged = None

    # Weight trend: kg per week over the last 4 weeks
    weight_cutoff = (utc_today() - timedelta(days=28)).isoformat()
    weights = (
        db.query(WeightEntry)
        .filter(WeightEntry.user_id == user.id, WeightEntry.recorded_for >= weight_cutoff)
        .order_by(WeightEntry.recorded_for.asc())
        .all()
    )
    trend_kg_per_week: float | None = None
    if len(weights) >= 2:
        first, last = weights[0], weights[-1]
        try:
            days = (date.fromisoformat(last.recorded_for) - date.fromisoformat(first.recorded_for)).days
        except ValueError:
            days = 0
        if days > 0:
            trend_kg_per_week = round((last.weight_kg - first.weight_kg) / days * 7, 2)

    # Fitness-goal-aware target
    goal = (user.fitness_goal or "maintain").lower()
    target_delta = {"lose": -500, "gain": 300, "recomp": -200, "maintain": 0}.get(goal, 0)

    if tdee is None:
        # No profile info yet — fall back to current goal or a reasonable default
        suggested = user.daily_calorie_goal or 2000
        reason = "Profile incomplete — set height, weight, age, sex, and activity to get adaptive targets."
        baseline = None
    else:
        suggested = tdee + target_delta
        reason_parts = [f"Baseline TDEE {tdee} kcal"]
        if target_delta:
            reason_parts.append(f"goal '{goal}' adjusts {target_delta:+d}")

        # Nudge based on observed weight trend
        if trend_kg_per_week is not None and goal != "maintain":
            if goal == "lose" and trend_kg_per_week > -0.2:
                suggested -= 150
                reason_parts.append("weight trend flat — lowering 150 kcal")
            elif goal == "lose" and trend_kg_per_week < -0.9:
                suggested += 100
                reason_parts.append("losing faster than safe — adding 100 kcal")
            elif goal == "gain" and trend_kg_per_week < 0.1:
                suggested += 150
                reason_parts.append("not gaining — adding 150 kcal")

        reason = "; ".join(reason_parts)
        baseline = tdee

    suggested = max(1200, min(suggested, 5000))
    return AdaptiveTargetOut(
        suggested_calories=int(suggested),
        current_goal=user.daily_calorie_goal,
        reason=reason,
        baseline_tdee=baseline,
        weight_trend_kg_per_week=trend_kg_per_week,
        avg_logged_calories=avg_logged,
    )
