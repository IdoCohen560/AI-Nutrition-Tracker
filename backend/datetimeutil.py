from datetime import date, datetime, timedelta, timezone


def utc_today() -> date:
    return datetime.now(timezone.utc).date()


def utc_day_range(d: date, tz_offset_minutes: int = 0) -> tuple[datetime, datetime]:
    """Naive UTC bounds matching datetime.utcnow() storage.

    tz_offset_minutes is JS getTimezoneOffset(): minutes that UTC is AHEAD of local.
    PT (UTC-7) -> +420. So local midnight = local 00:00 + offset minutes (UTC).
    """
    local_midnight_utc = datetime(d.year, d.month, d.day) + timedelta(minutes=tz_offset_minutes)
    return local_midnight_utc, local_midnight_utc + timedelta(days=1)
