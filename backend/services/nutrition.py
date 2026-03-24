import httpx

from config import settings
from schemas import FoodItemOut

# Rough defaults when no API (kcal per typical serving label)
_KEYWORD_DEFAULTS: dict[str, tuple[int, float, float, float]] = {
    "egg": (78, 6.3, 0.6, 5.3),
    "eggs": (78, 6.3, 0.6, 5.3),
    "toast": (80, 3.0, 14.0, 1.0),
    "bread": (80, 3.0, 14.0, 1.0),
    "chicken": (231, 43.5, 0.0, 5.0),
    "rice": (200, 4.0, 45.0, 0.5),
    "apple": (95, 0.5, 25.0, 0.3),
    "banana": (105, 1.3, 27.0, 0.4),
    "coffee": (5, 0.3, 0.0, 0.0),
    "milk": (150, 8.0, 12.0, 8.0),
    "yogurt": (150, 12.0, 17.0, 4.0),
    "salad": (50, 3.0, 8.0, 1.5),
    "pizza": (285, 12.0, 36.0, 10.0),
    "burger": (540, 25.0, 40.0, 30.0),
    "oatmeal": (150, 5.0, 27.0, 3.0),
    "water": (0, 0.0, 0.0, 0.0),
}


def _default_for_name(name: str) -> FoodItemOut:
    lower = name.lower()
    for key, (cal, p, c, f) in _KEYWORD_DEFAULTS.items():
        if key in lower:
            return FoodItemOut(
                name=name.strip() or key,
                quantity=None,
                calories=cal,
                protein_g=p,
                carbs_g=c,
                fat_g=f,
            )
    return FoodItemOut(
        name=name.strip() or "food",
        quantity=None,
        calories=120,
        protein_g=5.0,
        carbs_g=15.0,
        fat_g=4.0,
    )


async def lookup_usda(query: str) -> FoodItemOut | None:
    if not settings.usda_api_key:
        return None
    url = "https://api.nal.usda.gov/fdc/v1/foods/search"
    params = {"query": query, "pageSize": 1, "api_key": settings.usda_api_key}
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            r = await client.get(url, params=params)
            r.raise_for_status()
            data = r.json()
            foods = data.get("foods") or []
            if not foods:
                return None
            f0 = foods[0]
            desc = f0.get("description", query)
            nutrients = {n["nutrientId"]: n["value"] for n in f0.get("foodNutrients", [])}
            # Common FDC nutrient ids: 1008 energy, 1003 protein, 1005 carb, 1004 fat (per 100g)
            cal = int(nutrients.get(1008, 100) or 100)
            protein = float(nutrients.get(1003, 5) or 5)
            carbs = float(nutrients.get(1005, 15) or 15)
            fat = float(nutrients.get(1004, 5) or 5)
            return FoodItemOut(
                name=desc[:120],
                quantity="per 100g (approx)",
                calories=max(cal, 0),
                protein_g=protein,
                carbs_g=carbs,
                fat_g=fat,
            )
    except Exception:
        return None


async def enrich_item(name: str, quantity: str | None) -> tuple[FoodItemOut, bool]:
    """
    Returns (FoodItemOut, from_api) — from_api False means heuristic/default used (UC-1 E2 path).
    """
    usda = await lookup_usda(name)
    if usda:
        if quantity:
            usda = usda.model_copy(update={"quantity": quantity})
        return usda, True
    base = _default_for_name(name)
    if quantity:
        base = base.model_copy(update={"quantity": quantity})
    return base, False
