"""ASCEND read-only data quality checks. Never alters trading, candle storage or risk.

A 2xx HTTP response proves that a request succeeded, not that OHLCV has no gaps.
This module measures exact closed-minute coverage, source age, and field-level
research stream statuses, without filling holes or combining venue units.
"""
from __future__ import annotations
import time
from typing import Any

import history_store
import market_participation_v1

WATCH = ("BTC_USDT", "ETH_USDT", "SOL_USDT", "XRP_USDT", "DOGE_USDT")
SOURCES = ("mexc", "bybit")

def assess_minutes(rows: list[dict], now_ts: int, window_minutes: int = 60) -> dict:
    n = max(5, min(int(window_minutes), 180))
    right = (int(now_ts) // 60) * 60 - 60   # last fully CLOSED bar open
    left = right - 60 * (n - 1)
    observed: set[int] = set()
    duplicates = 0
    malformed = 0
    for item in rows:
        try:
            ts = int(item["ts"])
            if ts < left or ts > right:
                continue
            if ts % 60:
                malformed += 1
                continue
            prices = [float(item[k]) for k in ("open", "high", "low", "close")]
            if min(prices) <= 0 or prices[2] > min(prices[0], prices[3]) or prices[1] < max(prices[0], prices[3]):
                malformed += 1
                continue
            if ts in observed:
                duplicates += 1
            observed.add(ts)
        except (KeyError, TypeError, ValueError, OverflowError):
            malformed += 1
    missing = [ts for ts in range(left, right + 1, 60) if ts not in observed]
    last = max(observed) if observed else None
    lag = max(0, int(now_ts) - last - 60) if last is not None else None
    status = ("NO DATA" if not observed else
              "STALE" if lag is not None and lag > 180 else
              "PARTIAL" if missing or duplicates or malformed else "LIVE")
    return {
        "status": status, "window_minutes": n, "expected": n,
        "observed": len(observed), "coverage_pct": round(100 * len(observed) / n, 2),
        "missing": len(missing), "missing_first": missing[:8],
        "duplicates": duplicates, "malformed": malformed,
        "last_closed_bar": last, "age_after_close_sec": lag,
        "start_ts": left, "end_ts": right,
        "gap_fill_applied": False,
    }

def stream_health(report: dict | None) -> dict:
    if not isinstance(report, dict):
        return {"status": "NO DATA", "reason": "missing market participation snapshot"}
    out: dict[str, Any] = {}
    cvd = report.get("cvd") or {}
    oi = report.get("delta_oi") or {}
    book = report.get("order_book") or {}
    liq = report.get("liquidations") or {}
    out["cvd"] = {"status": cvd.get("status") or "NO DATA",
                  "reason": "15m trade delta is not cumulative CVD",
                  "cumulative_cvd_available": isinstance(cvd.get("cumulative_cvd"), (int, float))}
    out["oi"] = {"status": oi.get("status") or "NO DATA",
                 "reason": oi.get("reason") or "no verified full 15m series",
                 "source": oi.get("source")}
    out["book"] = {"status": book.get("status") or "NO DATA",
                   "source": book.get("source"),
                   "snapshot_verified": book.get("snapshot_verified") is True}
    if out["book"]["status"] == "LIVE" and not out["book"]["snapshot_verified"]:
        out["book"]["status"] = "PARTIAL"
        out["book"]["reason"] = "no proven snapshot continuity"
    out["liquidations"] = {"status": liq.get("status") or "NO DATA",
                           "source": liq.get("source"),
                           "reason": "Bybit stream covers collector uptime only"}
    return out

async def report(symbol: str = "BTC_USDT", now_ts: int | None = None,
                 minutes: int = 60) -> dict:
    s = str(symbol).strip().upper()
    if s not in WATCH:
        return {"status": "NO DATA", "symbol": s,
                "reason": "PARTICIPATION_WATCH_UNIVERSE", "supported_symbols": WATCH}
    now = int(now_ts or time.time())
    pool = history_store._pool
    if pool is None:
        return {"status": "NO DATA", "symbol": s, "reason": "DATABASE_UNAVAILABLE"}
    count = max(5, min(180, int(minutes)))
    lower = (now // 60) * 60 - count * 60
    candles = {}
    async with pool.acquire() as con:
        for exchange in SOURCES:
            records = await con.fetch(
                """SELECT ts,open,high,low,close FROM market_candles_1m
                WHERE exchange=$1 AND symbol=$2 AND ts >= $3 AND ts < $4
                ORDER BY ts ASC""",
                exchange, s, lower, now)
            candles[exchange] = assess_minutes([dict(r) for r in records], now, count)
    try:
        await market_participation_v1.ensure_schema(pool)
        participation = await market_participation_v1.snapshot(pool, s)
        streams = stream_health(participation)
    except Exception:
        streams = stream_health(None)  # no exceptions or details exposed to guest
    return {"symbol": s, "status": "READ_ONLY_AUDIT", "as_of": now,
            "candles_1m": candles, "participation": streams,
            "message": "LIVE means complete closed 1m window; PARTIAL / STALE / NO DATA never substituted",
            "entry_gate": False, "real_orders_enabled": False}
