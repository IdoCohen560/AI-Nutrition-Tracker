from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from deps import get_current_user
from models import User
from schemas import UserOut, UserUpdate

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserOut)
def get_profile(user: User = Depends(get_current_user)):
    return user


@router.patch("/me", response_model=UserOut)
def update_profile(
    body: UserUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if body.daily_calorie_goal is not None:
        user.daily_calorie_goal = body.daily_calorie_goal
    if body.onboarding_completed is not None:
        user.onboarding_completed = body.onboarding_completed
    db.add(user)
    db.commit()
    db.refresh(user)
    return user
