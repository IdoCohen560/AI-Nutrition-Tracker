"""Idempotent migration: add role + created_at to users, seed super-admin."""

import logging
import sys
from pathlib import Path

from sqlalchemy import inspect, text

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from database import Base, engine, db_url  # noqa: E402
import models  # noqa: E402, F401

logger = logging.getLogger(__name__)

SUPER_ADMIN_EMAIL = "ido.the.cohen@gmail.com"
TABLE = "users"

NEW_COLUMNS = [
    ("role", "VARCHAR(32)", "'user'"),
    ("created_at", "TIMESTAMP", "CURRENT_TIMESTAMP"),
]


def run():
    is_sqlite = db_url.startswith("sqlite")
    if is_sqlite:
        Base.metadata.create_all(bind=engine)
    else:
        insp = inspect(engine)
        existing = {c["name"] for c in insp.get_columns(TABLE)} if insp.has_table(TABLE) else set()
        with engine.begin() as conn:
            for name, sqltype, default in NEW_COLUMNS:
                if name in existing:
                    logger.info("users.%s already exists", name)
                    continue
                conn.execute(text(f"ALTER TABLE {TABLE} ADD COLUMN {name} {sqltype} DEFAULT {default}"))
                logger.info("Added users.%s", name)
        Base.metadata.create_all(bind=engine)

    # Seed super admin role for the known email if user exists.
    with engine.begin() as conn:
        conn.execute(
            text("UPDATE users SET role = :role WHERE LOWER(email) = LOWER(:email)"),
            {"role": "super_admin", "email": SUPER_ADMIN_EMAIL},
        )
    logger.info("Seeded super_admin role for %s (if registered)", SUPER_ADMIN_EMAIL)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    run()
    print("migrate_v3 complete")
