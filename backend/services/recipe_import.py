"""Recipe URL import — fetches a page, extracts schema.org/Recipe JSON-LD ingredients,
enriches each through USDA/keyword, scales by servings when available.
"""
import json
import re
from html import unescape

import httpx

from schemas import FoodItemOut, RecipeImportResponse
from services.nutrition import enrich_item


_JSONLD_RE = re.compile(
    r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
    re.IGNORECASE | re.DOTALL,
)


def _flatten_recipe_candidates(obj) -> list[dict]:
    """Walk a parsed JSON-LD blob looking for objects with @type == Recipe."""
    out: list[dict] = []
    if isinstance(obj, dict):
        t = obj.get("@type")
        types = t if isinstance(t, list) else [t] if t else []
        if any((isinstance(x, str) and x.lower() == "recipe") for x in types):
            out.append(obj)
        # @graph wrappers, nested objects
        for v in obj.values():
            out.extend(_flatten_recipe_candidates(v))
    elif isinstance(obj, list):
        for it in obj:
            out.extend(_flatten_recipe_candidates(it))
    return out


def _extract_recipe(html: str) -> dict | None:
    for match in _JSONLD_RE.findall(html):
        raw = unescape(match).strip()
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            # Some sites serve multiple JSON objects concatenated — try best-effort split
            try:
                parsed = json.loads(re.sub(r"}\s*{", "},{", f"[{raw}]"))
            except json.JSONDecodeError:
                continue
        recipes = _flatten_recipe_candidates(parsed)
        if recipes:
            return recipes[0]
    return None


def _ingredients_from(recipe: dict) -> list[str]:
    items = recipe.get("recipeIngredient") or recipe.get("ingredients") or []
    if isinstance(items, str):
        items = [items]
    cleaned = []
    for raw in items:
        if not isinstance(raw, str):
            continue
        s = raw.strip()
        if s:
            cleaned.append(s)
    return cleaned


def _split_qty_and_name(ingredient: str) -> tuple[str | None, str]:
    """Crude split: leading quantity/unit vs the rest (the food name).
    '2 cups flour' -> ('2 cups', 'flour')
    'salt to taste' -> (None, 'salt to taste')
    """
    m = re.match(
        r"^\s*(\d+(?:\.\d+)?|\d+/\d+|\d+\s+\d+/\d+)\s*"
        r"(cups?|tbsps?|tablespoons?|tsps?|teaspoons?|oz|ounces?|lbs?|pounds?|g|grams?|kg|ml|liters?|l|slices?|pieces?|servings?)?\s+(.+)$",
        ingredient,
        flags=re.IGNORECASE,
    )
    if m:
        qty = m.group(1)
        unit = m.group(2) or ""
        name = m.group(3).strip()
        qty_str = f"{qty} {unit}".strip() if unit else qty
        return qty_str, name
    return None, ingredient


async def import_recipe_from_url(url: str, db=None) -> RecipeImportResponse:
    if not re.match(r"^https?://", url):
        return RecipeImportResponse(found=False, error="URL must start with http:// or https://")
    try:
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True, headers={
            "User-Agent": "NutriBooAI/1.0 (+recipe-import)",
        }) as client:
            r = await client.get(url)
            r.raise_for_status()
            html = r.text
    except Exception as exc:
        return RecipeImportResponse(found=False, error=f"Fetch failed: {exc}")

    recipe = _extract_recipe(html)
    if not recipe:
        return RecipeImportResponse(found=False, error="No schema.org/Recipe JSON-LD found on page")

    title = None
    if isinstance(recipe.get("name"), str):
        title = recipe["name"][:200]

    servings = recipe.get("recipeYield")
    if isinstance(servings, list) and servings:
        servings = servings[0]
    servings_n = 1
    if isinstance(servings, str):
        sm = re.search(r"\d+", servings)
        if sm:
            try:
                servings_n = max(int(sm.group()), 1)
            except ValueError:
                servings_n = 1
    elif isinstance(servings, (int, float)):
        servings_n = max(int(servings), 1)

    ingredients = _ingredients_from(recipe)
    if not ingredients:
        return RecipeImportResponse(found=False, title=title, error="Recipe found but no ingredients listed")

    items: list[FoodItemOut] = []
    warnings: list[str] = []
    for ing in ingredients[:40]:  # hard cap
        qty, name = _split_qty_and_name(ing)
        fi, source = await enrich_item(name, qty, db=db)
        # Scale down to per-serving so the logged entry == one serving
        if servings_n > 1:
            factor = 1.0 / servings_n
            fi = fi.model_copy(update={
                "calories": int(round(fi.calories * factor)),
                "protein_g": round(fi.protein_g * factor, 2),
                "carbs_g": round(fi.carbs_g * factor, 2),
                "fat_g": round(fi.fat_g * factor, 2),
                "saturated_fat_g": round(fi.saturated_fat_g * factor, 2),
                "cholesterol_mg": round(fi.cholesterol_mg * factor, 2),
                "sodium_mg": round(fi.sodium_mg * factor, 2),
                "fiber_g": round(fi.fiber_g * factor, 2),
                "sugars_g": round(fi.sugars_g * factor, 2),
                "added_sugars_g": round(fi.added_sugars_g * factor, 2),
                "micros": {k: round(v * factor, 3) for k, v in (fi.micros or {}).items()} or None,
                "quantity": (fi.quantity or "") + f" (1/{servings_n} serving)",
            })
        items.append(fi)
        if source == "generic":
            warnings.append(fi.name)

    return RecipeImportResponse(found=True, title=title, items=items, nutrition_warnings=warnings)
