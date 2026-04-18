"""Idempotent migration: add micronutrient column, barcode column, and steps_entries table."""

import logging
import sys
from pathlib import Path

from sqlalchemy import inspect, text

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from database import Base, engine, db_url  # noqa: E402
import models  # noqa: E402, F401

logger = logging.getLogger(__name__)

CACHE_COLUMNS = [
    ("micros_json", "TEXT", "'{}'"),
    ("barcode", "VARCHAR(32)", "NULL"),
]


def run():
    is_sqlite = db_url.startswith("sqlite")
    if is_sqlite:
        Base.metadata.create_all(bind=engine)
        # SQLite needs ALTER TABLE for new columns on existing tables
        insp = inspect(engine)
        if insp.has_table("food_items_cache"):
            existing = {c["name"] for c in insp.get_columns("food_items_cache")}
            with engine.begin() as conn:
                for name, sqltype, default in CACHE_COLUMNS:
                    if name in existing:
                        continue
                    stmt = f"ALTER TABLE food_items_cache ADD COLUMN {name} {sqltype}"
                    if default and default != "NULL":
                        stmt += f" DEFAULT {default}"
                    conn.execute(text(stmt))
                    logger.info("Added food_items_cache.%s", name)
        return

    insp = inspect(engine)
    if insp.has_table("food_items_cache"):
        existing = {c["name"] for c in insp.get_columns("food_items_cache")}
        with engine.begin() as conn:
            for name, sqltype, default in CACHE_COLUMNS:
                if name in existing:
                    logger.info("food_items_cache.%s already exists", name)
                    continue
                stmt = f"ALTER TABLE food_items_cache ADD COLUMN {name} {sqltype}"
                if default and default != "NULL":
                    stmt += f" DEFAULT {default}"
                conn.execute(text(stmt))
                logger.info("Added food_items_cache.%s", name)
    Base.metadata.create_all(bind=engine)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    run()
    print("migrate_v6 complete")
