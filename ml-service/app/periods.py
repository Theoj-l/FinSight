"""Month arithmetic on `period_no` (integer YYYYMM, e.g. 202503), shared by
anomaly scoring and forecasting."""
from __future__ import annotations

from datetime import date


def period_index(period_no: int, first_period: int) -> int:
    return (period_no // 100 - first_period // 100) * 12 + (period_no % 100 - first_period % 100)


def period_at(index: int, first_period: int) -> int:
    y0, m0 = divmod(first_period, 100)
    k = (y0 * 12 + m0 - 1) + index
    return (k // 12) * 100 + k % 12 + 1


def add_months(period_no: int, months: int) -> int:
    return period_at(months, period_no)


def periods_between(first_period: int, last_period: int) -> list[int]:
    n = period_index(last_period, first_period) + 1
    return [period_at(i, first_period) for i in range(n)]


def closed_through(last_period: int, today: date) -> int:
    """The latest month that has ended. A month still in progress has partial
    totals that look like a sudden drop, so it is never scored or forecast from."""
    previous = today.year * 100 + today.month - 1 if today.month > 1 else (today.year - 1) * 100 + 12
    return min(last_period, previous)
