<div align="center">

# NutriBoo AI

**Log a meal by typing what you ate** — "3 eggs and toast with a banana" — and get a full macro *and* 16-micronutrient breakdown, backed by USDA food data with an LLM parser and a local fallback.

### [▶ Open the app → nutribooai.netlify.app](https://nutribooai.netlify.app)

![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=flat-square&logo=fastapi&logoColor=white)
![SQLAlchemy](https://img.shields.io/badge/SQLAlchemy-2.0-D71F00?style=flat-square&logo=sqlalchemy&logoColor=white)
![USDA FoodData Central](https://img.shields.io/badge/USDA-FoodData%20Central-2E7D32?style=flat-square)
![OpenAI](https://img.shields.io/badge/OpenAI-GPT--4o--mini-412991?style=flat-square&logo=openai&logoColor=white)

</div>

---

NutriBoo AI is a nutrition tracker whose input is plain English. Instead of searching a database and setting portions for every item, you describe your meal in a sentence; the backend parses it into individual foods and quantities, looks up nutrition per food, and records a complete breakdown — calories, macros, saturated fat, cholesterol, sodium, fiber, sugars, and 16 vitamins and minerals.

It's a full-stack app: a **React 19** single-page frontend (deployed on Netlify) talking to a **FastAPI** backend with JWT auth, SQLAlchemy persistence, diet-aware recommendations, and wellness tracking (weight, water, steps). Meal parsing and nutrition lookup both degrade gracefully — the app is fully functional with no API keys at all.

## Features

- **Natural-language meal logging** — "two eggs, a slice of toast and a coffee" is split into items with quantities and units
- **Full nutrition breakdown** — macros plus saturated fat, cholesterol, sodium, fiber, sugars, added sugars, and 16 micronutrients (vitamins A–K, B-complex, calcium, iron, magnesium, potassium, zinc)
- **Diet-aware recommendations** — suggestions filtered against vegetarian, vegan, pescatarian, gluten-free, dairy-free, nut-free, halal, and kosher restrictions
- **Wellness tracking** — weight, water, and step logs alongside food
- **Dashboard & history** — Recharts visualizations, daily totals, per-day history
- **Auth & accounts** — registration, login, onboarding, JWT sessions, admin view
- **Works offline of any AI service** — no keys required (see below)

## How it works

**Meal parsing** ([`backend/services/nlp.py`](backend/services/nlp.py)): if an `OPENAI_API_KEY` is set, the description is parsed by GPT-4o-mini into structured `{food, quantity, unit}` items. Without a key, a regex heuristic parser handles splitting ("and"/"with"/commas), word-numbers ("three" → 3), and units — so logging works out of the box.

**Nutrition lookup** ([`backend/services/nutrition.py`](backend/services/nutrition.py)): with a `USDA_API_KEY`, foods resolve against USDA FoodData Central and results are cached in the database. Without one, a built-in per-100g keyword table covers common foods with typical serving sizes.

## Quickstart

**Backend** (FastAPI):

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # optional: add OPENAI_API_KEY / USDA_API_KEY
uvicorn main:app --reload     # http://127.0.0.1:8000
```

The database defaults to SQLite (`nutrilog.db`) and migrations run automatically on startup; set `DATABASE_URL` for Postgres.

**Frontend** (React):

```bash
cd frontend
npm install
npm start                     # http://localhost:3000, proxied to :8000
```

## Configuration

All backend settings are environment variables (see [`backend/.env.example`](backend/.env.example)):

| Variable | Purpose | Default |
|----------|---------|---------|
| `SECRET_KEY` | JWT signing key | dev placeholder — set in production |
| `DATABASE_URL` | SQLAlchemy connection | `sqlite:///./nutrilog.db` |
| `CORS_ORIGINS` | Allowed frontend origins | localhost |
| `OPENAI_API_KEY` | LLM meal parsing (optional) | heuristic parser if unset |
| `USDA_API_KEY` | FoodData Central lookup (optional) | local table if unset |

## Tech stack

| Layer | Tools |
|-------|-------|
| Frontend | React 19, React Router 6, Recharts, Create React App |
| Backend | FastAPI, Uvicorn, SQLAlchemy 2, Pydantic Settings |
| Auth | JWT (python-jose), passlib + bcrypt |
| Data | SQLite / PostgreSQL (psycopg2), USDA FoodData Central |
| AI | OpenAI GPT-4o-mini (optional NLP parsing) |
| Deploy | Netlify (frontend) |

## Project structure

```
AI-Nutrition-Tracker/
├── backend/
│   ├── main.py                 # FastAPI app, CORS, startup migrations
│   ├── routers/                # auth, users, logs, dashboard, recommendations, wellness, admin
│   ├── services/               # nlp (meal parsing), nutrition (USDA), recommendations_engine
│   ├── models.py / schemas.py  # SQLAlchemy models + Pydantic schemas
│   ├── scripts/                # migrate_v2 … v6
│   └── tests/
├── frontend/                   # React SPA (pages, components, context, api)
└── netlify.toml
```
