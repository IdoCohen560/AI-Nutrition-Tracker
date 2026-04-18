"""Idempotent migration: add 6 nutrient columns to food_log_entries and create food_items_cache table."""

import logging
import sys
from pathlib import Path

from sqlalchemy import inspect, text

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from database import Base, engine, db_url  # noqa: E402
import models  # noqa: E402, F401

logger = logging.getLogger(__name__)

NEW_COLUMNS = [
    ("total_saturated_fat_g", "FLOAT", "0.0"),
    ("total_cholesterol_mg", "FLOAT", "0.0"),
    ("total_sodium_mg", "FLOAT", "0.0"),
    ("total_fiber_g", "FLOAT", "0.0"),
    ("total_sugars_g", "FLOAT", "0.0"),
    ("total_added_sugars_g", "FLOAT", "0.0"),
]

TABLE = "food_log_entries"


def run():
    is_sqlite = db_url.startswith("sqlite")

    if is_sqlite:
        Base.metadata.create_all(bind=engine)
        logger.info("SQLite: create_all handled all tables and columns")
        return

    insp = inspect(engine)
    existing_columns = {c["name"] for c in insp.get_columns(TABLE)} if insp.has_table(TABLE) else set()

    with engine.begin() as conn:
        for col_name, col_type, default in NEW_COLUMNS:
            if col_name in existing_columns:
                logger.info("Column %s.%s already exists — skipped", TABLE, col_name)
            else:
                stmt = f"ALTER TABLE {TABLE} ADD COLUMN {col_name} {col_type} DEFAULT {default}"
                conn.execute(text(stmt))
                logger.info("Added column %s.%s", TABLE, col_name)

    Base.metadata.create_all(bind=engine)
    logger.info("create_all ensured food_items_cache table exists")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    run()
    print("migrate_v2 complete")
