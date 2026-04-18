import json

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from deps import get_current_user
from models import User
from schemas import UserOut, UserUpdate

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
