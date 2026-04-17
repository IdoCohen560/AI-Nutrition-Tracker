from datetime import date, datetime, timedelta, timezone


def utc_today() -> date:
    return datetime.now(timezone.utc).date()


def utc_day_range(d: date) -> tuple[datetime, datetime]:
    """Naive UTC bounds matching datetime.utcnow() storage."""
    start = datetime(d.year, d.month, d.day)
    end = start + timedelta(days=1)
    return start, end
