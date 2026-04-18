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
    role = Column(String(32), default="user", nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    # Profile
    sex = Column(String(16), nullable=True)            # male/female/other
    date_of_birth = Column(String(10), nullable=True)  # YYYY-MM-DD
    height_cm = Column(Float, nullable=True)
    weight_kg = Column(Float, nullable=True)
    activity_level = Column(String(32), nullable=True)  # sedentary/light/moderate/active/very_active
    fitness_goal = Column(String(32), nullable=True)    # lose/maintain/gain/recomp
    dietary_restrictions = Column(Text, default="[]")   # JSON array of strings
    allergies = Column(Text, default="[]")              # JSON array
    dislikes = Column(Text, default="[]")               # JSON array
    notes = Column(Text, default="")                    # free-text preferences
    use_metric = Column(Boolean, default=True, nullable=False)
    favorite_foods = Column(Text, default="[]")          # JSON array of food names
    fast_start = Column(DateTime, nullable=True)         # active fast started at
    fast_target_hours = Column(Float, nullable=True)     # current fast target
    water_goal_cups = Column(Integer, default=8, nullable=False)

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


class WeightEntry(Base):
    __tablename__ = "weight_entries"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    weight_kg = Column(Float, nullable=False)
    recorded_for = Column(String(10), nullable=False)  # YYYY-MM-DD local
    created_at = Column(DateTime, default=datetime.utcnow)


class WaterEntry(Base):
    __tablename__ = "water_entries"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    cups = Column(Integer, nullable=False, default=1)
    recorded_for = Column(String(10), nullable=False)  # YYYY-MM-DD local
    created_at = Column(DateTime, default=datetime.utcnow)


class FoodItemsCache(Base):
    __tablename__ = "food_items_cache"

    id = Column(Integer, primary_key=True, index=True)
    normalized_name = Column(String(255), unique=True, index=True, nullable=False)
    fdc_id = Column(Integer, nullable=True)
    calories_per100g = Column(Integer, default=0)
    protein_g_per100g = Column(Float, default=0.0)
    carbs_g_per100g = Column(Float, default=0.0)
    fat_g_per100g = Column(Float, default=0.0)
    saturated_fat_g_per100g = Column(Float, default=0.0)
    cholesterol_mg_per100g = Column(Float, default=0.0)
    sodium_mg_per100g = Column(Float, default=0.0)
    fiber_g_per100g = Column(Float, default=0.0)
    sugars_g_per100g = Column(Float, default=0.0)
    added_sugars_g_per100g = Column(Float, default=0.0)
    # JSON of {micro_key: amount_per_100g} — vitamins/minerals (see services/nutrition._MICRO_IDS)
    micros_json = Column(Text, default="{}", nullable=False)
    # Optional: universal product code (GTIN/UPC) for barcode lookup
    barcode = Column(String(32), nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class StepsEntry(Base):
    __tablename__ = "steps_entries"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    steps = Column(Integer, nullable=False, default=0)
    recorded_for = Column(String(10), nullable=False)  # YYYY-MM-DD local
    created_at = Column(DateTime, default=datetime.utcnow)
