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
    role: str = "user"
    sex: str | None = None
    date_of_birth: str | None = None
    height_cm: float | None = None
    weight_kg: float | None = None
    activity_level: str | None = None
    fitness_goal: str | None = None
    dietary_restrictions: list[str] = []
    allergies: list[str] = []
    dislikes: list[str] = []
    notes: str = ""
    bmi: float | None = None
    use_metric: bool = True
    water_goal_cups: int = 8

    model_config = {"from_attributes": True}


class UserUpdate(BaseModel):
    daily_calorie_goal: int | None = None
    onboarding_completed: bool | None = None
    sex: str | None = None
    date_of_birth: str | None = None
    height_cm: float | None = None
    weight_kg: float | None = None
    activity_level: str | None = None
    fitness_goal: str | None = None
    dietary_restrictions: list[str] | None = None
    allergies: list[str] | None = None
    dislikes: list[str] | None = None
    notes: str | None = None
    use_metric: bool | None = None
    water_goal_cups: int | None = None

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
    # Optional micronutrients scaled to this item's portion.
    # Keys use convention "<name>_<unit>" e.g. "vitamin_c_mg", "calcium_mg", "folate_mcg".
    micros: dict[str, float] | None = None


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


class MicroDetail(BaseModel):
    label: str
    amount: float
    unit: str
    dv_amount: float | None = None
    pct_dv: int | None = None


class MealBreakdown(BaseModel):
    calories: int
    items: list[FoodItemOut]
    suggested_calories: int | None = None


class BreakdownOut(BaseModel):
    date: str
    range: str
    calories: CaloriesBreakdown
    macros: MacrosBreakdown
    micros: list[MicroDetail] = []
    meals: dict[str, MealBreakdown]


class BarcodeLookupOut(BaseModel):
    found: bool
    item: FoodItemOut | None = None


class RecipeImportRequest(BaseModel):
    url: str = Field(min_length=6, max_length=2000)


class RecipeImportResponse(BaseModel):
    found: bool
    title: str | None = None
    items: list[FoodItemOut] = []
    nutrition_warnings: list[str] = []
    error: str | None = None


class AdaptiveTargetOut(BaseModel):
    suggested_calories: int
    current_goal: int | None
    reason: str
    baseline_tdee: int | None
    weight_trend_kg_per_week: float | None
    avg_logged_calories: int | None


class StepsDayOut(BaseModel):
    date: str
    steps: int


class StepsUpdate(BaseModel):
    steps: int = Field(ge=0, le=200_000)
    for_date: str | None = None
    tz_offset: int = 0


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
