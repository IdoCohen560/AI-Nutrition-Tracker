import json
import re

import httpx

from config import settings


def _heuristic_parse(text: str) -> tuple[list[dict], float]:
    """Split meal description into candidate food phrases; estimate confidence."""
    t = text.strip()
    if not t:
        return [], 0.0
    parts = re.split(r"\s*,\s*|\s+and\s+|\s*;\s*", t, flags=re.IGNORECASE)
    parts = [p.strip() for p in parts if p.strip()]
    if not parts:
        parts = [t]
    items = []
    for p in parts:
        m = re.match(
            r"^(\d+(?:\.\d+)?)\s*(cup|cups|oz|g|gram|grams|slice|slices|piece|pieces|serving|servings)?\s+(.+)$",
            p,
            re.IGNORECASE,
        )
        if m:
            qty, unit, name = m.group(1), m.group(2) or "", m.group(3).strip()
            quantity = f"{qty} {unit}".strip() + (" " + name if name else "")
            items.append({"name": name or p, "quantity": quantity})
        else:
            items.append({"name": p, "quantity": None})
    # Simple texts with 1-3 short clauses -> higher confidence
    if len(parts) <= 2 and len(t) < 120:
        conf = 0.88
    elif len(parts) <= 4:
        conf = 0.72
    else:
        conf = 0.55
    return items, conf


async def parse_with_openai(text: str) -> tuple[list[dict], float, str | None]:
    if not settings.openai_api_key:
        return [], 0.0, None
    url = "https://api.openai.com/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {settings.openai_api_key}",
        "Content-Type": "application/json",
    }
    system = (
        "You extract food items from a meal description. "
        'Return JSON: {"items":[{"name":"food name","quantity":"optional string"}],'
        '"confidence":0.0-1.0}. Use confidence 0.9+ if clear, lower if ambiguous.'
    )
    payload = {
        "model": settings.openai_model,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": text},
        ],
        "temperature": 0.2,
    }
    try:
        async with httpx.AsyncClient(timeout=settings.nlp_timeout_seconds) as client:
            r = await client.post(url, headers=headers, json=payload)
            r.raise_for_status()
            data = r.json()
            content = data["choices"][0]["message"]["content"]
            parsed = json.loads(content)
            items = parsed.get("items") or []
            conf = float(parsed.get("confidence", 0.75))
            norm = [{"name": str(i.get("name", "")).strip(), "quantity": i.get("quantity")} for i in items if i.get("name")]
            return norm, max(0.0, min(1.0, conf)), None
    except Exception as exc:
        return [], 0.0, str(exc)


async def parse_meal_description(text: str) -> tuple[list[dict], float, str | None]:
    """
    Returns (items with name+quantity, overall_confidence, error_message).
    error_message set when NLP service fails entirely (for UC-1 E1).
    """
    if settings.openai_api_key:
        items, conf, err = await parse_with_openai(text)
        if err:
            return [], 0.0, err
        if items:
            return items, conf, None
    items, conf = _heuristic_parse(text)
    return items, conf, None
