# NutriBoo AI — Milestone: Full Nutrition Dashboard (M1+M2+M3)

## Context

Existing full-stack app:
- **Backend:** FastAPI + SQLAlchemy 2.x + Postgres (Render). Routers: `auth`, `users`, `logs`, `dashboard`, `recommendations`. Services: `nlp.py`, `nutrition.py`, `recommendations_engine.py`.
- **Frontend:** Create React App + react-router-dom v6. Pages: Login, Register, Onboarding, Dashboard, LogFood, History, Settings. Single `AppLayout`.
- **Models today:** `User`, `FoodLogEntry` with totals only for calories/protein/carbs/fat.
- **Deploy:** frontend → Netlify (`nutribooai.netlify.app`), backend → Render (`nutriboo-api.onrender.com`), Postgres on Render. Env vars already wired. Auto-deploy on push to `main`.

Goal of this milestone: transform the basic tracker into a **full nutritional breakdown dashboard** matching the visual style and structure of the reference screenshots described below.

## Scope (3 sub-features bundled)

### Sub-feature 1: Full nutrition breakdown (data layer)

**Backend changes:**

1. Extend `FoodLogEntry` model with new totals columns:
   - `total_saturated_fat_g FLOAT DEFAULT 0`
   - `total_cholesterol_mg FLOAT DEFAULT 0`
   - `total_sodium_mg FLOAT DEFAULT 0`
   - `total_fiber_g FLOAT DEFAULT 0`
   - `total_sugars_g FLOAT DEFAULT 0`
   - `total_added_sugars_g FLOAT DEFAULT 0`

2. Update `items_json` schema so each parsed item carries the same expanded nutrient set (not just kcal/p/c/f). Backwards-compatible: missing fields default to 0.

3. Create `services/nutrition.py` integration with USDA FoodData Central API (env var `USDA_API_KEY` already exists in `config.py`). Function `lookup_nutrition(food_name, serving_grams) -> dict` returning all expanded fields. Cache results in a new `food_items_cache` table (keyed by normalized name) to avoid re-hitting USDA.

4. When `nlp.py` parses a meal description, enrich each item via the cache/USDA lookup.

5. Auto-migration: on startup, run `Base.metadata.create_all(bind=engine)` (already does this) — new columns will be added by SQLAlchemy for SQLite, but **for Postgres we need a manual ALTER TABLE script** at `backend/scripts/migrate_v2.py` that runs idempotently and adds missing columns. Call it from `main.py` startup once.

6. New endpoint `GET /dashboard/breakdown?date=YYYY-MM-DD&range=daily|weekly` returning:
   ```json
   {
     "date": "2026-04-14",
     "range": "daily",
     "calories": { "consumed": 2147, "burned": 0, "net": 2147, "budget": 2170, "delta": 23, "state": "under" },
     "macros": {
       "fat": { "grams": 93.5, "pct_dv": 37 },
       "saturated_fat": { "grams": 13, "pct_dv": null },
       "cholesterol": { "mg": 35, "pct_dv": null },
       "sodium": { "mg": 876.6, "pct_dv": null },
       "carbs": { "grams": 177, "pct_dv": 31 },
       "fiber": { "grams": 48, "pct_dv": null },
       "sugars": { "grams": 18.8, "pct_dv": null },
       "protein": { "grams": 184, "pct_dv": 32 }
     },
     "meals": {
       "breakfast": { "calories": 525, "items": [...] },
       "lunch": { "calories": 1302, "items": [...] },
       "dinner": { "calories": 320, "items": [...] },
       "snacks": { "calories": 0, "suggested_calories": 23, "items": [] }
     }
   }
   ```
   Use FDA daily reference values (2000 kcal): fat 78g, sat fat 20g, chol 300mg, sodium 2300mg, carbs 275g, fiber 28g, added sugars 50g, protein 50g.

### Sub-feature 2: Dashboard visuals (charts)

**Frontend changes:**

1. Add `recharts` dependency.

2. Replace the current `Dashboard.js` with a new layout matching the reference screenshots:
   - **Top bar:** date scrubber (`< Tue, Apr 14 >`) with a calendar icon that opens a date picker; profile icon on the right.
   - **Daily / Weekly toggle** (pill segmented control).
   - **Calorie ring card** (Recharts donut): centered number = calories under/over budget, label "Under" or "Over" in green/orange. Below: rows for "Food calories consumed", "Exercise calories burned", "Net calories", "Daily calorie budget", "Calories under budget" (green if positive). Footer: lightbulb icon + sentence "Based on your calorie budget and current weight, you are projected to reach your goal on <date>." (omit date if no weight goal yet).
   - **Macro pie chart card** (Recharts pie): three-slice pie (Fat / Carbs / Protein by kcal share — 9 kcal/g fat, 4 kcal/g carb, 4 kcal/g protein). Below pie, vertical legend with colored dot, label, grams, %DV — and indented sub-rows for sat fat/cholesterol/sodium under Fat, fiber/sugars under Carbs. "View All Nutrients" link at bottom (drills into a modal with full breakdown).

3. Color palette (dark theme matching screenshots):
   - bg `#0f172a` (slate-900)
   - card `#1e293b` (slate-800)
   - text `#e2e8f0`
   - muted `#94a3b8`
   - accent orange `#f59e0b` (Fat slice, daily tab active)
   - accent violet `#8b5cf6` (Protein slice)
   - accent cyan `#38bdf8` (Carbs slice)
   - success green `#22c55e` (Under budget)
   - warning red `#ef4444` (Over budget)

4. Update `App.css` with CSS variables for the dark palette. Keep existing class names where possible; add new classes for cards, ring, pie.

### Sub-feature 3: Meal grouping (Breakfast/Lunch/Dinner/Snacks)

**Frontend changes (Dashboard page, below charts):**

1. **Meal cards section**, one card per meal_type in order: Breakfast, Lunch, Dinner, Snacks.
2. Each card header: meal name + total calories (e.g., "Lunch: 1,302 cals") + "..." menu button (no functionality yet, just the icon).
3. Each card body: list of items with:
   - Emoji or generic icon placeholder (use `🍳 🥗 🍽️ 🥤` per meal type as a fallback; food-specific emoji if NLP can suggest one)
   - Item name (truncate with ellipsis if long)
   - Serving size below name (smaller, muted)
   - Calories on the right
4. Each card footer: orange pill "Add Food" button → routes to `/log?meal=<meal_type>` (LogFood page should pre-select the meal type from the query string).
5. Snacks card: if empty, show "💡 X calories suggested" where X = remaining budget / 4 (or 0 if over).

**Backend support already covered by `/dashboard/breakdown` returning `meals` dict.**

## Out of scope (next milestone)

- Streak counter, "Done logging" toggle, bottom nav (M4)
- Workouts, weight tracking (M5)
- Water, blood glucose, blood pressure (M6)
- Onboarding rewrite for full TDEE calc (M7)

## Constraints & rules

- **Do NOT introduce Next.js, TypeScript, or any new framework.** Stay on CRA + JavaScript.
- **Do NOT modify auth, register, login flows** — they work in production.
- **Do NOT delete the current Dashboard** until the new one renders successfully.
- Keep all backend code in `backend/`, all frontend in `frontend/`.
- Use existing styling conventions (App.css, no Tailwind).
- All API calls must go through the existing `api()` helper in `frontend/src/api.js` so `REACT_APP_API_URL` is honored.
- Backend changes must be backwards-compatible: existing `FoodLogEntry` rows must still load (default 0 for new fields).
- After implementation, run `cd frontend && CI=false npm run build` to verify the build succeeds. Fix any errors.
- After implementation, smoke-test the backend locally if possible: `cd backend && python -c "from main import app; print('ok')"` to catch import errors.
- **Commit message style:** short imperative, no Co-Authored-By lines.
- Use git identity: `IdoCohen560 / ido.the.cohen@gmail.com` (already configured locally).
- Push to `origin/main` when done — Netlify and Render will auto-deploy.

## Definition of done

1. Backend exposes `GET /dashboard/breakdown` returning the documented JSON.
2. New nutrition columns exist in Postgres (verified by migration script).
3. Frontend Dashboard renders dark-theme layout with: date scrubber, daily/weekly toggle, calorie ring, macro pie chart, meal cards (B/L/D/S).
4. Adding food via existing LogFood page still works and shows up in the new dashboard's meal cards.
5. `npm run build` succeeds with no errors.
6. All changes committed and pushed to `origin/main`.
7. No regressions to login/register/onboarding/settings.
