"""Idempotent migration: add profile fields to users."""

import logging
import sys
from pathlib import Path

from sqlalchemy import inspect, text

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from database import Base, engine, db_url  # noqa: E402
import models  # noqa: E402, F401

logger = logging.getLogger(__name__)

TABLE = "users"

NEW_COLUMNS = [
    ("sex", "VARCHAR(16)", "NULL"),
    ("date_of_birth", "VARCHAR(10)", "NULL"),
    ("height_cm", "FLOAT", "NULL"),
    ("weight_kg", "FLOAT", "NULL"),
    ("activity_level", "VARCHAR(32)", "NULL"),
    ("fitness_goal", "VARCHAR(32)", "NULL"),
    ("dietary_restrictions", "TEXT", "'[]'"),
    ("allergies", "TEXT", "'[]'"),
    ("dislikes", "TEXT", "'[]'"),
    ("notes", "TEXT", "''"),
]


def run():
    is_sqlite = db_url.startswith("sqlite")
    if is_sqlite:
        Base.metadata.create_all(bind=engine)
        return

    insp = inspect(engine)
    existing = {c["name"] for c in insp.get_columns(TABLE)} if insp.has_table(TABLE) else set()
    with engine.begin() as conn:
        for name, sqltype, default in NEW_COLUMNS:
            if name in existing:
                logger.info("users.%s already exists", name)
                continue
            stmt = f"ALTER TABLE {TABLE} ADD COLUMN {name} {sqltype}"
            if default and default != "NULL":
                stmt += f" DEFAULT {default}"
            conn.execute(text(stmt))
            logger.info("Added users.%s", name)
    Base.metadata.create_all(bind=engine)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    run()
    print("migrate_v4 complete")
