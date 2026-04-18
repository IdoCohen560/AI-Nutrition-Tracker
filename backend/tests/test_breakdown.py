import json
from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from database import Base, get_db
from main import app
from models import FoodLogEntry, User
from security import create_access_token, hash_password

engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    db = TestSession()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


def _make_user(db, goal=2000):
    u = User(
        email="test@example.com",
        hashed_password=hash_password("password123"),
        daily_calorie_goal=goal,
        token_version=0,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


def _auth_header(user: User) -> dict:
    token = create_access_token(user.id, user.token_version)
    return {"Authorization": f"Bearer {token}"}


def _add_entry(db, user_id, meal_type, cal, protein=10.0, carbs=20.0, fat=5.0,
               sat_fat=1.0, chol=30.0, sodium=200.0, fiber=3.0, sugars=5.0,
               added_sugars=2.0, when=None):
    items = [{"name": "test food", "calories": cal, "protein_g": protein,
              "carbs_g": carbs, "fat_g": fat, "saturated_fat_g": sat_fat,
              "cholesterol_mg": chol, "sodium_mg": sodium, "fiber_g": fiber,
              "sugars_g": sugars, "added_sugars_g": added_sugars}]
    e = FoodLogEntry(
        user_id=user_id,
        meal_type=meal_type,
        description_text="test",
        items_json=json.dumps(items),
        total_calories=cal,
        total_protein_g=protein,
        total_carbs_g=carbs,
        total_fat_g=fat,
        total_saturated_fat_g=sat_fat,
        total_cholesterol_mg=chol,
        total_sodium_mg=sodium,
        total_fiber_g=fiber,
        total_sugars_g=sugars,
        total_added_sugars_g=added_sugars,
        created_at=when or datetime.utcnow(),
    )
    db.add(e)
    db.commit()
    return e


client = TestClient(app)


class TestBreakdownDaily:
    def test_full_daily_response(self):
        db = TestSession()
        user = _make_user(db, goal=2000)
        headers = _auth_header(user)
        today = datetime.utcnow().date()

        _add_entry(db, user.id, "breakfast", 400, protein=20, carbs=50, fat=10,
                   sat_fat=3, chol=50, sodium=400, fiber=5, sugars=8, added_sugars=3)
        _add_entry(db, user.id, "lunch", 600, protein=30, carbs=60, fat=20,
                   sat_fat=5, chol=80, sodium=600, fiber=7, sugars=10, added_sugars=4)
        _add_entry(db, user.id, "dinner", 500, protein=25, carbs=40, fat=15,
                   sat_fat=4, chol=60, sodium=500, fiber=4, sugars=6, added_sugars=2)
        _add_entry(db, user.id, "snack", 200, protein=5, carbs=30, fat=8,
                   sat_fat=2, chol=10, sodium=100, fiber=2, sugars=12, added_sugars=5)
        db.close()

        resp = client.get(f"/dashboard/breakdown?date={today}&range=daily", headers=headers)
        assert resp.status_code == 200
        data = resp.json()

        assert data["date"] == today.isoformat()
        assert data["range"] == "daily"
        assert "calories" in data
        assert "macros" in data
        assert "meals" in data

        cal = data["calories"]
        assert cal["consumed"] == 400 + 600 + 500 + 200  # 1700
        assert cal["burned"] == 0
        assert cal["net"] == 1700
        assert cal["budget"] == 2000
        assert cal["delta"] == 300
        assert cal["state"] == "under"

        macros = data["macros"]
        expected_macros = ["fat", "saturated_fat", "cholesterol", "sodium",
                           "carbs", "fiber", "sugars", "added_sugars", "protein"]
        for key in expected_macros:
            assert key in macros, f"Missing macro: {key}"
            m = macros[key]
            if key in ("cholesterol", "sodium"):
                assert "mg" in m
            else:
                assert "grams" in m
            assert "pct_dv" in m

        assert macros["fat"]["grams"] == 10 + 20 + 15 + 8  # 53
        assert macros["protein"]["grams"] == 20 + 30 + 25 + 5  # 80
        assert macros["carbs"]["grams"] == 50 + 60 + 40 + 30  # 180
        assert macros["cholesterol"]["mg"] == 50 + 80 + 60 + 10  # 200
        assert macros["sodium"]["mg"] == 400 + 600 + 500 + 100  # 1600

        assert macros["sugars"]["pct_dv"] is None

        assert isinstance(macros["fat"]["pct_dv"], int)
        assert macros["fat"]["pct_dv"] == round(53 / 78 * 100)
        assert macros["protein"]["pct_dv"] == round(80 / 50 * 100)

        meals = data["meals"]
        assert "breakfast" in meals
        assert "lunch" in meals
        assert "dinner" in meals
        assert "snacks" in meals
        assert "snack" not in meals

        assert meals["breakfast"]["calories"] == 400
        assert meals["lunch"]["calories"] == 600
        assert meals["dinner"]["calories"] == 500
        assert meals["snacks"]["calories"] == 200

        assert isinstance(meals["breakfast"]["items"], list)
        assert len(meals["breakfast"]["items"]) == 1
        assert meals["snacks"]["items"][0]["name"] == "test food"

    def test_empty_date_returns_zeroed_structure(self):
        db = TestSession()
        user = _make_user(db, goal=2000)
        headers = _auth_header(user)
        db.close()

        far_date = "2020-01-01"
        resp = client.get(f"/dashboard/breakdown?date={far_date}&range=daily", headers=headers)
        assert resp.status_code == 200
        data = resp.json()

        assert data["calories"]["consumed"] == 0
        assert data["calories"]["burned"] == 0
        assert data["calories"]["net"] == 0
        assert data["calories"]["budget"] == 2000
        assert data["calories"]["delta"] == 2000
        assert data["calories"]["state"] == "under"

        assert data["macros"]["fat"]["grams"] == 0
        assert data["macros"]["fat"]["pct_dv"] == 0
        assert data["macros"]["protein"]["grams"] == 0

        for meal_key in ["breakfast", "lunch", "dinner", "snacks"]:
            assert data["meals"][meal_key]["calories"] == 0
            assert data["meals"][meal_key]["items"] == []

    def test_over_budget_state(self):
        db = TestSession()
        user = _make_user(db, goal=500)
        headers = _auth_header(user)
        today = datetime.utcnow().date()

        _add_entry(db, user.id, "lunch", 600)
        db.close()

        resp = client.get(f"/dashboard/breakdown?date={today}&range=daily", headers=headers)
        data = resp.json()

        assert data["calories"]["budget"] == 500
        assert data["calories"]["consumed"] == 600
        assert data["calories"]["delta"] == -100
        assert data["calories"]["state"] == "over"


class TestBreakdownWeekly:
    def test_weekly_range(self):
        db = TestSession()
        user = _make_user(db, goal=2000)
        headers = _auth_header(user)
        today = datetime.utcnow().date()

        _add_entry(db, user.id, "breakfast", 400)
        three_days_ago = datetime(today.year, today.month, today.day) - timedelta(days=3)
        _add_entry(db, user.id, "lunch", 500, when=three_days_ago + timedelta(hours=12))
        db.close()

        resp = client.get(f"/dashboard/breakdown?date={today}&range=weekly", headers=headers)
        assert resp.status_code == 200
        data = resp.json()

        assert data["range"] == "weekly"
        assert data["calories"]["consumed"] == 900
        assert data["calories"]["budget"] == 2000 * 7


class TestBreakdownNoBudget:
    def test_no_calorie_goal(self):
        db = TestSession()
        user = _make_user(db, goal=None)
        headers = _auth_header(user)
        today = datetime.utcnow().date()

        _add_entry(db, user.id, "breakfast", 300)
        db.close()

        resp = client.get(f"/dashboard/breakdown?date={today}&range=daily", headers=headers)
        assert resp.status_code == 200
        data = resp.json()

        assert data["calories"]["consumed"] == 300
        assert data["calories"]["budget"] is None
        assert data["calories"]["delta"] is None
        assert data["calories"]["state"] is None


class TestBreakdownAuth:
    def test_unauthenticated_returns_401(self):
        resp = client.get("/dashboard/breakdown?date=2026-04-17&range=daily")
        assert resp.status_code == 401
