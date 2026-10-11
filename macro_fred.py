"""External macro observables from official FRED CSV graph downloads.

Read-only / no trading signals. Values are daily or delayed, not live tape.
Only named allowlisted FRED series can be fetched (no client-controlled URLs).
Missing, unlicensed, unavailable, or stale instruments fail closed.
"""
from __future__ import annotations

import asyncio
import csv
import io
import math
import time
from datetime import datetime, timezone, timedelta
from typing import Any

import httpx

FRED_CSV = "https://fred.stlouisfed.org/graph/fredgraph.csv"
SERIES = {
    "SP500": {"name": "S&P 500", "unit": "index", "max_age_days": 6},
    "NASDAQCOM": {"name": "Nasdaq Composite", "unit": "index", "max_age_days": 6},
    "DGS10": {"name": "UST 10Y", "unit": "percent_yield", "max_age_days": 7},
    "DGS2": {"name": "UST 2Y", "unit": "percent_yield", "max_age_days": 7},
    "DTWEXBGS": {"name": "Broad USD Index · DXY proxy ONLY", "unit": "index", "max_age_days": 12},
    "DCOILWTICO": {"name": "WTI spot · Cushing", "unit": "usd_per_barrel", "max_age_days": 9},
}
# The two missing market data streams MUST NOT be fabricated from other assets.
UNAVAILABLE = {
    "DXY": {"name": "DXY · ICE Dollar Index", "reason": "DXY data feed not connected; Broad USD is NOT DXY"},
    "XAUUSD": {"name": "Gold spot · XAU/USD", "reason": "Verified current gold spot feed not connected"},
}
CACHE_SECONDS = 1800
FAIL_CACHE_SECONDS = 300
_lock = asyncio.Lock()
_cache: dict[str, Any] = {"at": 0.0, "snapshot": None}


def parse_fred_csv(text: str, series: str, today: datetime | None = None) -> list[tuple[str, float]]:
    """Return valid strictly historical (date, value) rows; do not forward-fill holidays."""
    if series not in SERIES or len(text) > 600_000:
        return []
    clock = (today or datetime.now(timezone.utc)).date()
    reader = csv.DictReader(io.StringIO(text.lstrip("\ufeff")))
    if reader.fieldnames is None or series not in reader.fieldnames:
        return []
    date_key = "observation_date" if "observation_date" in reader.fieldnames else "DATE"
    if date_key not in reader.fieldnames:
        return []
    found: dict[str, float] = {}
    for row in reader:
        date = str(row.get(date_key) or "").strip()
        try:
            dt = datetime.strptime(date, "%Y-%m-%d").date()
            val = float(str(row.get(series) or ".").strip())
        except (ValueError, TypeError):
            continue
        if not math.isfinite(val) or val <= 0 or dt > clock:
            continue
        found[date] = val
    return sorted(found.items())


def summarize_series(series: str, rows: list[tuple[str, float]], now: datetime) -> dict[str, Any]:
    info = SERIES[series]
    base: dict[str, Any] = {
        "id": series, "name": info["name"], "unit": info["unit"],
        "source": "FRED", "frequency": "daily",
        "source_url": f"https://fred.stlouisfed.org/series/{series}",
        "status": "NO_DATA",
    }
    if len(rows) < 2:
        return {**base, "reason": "No two valid observations"}
    (prev_date, previous), (date, value) = rows[-2:]
    age_days = (now.date() - datetime.strptime(date, "%Y-%m-%d").date()).days
    # The date is the observation date, not the UTC publication timestamp.
    if age_days < 0 or age_days > info["max_age_days"]:
        return {**base, "reason": f"Stale daily observation ({age_days}d)",
                "observation_date": date, "age_days": age_days}
    is_yield = info["unit"] == "percent_yield"
    delta = (value - previous) * 100 if is_yield else (value / previous - 1) * 100
    if not math.isfinite(delta):
        return {**base, "reason": "Nonfinite difference"}
    return {
        **base, "status": "READY", "observation_date": date,
        "previous_date": prev_date, "age_days": age_days,
        "value": round(value, 5), "previous": round(previous, 5),
        "change": round(delta, 4), "change_unit": "bp" if is_yield else "pct",
        "history": [{"date": dt, "value": round(v, 5)} for dt, v in rows[-35:]],
    }


async def _load_one(client: httpx.AsyncClient, series: str, now: datetime,
                    sem: asyncio.Semaphore) -> dict[str, Any]:
    try:
        async with sem:
            start = (now.date() - timedelta(days=75)).isoformat()
            response = await client.get(FRED_CSV, params={"id": series, "cosd": start},
                headers={"Accept": "text/csv", "User-Agent": "ASCEND-Research/1.0"})
            response.raise_for_status()
            if len(response.content) > 600_000:
                raise ValueError("CSV response too large")
            rows = parse_fred_csv(response.text, series, now)
            return summarize_series(series, rows, now)
    except (httpx.HTTPError, ValueError, UnicodeError, TimeoutError) as exc:
        return {"id": series, "name": SERIES[series]["name"],
                "unit": SERIES[series]["unit"], "status": "NO_DATA",
                "source": "FRED", "frequency": "daily",
                "reason": type(exc).__name__, "source_url": f"https://fred.stlouisfed.org/series/{series}"}


async def snapshot() -> dict[str, Any]:
    now_mono = time.monotonic()
    cached = _cache.get("snapshot")
    if cached and now_mono - float(_cache["at"]) < (
        CACHE_SECONDS if any(v.get("status") == "READY" for v in cached["markets"].values())
        else FAIL_CACHE_SECONDS
    ):
        return cached
    async with _lock:
        now_mono = time.monotonic()
        cached = _cache.get("snapshot")
        if cached and now_mono - float(_cache["at"]) < (
            CACHE_SECONDS if any(v.get("status") == "READY" for v in cached["markets"].values())
            else FAIL_CACHE_SECONDS
        ):
            return cached
        now = datetime.now(timezone.utc)
        try:
            async with httpx.AsyncClient(timeout=9.0, follow_redirects=True) as client:
                sem = asyncio.Semaphore(3)
                results = await asyncio.gather(*(_load_one(client, id, now, sem) for id in SERIES))
            markets = {id: result for id, result in zip(SERIES, results)}
        except Exception:
            markets = {id: {"id": id, "name": info["name"],
                "unit": info["unit"], "status": "NO_DATA", "reason": "Provider unavailable",
                "source": "FRED", "frequency": "daily"}
                for id, info in SERIES.items()}
        for key, info in UNAVAILABLE.items():
            markets[key] = {"id": key, "name": info["name"],
                "status": "NO_DATA", "reason": info["reason"], "source": None}
        available = sum(v["status"] == "READY" for v in markets.values())
        out = {
            "status": "READY" if available == len(markets) else "PARTIAL" if available else "NO_DATA",
            "provider": "FRED daily CSV · delayed observations",
            "retrieved_utc": now.isoformat(), "frequency": "daily",
            "markets": markets, "available": available, "total": len(markets),
            "note": "Broad USD Index is NOT DXY. FRED daily observations are not intraday quotes; gold remains NO_DATA.",
        }
        _cache["at"] = time.monotonic()
        _cache["snapshot"] = out
        return out
