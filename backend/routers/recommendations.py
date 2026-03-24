from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from deps import get_current_user
from models import User
from schemas import RecommendationsOut
from services.recommendations_engine import build_recommendations, get_cached_recommendations

router = APIRouter(prefix="/recommendations", tags=["recommendations"])


@router.get("", response_model=RecommendationsOut)
def get_recommendations(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        return build_recommendations(db, user)
    except Exception:
        cached = get_cached_recommendations(user.id)
        if cached:
            return RecommendationsOut(
                items=cached.items,
                remaining_calories=cached.remaining_calories,
                mode="cached",
            )
        raise HTTPException(
            status_code=503,
            detail="Recommendations temporarily unavailable. Try again later.",
        )
