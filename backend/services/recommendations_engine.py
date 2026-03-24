import json
from collections import Counter
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from datetimeutil import utc_day_range, utc_today
from models import FoodLogEntry, User
from schemas import RecommendationItemOut, RecommendationsOut
from services.nutrition import _default_for_name

_FALLBACK_HEALTHY = [
    "Greek yogurt",
    "Apple",
    "Grilled chicken breast",
    "Mixed salad",
    "Brown rice",
    "Banana",
    "Oatmeal",
]

_cache: dict[int, tuple[datetime, RecommendationsOut]] = {}


def _parse_entry_items(entry: FoodLogEntry) -> list[dict]:
    try:
        return json.loads(entry.items_json or "[]")
    except json.JSONDecodeError:
        return []


def _food_counts_from_history(db: Session, user_id: int, limit_days: int = 90) -> Counter:
    since_naive = datetime.utcnow() - timedelta(days=limit_days)
    entries = (
        db.query(FoodLogEntry)
        .filter(FoodLogEntry.user_id == user_id, FoodLogEntry.created_at >= since_naive)
        .all()
    )
    counts: Counter = Counter()
    for e in entries:
        for it in _parse_entry_items(e):
            name = (it.get("name") or "").strip()
            if name:
                counts[name.lower()] += 1
    return counts


def _today_food_counts(db: Session, user_id: int) -> Counter:
    start, end = utc_day_range(utc_today())
    entries = (
        db.query(FoodLogEntry)
        .filter(
            FoodLogEntry.user_id == user_id,
            FoodLogEntry.created_at >= start,
            FoodLogEntry.created_at < end,
        )
        .all()
    )
    counts: Counter = Counter()
    for e in entries:
        for it in _parse_entry_items(e):
            name = (it.get("name") or "").strip()
            if name:
                counts[name.lower()] += 1
    return counts


def _entries_today(db: Session, user_id: int) -> list[FoodLogEntry]:
    start, end = utc_day_range(utc_today())
    return (
        db.query(FoodLogEntry)
        .filter(
            FoodLogEntry.user_id == user_id,
            FoodLogEntry.created_at >= start,
            FoodLogEntry.created_at < end,
        )
        .order_by(FoodLogEntry.created_at.desc())
        .all()
    )


def consumed_today_calories(db: Session, user_id: int) -> int:
    return sum(e.total_calories for e in _entries_today(db, user_id))


def _top_logged_names(counts: Counter, n: int = 10) -> list[str]:
    return [name for name, _ in counts.most_common(n)]


def build_recommendations(db: Session, user: User) -> RecommendationsOut:
    global _cache
    goal = user.daily_calorie_goal
    consumed = consumed_today_calories(db, user.id)
    remaining = (goal - consumed) if goal is not None else None

    entries_today = _entries_today(db, user.id)
    if len(entries_today) < 1:
        cached = _cache.get(user.id)
        if cached and (datetime.now(timezone.utc) - cached[0]).total_seconds() < 3600:
            return cached[1]
        return RecommendationsOut(
            items=[],
            remaining_calories=remaining or 0,
            mode="fallback",
        )

    if goal is None:
        cached = _cache.get(user.id)
        if cached and (datetime.now(timezone.utc) - cached[0]).total_seconds() < 3600:
            return cached[1]
        return RecommendationsOut(items=[], remaining_calories=0, mode="fallback")

    today_names = _today_food_counts(db, user.id)
    hist = _food_counts_from_history(db, user.id)
    top_names = _top_logged_names(hist, 10)
    excluded = {n for n, c in today_names.items() if c >= 3}
    candidates = [n for n in top_names if n not in excluded]
    total_user_entries = db.query(FoodLogEntry).filter(FoodLogEntry.user_id == user.id).count()

    budget = remaining if remaining is not None else 0

    if budget <= 0:
        items_out = [
            RecommendationItemOut(
                food_name="Water",
                estimated_calories=0,
                protein_g=0,
                carbs_g=0,
                fat_g=0,
                reason="At or over budget — zero-calorie hydration.",
            ),
            RecommendationItemOut(
                food_name="Black coffee",
                estimated_calories=5,
                protein_g=0.3,
                carbs_g=0,
                fat_g=0,
                reason="Very low calorie option.",
            ),
        ]
        out = RecommendationsOut(items=items_out[:5], remaining_calories=budget, mode="no_budget")
        _cache[user.id] = (datetime.now(timezone.utc), out)
        return out

    mode: str = "normal"
    if total_user_entries < 3 or len(candidates) < 1:
        mode = "fallback"
        candidates = [x.lower() for x in _FALLBACK_HEALTHY]

    ranked: list[tuple[str, int]] = []
    for raw_name in candidates:
        key = raw_name.lower()
        if key in excluded:
            continue
        ranked.append((raw_name, hist.get(key, 0)))
    ranked.sort(key=lambda x: -x[1])

    items_out: list[RecommendationItemOut] = []
    for name_key, _freq in ranked[:12]:
        display = name_key.title() if name_key.islower() else name_key
        base = _default_for_name(display)
        if base.calories <= budget:
            items_out.append(
                RecommendationItemOut(
                    food_name=base.name,
                    estimated_calories=base.calories,
                    protein_g=base.protein_g,
                    carbs_g=base.carbs_g,
                    fat_g=base.fat_g,
                    reason="From your log history; fits remaining calories.",
                )
            )
        if len(items_out) >= 5:
            break

    if not items_out:
        mode = "fallback"
        for fallback_name in _FALLBACK_HEALTHY:
            base = _default_for_name(fallback_name)
            if base.calories <= max(budget, 0):
                items_out.append(
                    RecommendationItemOut(
                        food_name=base.name,
                        estimated_calories=base.calories,
                        protein_g=base.protein_g,
                        carbs_g=base.carbs_g,
                        fat_g=base.fat_g,
                        reason="Healthy default suggestion.",
                    )
                )
            if len(items_out) >= 5:
                break

    out = RecommendationsOut(
        items=items_out[:5],
        remaining_calories=max(remaining or 0, 0),
        mode=mode,
    )
    _cache[user.id] = (datetime.now(timezone.utc), out)
    return out


def get_cached_recommendations(user_id: int) -> RecommendationsOut | None:
    c = _cache.get(user_id)
    if not c:
        return None
    if (datetime.now(timezone.utc) - c[0]).total_seconds() > 3600:
        return None
    return c[1]
