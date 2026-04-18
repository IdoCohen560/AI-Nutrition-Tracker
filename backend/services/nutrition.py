import json
import logging
import re

import httpx
from sqlalchemy.orm import Session

from config import settings
from models import FoodItemsCache
from schemas import FoodItemOut

logger = logging.getLogger(__name__)

# Micronutrient USDA nutrient IDs → internal key.
# Units: all vitamins in mcg except vitamin C/E in mg; minerals in mg (except selenium mcg — omitted for simplicity).
_MICRO_IDS: dict[str, int] = {
    "vitamin_a_mcg":   1106,   # Vitamin A, RAE
    "vitamin_c_mg":    1162,
    "vitamin_d_mcg":   1114,
    "vitamin_e_mg":    1109,
    "vitamin_k_mcg":   1185,
    "thiamin_mg":      1165,   # B1
    "riboflavin_mg":   1166,   # B2
    "niacin_mg":       1167,   # B3
    "vitamin_b6_mg":   1175,
    "folate_mcg":      1177,
    "vitamin_b12_mcg": 1178,
    "calcium_mg":      1087,
    "iron_mg":         1089,
    "magnesium_mg":    1090,
    "potassium_mg":    1092,
    "zinc_mg":         1095,
}

# All nutrition values below are PER 100 GRAMS (USDA convention).
# Tuple: (cal, protein_g, carbs_g, fat_g, sat_fat_g, chol_mg, sodium_mg, fiber_g, sugars_g, added_sugars_g)
_KEYWORD_PER100G: dict[str, tuple[float, float, float, float, float, float, float, float, float, float]] = {
    "egg":     (143, 12.6, 0.7, 9.5, 3.1, 372.0, 142.0, 0.0, 0.4, 0.0),
    "eggs":    (143, 12.6, 0.7, 9.5, 3.1, 372.0, 142.0, 0.0, 0.4, 0.0),
    "toast":   (265, 9.0, 49.0, 3.2, 0.7, 0.0, 491.0, 2.4, 5.7, 0.0),
    "bread":   (265, 9.0, 49.0, 3.2, 0.7, 0.0, 491.0, 2.4, 5.7, 0.0),
    "chicken": (165, 31.0, 0.0, 3.6, 1.0, 85.0, 74.0, 0.0, 0.0, 0.0),
    "rice":    (130, 2.7, 28.0, 0.3, 0.1, 0.0, 1.0, 0.4, 0.1, 0.0),
    "apple":   (52, 0.3, 14.0, 0.2, 0.0, 0.0, 1.0, 2.4, 10.4, 0.0),
    "banana":  (89, 1.1, 23.0, 0.3, 0.1, 0.0, 1.0, 2.6, 12.2, 0.0),
    "coffee":  (2, 0.3, 0.0, 0.0, 0.0, 0.0, 2.0, 0.0, 0.0, 0.0),
    "milk":    (61, 3.2, 4.8, 3.3, 1.9, 10.0, 43.0, 0.0, 5.1, 0.0),
    "yogurt":  (61, 3.5, 4.7, 3.3, 2.1, 13.0, 46.0, 0.0, 4.7, 0.0),
    "salad":   (20, 1.4, 3.6, 0.2, 0.0, 0.0, 28.0, 1.8, 1.9, 0.0),
    "pizza":   (266, 11.0, 33.0, 10.0, 4.5, 17.0, 598.0, 2.3, 3.6, 0.0),
    "burger":  (254, 17.0, 14.0, 15.0, 5.6, 36.0, 396.0, 1.0, 3.5, 1.0),
    "oatmeal": (71, 2.5, 12.0, 1.5, 0.3, 0.0, 4.0, 1.7, 0.4, 0.0),
    "water":   (0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0),
}

# Typical serving size in grams — used when quantity is absent or count-based (1 egg, 1 slice).
_TYPICAL_SERVING_G: dict[str, float] = {
    "egg": 50, "eggs": 50,
    "toast": 30, "bread": 30,
    "chicken": 100,
    "rice": 158,       # 1 cup cooked
    "apple": 182,      # 1 medium
    "banana": 118,
    "coffee": 240,     # 1 cup
    "milk": 244,
    "yogurt": 245,
    "salad": 85,       # 1 cup greens
    "pizza": 107,      # 1 slice
    "burger": 226,
    "oatmeal": 234,    # 1 cup cooked
    "water": 240,
}

_GENERIC_PER100G = (120.0, 5.0, 15.0, 4.0, 1.0, 10.0, 100.0, 1.0, 2.0, 0.0)
_GENERIC_SERVING_G = 100.0

# Mass/volume unit → grams (rough). Volume assumes water-ish density unless food-specific cup weight is set.
_UNIT_TO_G: dict[str, float] = {
    "g": 1.0, "gram": 1.0, "grams": 1.0, "gm": 1.0,
    "kg": 1000.0, "kilogram": 1000.0, "kilograms": 1000.0,
    "mg": 0.001,
    "oz": 28.3495, "ounce": 28.3495, "ounces": 28.3495,
    "lb": 453.592, "lbs": 453.592, "pound": 453.592, "pounds": 453.592,
    "ml": 1.0, "milliliter": 1.0, "milliliters": 1.0,
    "l": 1000.0, "liter": 1000.0, "liters": 1000.0,
    "tbsp": 15.0, "tablespoon": 15.0, "tablespoons": 15.0,
    "tsp": 5.0, "teaspoon": 5.0, "teaspoons": 5.0,
}

# Food-specific cup weights (cooked/prepared). Fallback is 240g (water-ish).
_CUP_G_PER_FOOD: dict[str, float] = {
    "rice": 158, "oatmeal": 234, "milk": 244, "yogurt": 245,
    "coffee": 240, "water": 240, "salad": 85,
}

# Count-based units use per-food typical serving weight.
_COUNT_UNITS = {"slice", "slices", "piece", "pieces", "serving", "servings",
                "medium", "large", "small", "whole", "item", "items"}


def _normalize_name(name: str) -> str:
    return name.strip().lower()


def _keyword_hit(name: str) -> str | None:
    """Return the matching keyword from our per-100g table, or None."""
    lower = name.lower()
    for key in _KEYWORD_PER100G:
        if key in lower:
            return key
    return None


def _serving_grams_for(name: str) -> float:
    key = _keyword_hit(name)
    if key and key in _TYPICAL_SERVING_G:
        return _TYPICAL_SERVING_G[key]
    return _GENERIC_SERVING_G


def _cup_grams_for(name: str) -> float:
    key = _keyword_hit(name)
    if key and key in _CUP_G_PER_FOOD:
        return _CUP_G_PER_FOOD[key]
    return 240.0


def parse_quantity_to_grams(qty_str: str | None, name: str) -> float:
    """
    Convert a free-form quantity string ("2 cups", "3 eggs", "100g", "1 medium apple")
    into grams. If no quantity or unparseable, returns the typical serving weight for the food.
    """
    if not qty_str:
        return _serving_grams_for(name)
    q = str(qty_str).strip().lower()
    if not q:
        return _serving_grams_for(name)

    # Extract leading number (supports "1.5", "1/2", "half", "a"/"an")
    num_match = re.match(r"^\s*(\d+/\d+|\d+(?:\.\d+)?)\s*", q)
    if num_match:
        raw = num_match.group(1)
        if "/" in raw:
            a, b = raw.split("/", 1)
            try:
                count = float(a) / float(b) if float(b) else 1.0
            except ValueError:
                count = 1.0
        else:
            count = float(raw)
        rest = q[num_match.end():].strip()
    elif q.startswith(("half ", "a half ")):
        count = 0.5
        rest = re.sub(r"^(a\s+)?half\s+", "", q)
    elif q.startswith(("a ", "an ", "one ")):
        count = 1.0
        rest = re.sub(r"^(a|an|one)\s+", "", q)
    else:
        count = 1.0
        rest = q

    # Take the first word as unit candidate
    unit_match = re.match(r"^([a-z]+)", rest)
    unit = unit_match.group(1) if unit_match else ""

    # Mass / volume units
    if unit in _UNIT_TO_G:
        return count * _UNIT_TO_G[unit]
    # Cup is food-specific
    if unit in ("cup", "cups"):
        return count * _cup_grams_for(name)
    # Count units use typical serving
    if unit in _COUNT_UNITS or unit == "":
        return count * _serving_grams_for(name)
    # Unknown unit → treat as count
    return count * _serving_grams_for(name)


def _scale_per100g(per100: tuple, grams: float) -> tuple:
    factor = grams / 100.0
    return tuple(round(v * factor, 2) for v in per100)


def _scale_micros(micros_per100: dict, grams: float) -> dict:
    if not micros_per100:
        return {}
    factor = grams / 100.0
    return {k: round(float(v) * factor, 3) for k, v in micros_per100.items() if v is not None}


def _food_item_from_per100g(
    name: str,
    quantity: str | None,
    per100: tuple,
    grams: float,
    micros_per100: dict | None = None,
) -> FoodItemOut:
    cal, p, c, f, sf, chol, sod, fib, sug, asug = _scale_per100g(per100, grams)
    return FoodItemOut(
        name=name.strip() or "food",
        quantity=quantity or f"{grams:g}g",
        calories=int(round(cal)),
        protein_g=p,
        carbs_g=c,
        fat_g=f,
        saturated_fat_g=sf,
        cholesterol_mg=chol,
        sodium_mg=sod,
        fiber_g=fib,
        sugars_g=sug,
        added_sugars_g=asug,
        micros=_scale_micros(micros_per100 or {}, grams) or None,
    )


def _cache_per100g_tuple(cached: FoodItemsCache) -> tuple:
    return (
        float(cached.calories_per100g or 0),
        float(cached.protein_g_per100g or 0),
        float(cached.carbs_g_per100g or 0),
        float(cached.fat_g_per100g or 0),
        float(cached.saturated_fat_g_per100g or 0),
        float(cached.cholesterol_mg_per100g or 0),
        float(cached.sodium_mg_per100g or 0),
        float(cached.fiber_g_per100g or 0),
        float(cached.sugars_g_per100g or 0),
        float(cached.added_sugars_g_per100g or 0),
    )


def _cache_micros(cached: FoodItemsCache) -> dict:
    try:
        return json.loads(cached.micros_json or "{}") or {}
    except (json.JSONDecodeError, TypeError):
        return {}


async def lookup_usda_per100g(query: str, db: Session | None = None) -> tuple[tuple, str, dict] | None:
    """Returns (per100g_tuple, canonical_name, micros_per100g_dict) or None."""
    normalized = _normalize_name(query)

    if db is not None:
        cached = db.query(FoodItemsCache).filter(
            FoodItemsCache.normalized_name == normalized
        ).first()
        if cached:
            logger.info("USDA cache hit for '%s'", normalized)
            return _cache_per100g_tuple(cached), cached.normalized_name, _cache_micros(cached)

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
            per100 = (
                float(nutrients.get(1008, 100) or 100),
                float(nutrients.get(1003, 5) or 5),
                float(nutrients.get(1005, 15) or 15),
                float(nutrients.get(1004, 5) or 5),
                float(nutrients.get(1258, 0) or 0),
                float(nutrients.get(1253, 0) or 0),
                float(nutrients.get(1093, 0) or 0),
                float(nutrients.get(1079, 0) or 0),
                float(nutrients.get(1063, 0) or 0),
                float(nutrients.get(1235, 0) or 0),
            )
            micros = {
                key: float(nutrients[nid])
                for key, nid in _MICRO_IDS.items()
                if nid in nutrients and nutrients[nid] is not None
            }
            fdc_id = f0.get("fdcId")
            barcode = str(f0.get("gtinUpc") or "") or None

            if db is not None:
                try:
                    cache_entry = FoodItemsCache(
                        normalized_name=normalized,
                        fdc_id=fdc_id,
                        barcode=barcode,
                        calories_per100g=max(int(per100[0]), 0),
                        protein_g_per100g=per100[1],
                        carbs_g_per100g=per100[2],
                        fat_g_per100g=per100[3],
                        saturated_fat_g_per100g=per100[4],
                        cholesterol_mg_per100g=per100[5],
                        sodium_mg_per100g=per100[6],
                        fiber_g_per100g=per100[7],
                        sugars_g_per100g=per100[8],
                        added_sugars_g_per100g=per100[9],
                        micros_json=json.dumps(micros),
                    )
                    db.add(cache_entry)
                    db.commit()
                    logger.info("USDA cache stored for '%s' (fdc_id=%s)", normalized, fdc_id)
                except Exception:
                    db.rollback()

            return per100, str(desc)[:120], micros
    except Exception:
        return None


async def lookup_by_barcode(gtin: str, db: Session | None = None) -> FoodItemOut | None:
    """Look up a packaged food by UPC/GTIN. Tries cache first, then USDA branded foods.

    Returns a FoodItemOut with quantity='100g' (one serving guess — caller can rescale).
    """
    gtin = re.sub(r"\D", "", gtin or "")
    if not gtin:
        return None

    if db is not None:
        cached = db.query(FoodItemsCache).filter(FoodItemsCache.barcode == gtin).first()
        if cached:
            per100 = _cache_per100g_tuple(cached)
            return _food_item_from_per100g(
                cached.normalized_name, None, per100, 100.0, _cache_micros(cached)
            )

    if not settings.usda_api_key:
        return None
    url = "https://api.nal.usda.gov/fdc/v1/foods/search"
    params = {"query": gtin, "dataType": "Branded", "pageSize": 1, "api_key": settings.usda_api_key}
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            r = await client.get(url, params=params)
            r.raise_for_status()
            foods = (r.json() or {}).get("foods") or []
            if not foods:
                return None
            f0 = foods[0]
            if str(f0.get("gtinUpc") or "").replace(" ", "") != gtin:
                # USDA's fuzzy search sometimes returns a non-match; be strict on barcode
                return None
            nutrients = {n["nutrientId"]: n["value"] for n in f0.get("foodNutrients", [])}
            per100 = (
                float(nutrients.get(1008, 100) or 100),
                float(nutrients.get(1003, 5) or 5),
                float(nutrients.get(1005, 15) or 15),
                float(nutrients.get(1004, 5) or 5),
                float(nutrients.get(1258, 0) or 0),
                float(nutrients.get(1253, 0) or 0),
                float(nutrients.get(1093, 0) or 0),
                float(nutrients.get(1079, 0) or 0),
                float(nutrients.get(1063, 0) or 0),
                float(nutrients.get(1235, 0) or 0),
            )
            micros = {
                key: float(nutrients[nid])
                for key, nid in _MICRO_IDS.items()
                if nid in nutrients and nutrients[nid] is not None
            }
            desc = str(f0.get("description", gtin))[:120]
            normalized = _normalize_name(desc)

            if db is not None:
                try:
                    cache_entry = FoodItemsCache(
                        normalized_name=normalized,
                        fdc_id=f0.get("fdcId"),
                        barcode=gtin,
                        calories_per100g=max(int(per100[0]), 0),
                        protein_g_per100g=per100[1],
                        carbs_g_per100g=per100[2],
                        fat_g_per100g=per100[3],
                        saturated_fat_g_per100g=per100[4],
                        cholesterol_mg_per100g=per100[5],
                        sodium_mg_per100g=per100[6],
                        fiber_g_per100g=per100[7],
                        sugars_g_per100g=per100[8],
                        added_sugars_g_per100g=per100[9],
                        micros_json=json.dumps(micros),
                    )
                    db.add(cache_entry)
                    db.commit()
                except Exception:
                    db.rollback()

            return _food_item_from_per100g(desc, None, per100, 100.0, micros)
    except Exception:
        return None


def _default_for_name(name: str) -> FoodItemOut:
    """Synchronous default lookup — returns estimated nutrition for one typical serving.
    Used by recommendations engine. Scales per-100g data to typical serving weight.
    """
    grams = _serving_grams_for(name)
    key = _keyword_hit(name)
    per100 = _KEYWORD_PER100G[key] if key else _GENERIC_PER100G
    return _food_item_from_per100g(name, None, per100, grams)


async def enrich_item(name: str, quantity: str | None, db: Session | None = None) -> tuple[FoodItemOut, str]:
    """
    Returns (FoodItemOut, source) where source is one of:
      - "usda":    data from USDA (or cache)
      - "keyword": matched one of our known keyword foods
      - "generic": true fallback, nutrition is a guess (warn the user)
    """
    grams = parse_quantity_to_grams(quantity, name)

    usda = await lookup_usda_per100g(name, db=db)
    if usda:
        per100, canonical, micros = usda
        item = _food_item_from_per100g(canonical or name, quantity, per100, grams, micros)
        return item, "usda"

    key = _keyword_hit(name)
    if key:
        item = _food_item_from_per100g(name, quantity, _KEYWORD_PER100G[key], grams)
        return item, "keyword"

    item = _food_item_from_per100g(name, quantity, _GENERIC_PER100G, grams)
    return item, "generic"
