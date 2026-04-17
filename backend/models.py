from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True)
    hashed_password = Column(String(255))
    daily_calorie_goal = Column(Integer, nullable=True)
    onboarding_completed = Column(Boolean, default=False)
    token_version = Column(Integer, default=0)

    entries = relationship("FoodLogEntry", back_populates="user", cascade="all, delete-orphan")


class FoodLogEntry(Base):
    __tablename__ = "food_log_entries"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    meal_type = Column(String(32))
    description_text = Column(Text, default="")
    items_json = Column(Text, default="[]")
    parse_confidence = Column(Float, nullable=True)
    total_calories = Column(Integer, default=0)
    total_protein_g = Column(Float, default=0.0)
    total_carbs_g = Column(Float, default=0.0)
    total_fat_g = Column(Float, default=0.0)
    total_saturated_fat_g = Column(Float, default=0.0)
    total_cholesterol_mg = Column(Float, default=0.0)
    total_sodium_mg = Column(Float, default=0.0)
    total_fiber_g = Column(Float, default=0.0)
    total_sugars_g = Column(Float, default=0.0)
    total_added_sugars_g = Column(Float, default=0.0)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="entries")
