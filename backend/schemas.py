from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator

MealType = Literal["breakfast", "lunch", "dinner", "snack"]


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    id: int
    email: str
    daily_calorie_goal: int | None
    onboarding_completed: bool

    model_config = {"from_attributes": True}


class UserUpdate(BaseModel):
    daily_calorie_goal: int | None = None
    onboarding_completed: bool | None = None

    @field_validator("daily_calorie_goal")
    @classmethod
    def goal_range(cls, v: int | None) -> int | None:
        if v is None:
            return v
        if v < 500 or v > 10_000:
            raise ValueError("Daily calorie goal must be between 500 and 10,000")
        return v


class FoodItemOut(BaseModel):
    name: str
    quantity: str | None = None
    calories: int
    protein_g: float
    carbs_g: float
    fat_g: float
    saturated_fat_g: float = 0.0
    cholesterol_mg: float = 0.0
    sodium_mg: float = 0.0
    fiber_g: float = 0.0
    sugars_g: float = 0.0
    added_sugars_g: float = 0.0


class ParseLogRequest(BaseModel):
    text: str = Field(min_length=1, max_length=4000)
    meal_type: MealType


class ParseLogResponse(BaseModel):
    items: list[FoodItemOut]
    parse_confidence: float
    requires_confirmation: bool
    nlp_error: str | None = None
    nutrition_warnings: list[str] = []


class CreateLogRequest(BaseModel):
    meal_type: MealType
    description_text: str
    items: list[FoodItemOut]
    parse_confidence: float | None = None
    confirmed: bool = False
    for_date: str | None = None  # YYYY-MM-DD in user's local tz
    tz_offset: int = 0  # JS getTimezoneOffset() minutes


class FoodLogEntryOut(BaseModel):
    id: int
    meal_type: str
    description_text: str
    items: list[FoodItemOut]
    parse_confidence: float | None
    total_calories: int
    total_protein_g: float
    total_carbs_g: float
    total_fat_g: float
    total_saturated_fat_g: float = 0.0
    total_cholesterol_mg: float = 0.0
    total_sodium_mg: float = 0.0
    total_fiber_g: float = 0.0
    total_sugars_g: float = 0.0
    total_added_sugars_g: float = 0.0
    created_at: datetime

    model_config = {"from_attributes": True}


class FoodLogEntryUpdate(BaseModel):
    meal_type: MealType | None = None
    description_text: str | None = None
    items: list[FoodItemOut] | None = None


class DashboardTodayOut(BaseModel):
    date: str
    daily_calorie_goal: int | None
    consumed_calories: int
    remaining_calories: int | None
    total_protein_g: float
    total_carbs_g: float
    total_fat_g: float
    recent_entries: list[FoodLogEntryOut]


class WeeklyDayOut(BaseModel):
    date: str
    consumed_calories: int
    goal: int | None


class WeeklyDashboardOut(BaseModel):
    days: list[WeeklyDayOut]


class CalendarDayOut(BaseModel):
    date: str
    consumed_calories: int
    total_protein_g: float
    total_carbs_g: float
    total_fat_g: float
    entries_count: int


class CalendarRangeOut(BaseModel):
    from_date: str
    to_date: str
    days: list[CalendarDayOut]


class RecommendationItemOut(BaseModel):
    food_name: str
    estimated_calories: int
    protein_g: float
    carbs_g: float
    fat_g: float
    reason: str


class RecommendationsOut(BaseModel):
    items: list[RecommendationItemOut]
    remaining_calories: int
    mode: Literal["normal", "no_budget", "fallback", "cached"]


class CaloriesBreakdown(BaseModel):
    consumed: int
    burned: int
    net: int
    budget: int | None
    delta: int | None
    state: str | None


class MacroDetail(BaseModel):
    grams: float | None = None
    mg: float | None = None
    pct_dv: int | None = None


class MacrosBreakdown(BaseModel):
    fat: MacroDetail
    saturated_fat: MacroDetail
    cholesterol: MacroDetail
    sodium: MacroDetail
    carbs: MacroDetail
    fiber: MacroDetail
    sugars: MacroDetail
    added_sugars: MacroDetail
    protein: MacroDetail


class MealBreakdown(BaseModel):
    calories: int
    items: list[FoodItemOut]
    suggested_calories: int | None = None


class BreakdownOut(BaseModel):
    date: str
    range: str
    calories: CaloriesBreakdown
    macros: MacrosBreakdown
    meals: dict[str, MealBreakdown]


class QuickLogFromRecRequest(BaseModel):
    food_name: str
    estimated_calories: int
    protein_g: float = 0.0
    carbs_g: float = 0.0
    fat_g: float = 0.0
    saturated_fat_g: float = 0.0
    cholesterol_mg: float = 0.0
    sodium_mg: float = 0.0
    fiber_g: float = 0.0
    sugars_g: float = 0.0
    added_sugars_g: float = 0.0
    meal_type: MealType = "snack"
