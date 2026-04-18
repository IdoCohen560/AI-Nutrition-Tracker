from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from deps import get_admin_user
from models import User

router = APIRouter(prefix="/admin", tags=["admin"])

SUPER_ADMIN_EMAIL = "ido.the.cohen@gmail.com"
ALLOWED_ROLES = {"user", "admin"}


class AdminUserOut(BaseModel):
    id: int
    email: str
    role: str = "user"
    onboarding_completed: bool = False
    created_at: str | None = None

    model_config = {"from_attributes": True}


class RoleUpdate(BaseModel):
    role: str


@router.get("/users", response_model=list[AdminUserOut])
def list_users(_: User = Depends(get_admin_user), db: Session = Depends(get_db)):
    rows = db.query(User).order_by(User.id.desc()).all()
    return [
        AdminUserOut(
            id=u.id,
            email=u.email or "",
            role=u.role or "user",
            onboarding_completed=bool(u.onboarding_completed),
            created_at=u.created_at.isoformat() if u.created_at else None,
        )
        for u in rows
    ]


@router.patch("/users/{user_id}/role", response_model=AdminUserOut)
def set_role(
    user_id: int,
    body: RoleUpdate,
    actor: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    if body.role not in ALLOWED_ROLES:
        raise HTTPException(status_code=400, detail=f"Role must be one of {sorted(ALLOWED_ROLES)}")
    target = db.get(User, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.role == "super_admin" or (target.email or "").lower() == SUPER_ADMIN_EMAIL:
        raise HTTPException(status_code=403, detail="Cannot modify super admin")
    if target.id == actor.id:
        raise HTTPException(status_code=400, detail="You cannot change your own role")
    target.role = body.role
    target.token_version = (target.token_version or 0) + 1
    db.commit()
    db.refresh(target)
    return target
