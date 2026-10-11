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
from urllib.parse import quote
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
    "XAUUSD": {"name": "Gold spot · XAU/USD", "reason": "Gold spot (XAU/USD) feed not connected; GC=F futures are shown separately"},
}
# A public, unofficial research quote source; values must retain ticker and provenance.
# There is NO promised production SLA or licensed exchange entitlement here.
YAHOO_TICKERS = {
    "SP500": ("^GSPC", "S&P 500", "index"),
    "NASDAQCOM": ("^IXIC", "Nasdaq Composite", "index"),
    "DGS10": ("^TNX", "UST 10Y · ^TNX", "percent_yield"),
    "DCOILWTICO": ("CL=F", "WTI crude futures · NOT spot", "usd_per_barrel"),
    "DXY": ("DX-Y.NYB", "US Dollar Index · DXY (Yahoo)", "index"),
    "GOLD_GC": ("GC=F", "COMEX Gold futures · NOT spot", "usd_per_troy_oz"),
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



def _summary_yahoo(key: str, rows: list[tuple[str, float]], now: datetime) -> dict[str, Any]:
    ticker, name, unit = YAHOO_TICKERS[key]
    base = {"id": key, "name": name, "unit": unit,
        "source": "Yahoo Finance chart · public unofficial research", "provider_ticker": ticker,
        "source_url": f"https://finance.yahoo.com/quote/{quote(ticker, safe='')}/",
        "frequency": "daily", "status": "NO_DATA"}
    if len(rows) < 2:
        return {**base, "reason": "No two completed daily closes"}
    (prev_date, previous), (date, value) = rows[-2:]
    age_days = (now.date() - datetime.strptime(date, "%Y-%m-%d").date()).days
    if age_days < 0 or age_days > 7 or previous <= 0:
        return {**base, "reason": "Daily quote stale or invalid",
                "observation_date": date}
    change = ((value - previous) * 100 if unit == "percent_yield"
        else (value / previous - 1) * 100)
    if not math.isfinite(change):
        return {**base, "reason": "Invalid change"}
    return {**base, "status": "READY", "value": round(value, 5),
        "previous": round(previous, 5), "observation_date": date,
        "previous_date": prev_date, "age_days": age_days,
        "change": round(change, 4),
        "change_unit": "bp" if unit == "percent_yield" else "pct",
        "history": [{"date": dt, "value": round(v, 5)} for dt,v in rows[-35:]]}


def _yahoo_rows(payload: Any, now: datetime) -> list[tuple[str, float]]:
    """Parse only completed dated Yahoo daily chart closes. No meta.lastPrice."""
    try:
        data = payload["chart"]["result"][0]
        dates = data["timestamp"]
        closes = data["indicators"]["quote"][0]["close"]
        if not isinstance(dates, list) or not isinstance(closes, list):
            return []
        if len(dates) != len(closes) or len(dates) > 100:
            return []
        out = {}
        for ts, price in zip(dates, closes):
            try:
                value = float(price)
                date = datetime.fromtimestamp(int(ts), timezone.utc).date()
            except (TypeError, ValueError, OverflowError, OSError):
                continue
            # Today's daily Yahoo bar may still be forming. Only PRIOR UTC dates.
            if math.isfinite(value) and value > 0 and date < now.date():
                out[date.isoformat()] = value
        return sorted(out.items())
    except (TypeError, ValueError, KeyError, IndexError, OverflowError, OSError):
        return []


async def _load_yahoo(client: httpx.AsyncClient, key: str,
                      now: datetime, semaphore: asyncio.Semaphore) -> dict[str, Any]:
    ticker = YAHOO_TICKERS[key][0]
    try:
        async with semaphore:
            url = "https://query1.finance.yahoo.com/v8/finance/chart/" + quote(ticker, safe="")
            response = await client.get(url,
                params={"range": "35d", "interval": "1d"},
                headers={"User-Agent": "Mozilla/5.0 (compatible; ASCEND-Research/1.0)",
                         "Accept": "application/json"})
            response.raise_for_status()
            if len(response.content) > 600_000:
                raise ValueError("Oversized provider response")
            data = response.json()
            return _summary_yahoo(key, _yahoo_rows(data, now), now)
    except (httpx.HTTPError, ValueError, UnicodeError, TimeoutError) as exc:
        return {"id": key, "name": YAHOO_TICKERS[key][1], "status": "NO_DATA",
                "source": "Yahoo Finance chart · public unofficial research",
                "provider_ticker": ticker, "reason": type(exc).__name__}

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
        # Yahoo is a deliberately labelled *research* fallback for actual quoted
        # index and commodity futures, not a substitution for FRED provenance.
        # Keep the unavailable FRED-only 2Y and Broad USD calls isolated.
        try:
            async with httpx.AsyncClient(timeout=9.0, follow_redirects=True) as client:
                sy = asyncio.Semaphore(3)
                yf = await asyncio.gather(
                    *(_load_yahoo(client, key, now, sy) for key in YAHOO_TICKERS))
                markets = dict(zip(YAHOO_TICKERS, yf))
                fred_only = [key for key in SERIES if key not in YAHOO_TICKERS]
                fred_only.extend(
                    key for key in SERIES if key in YAHOO_TICKERS and
                    markets[key].get("status") != "READY"
                )
                sf = asyncio.Semaphore(2)
                fred = await asyncio.gather(
                    *(_load_one(client, key, now, sf) for key in fred_only))
                for key, row in zip(fred_only, fred):
                    if markets.get(key, {}).get("status") != "READY":
                        markets[key] = row
        except Exception:
            markets = {id: {"id": id, "name": info["name"],
                "unit": info["unit"], "status": "NO_DATA",
                "reason": "External macro providers unavailable",
                "source": "FRED"} for id, info in SERIES.items()}
            for key in YAHOO_TICKERS:
                if key not in markets:
                    markets[key] = {"id": key, "name": YAHOO_TICKERS[key][1],
                                   "status": "NO_DATA", "reason": "Provider unavailable"}
        for key, info in UNAVAILABLE.items():
            markets[key] = {"id": key, "name": info["name"],
                "status": "NO_DATA", "reason": info["reason"], "source": None}
        available = sum(v["status"] == "READY" for v in markets.values())
        out = {
            "status": "READY" if available == len(markets) else "PARTIAL" if available else "NO_DATA",
            "provider": "FRED daily CSV + Yahoo Finance unofficial public charts (research only)",
            "retrieved_utc": now.isoformat(), "frequency": "daily",
            "markets": markets, "available": available, "total": len(markets),
            "note": "Provider displayed per series; Yahoo GC=F/CL=F are futures NOT spot. XAU/USD spot remains NO_DATA; all market data delayed and research-only.",
        }
        _cache["at"] = time.monotonic()
        _cache["snapshot"] = out
        return out
