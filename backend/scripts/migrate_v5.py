"""Idempotent migration: add weight/water tables + user fields (use_metric, favorite_foods, fast_*)."""

import logging
import sys
from pathlib import Path

from sqlalchemy import inspect, text

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from database import Base, engine, db_url  # noqa: E402
import models  # noqa: E402, F401

logger = logging.getLogger(__name__)

USER_COLUMNS = [
    ("use_metric", "BOOLEAN", "TRUE"),
    ("favorite_foods", "TEXT", "'[]'"),
    ("fast_start", "TIMESTAMP", "NULL"),
    ("fast_target_hours", "FLOAT", "NULL"),
]


def run():
    is_sqlite = db_url.startswith("sqlite")
    if is_sqlite:
        Base.metadata.create_all(bind=engine)
        return

    insp = inspect(engine)
    existing = {c["name"] for c in insp.get_columns("users")} if insp.has_table("users") else set()
    with engine.begin() as conn:
        for name, sqltype, default in USER_COLUMNS:
            if name in existing:
                logger.info("users.%s already exists", name)
                continue
            stmt = f"ALTER TABLE users ADD COLUMN {name} {sqltype}"
            if default and default != "NULL":
                stmt += f" DEFAULT {default}"
            conn.execute(text(stmt))
            logger.info("Added users.%s", name)
    Base.metadata.create_all(bind=engine)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    run()
    print("migrate_v5 complete")
