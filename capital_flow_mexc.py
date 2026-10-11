"""ASCEND Capital/Flow V1. Real MEXC observations only, no trade commands.

24h spot/futures turnover are USDT quote amounts; derivatives open
interest and sampled execution delta remain in *contracts*, not USD.
A recent trades snapshot is NOT continuous CVD, and unavailable
liquidations are deliberately NO_DATA.
"""
from __future__ import annotations

import asyncio
import math
import time
from typing import Any

import httpx

SPOT_URL = "https://api.mexc.com/api/v3/ticker/24hr"
FUTURES_DEALS_URL = "https://contract.mexc.com/api/v1/contract/deals/{symbol}"
CACHE_SEC = 20.0
FAIL_SEC = 8.0
_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}
_LOCKS: dict[str, asyncio.Lock] = {}


def _positive(value: Any, allow_zero: bool = False) -> float | None:
    try:
        result = float(value)
        if math.isfinite(result) and (result >= 0 if allow_zero else result > 0):
            return result
    except (TypeError, ValueError, OverflowError):
        pass
    return None


def parse_spot(payload: Any, expected_symbol: str) -> dict[str, Any]:
    if not isinstance(payload, dict) or payload.get("symbol") != expected_symbol:
        return {"status": "NO_DATA", "reason": "Spot pair unavailable"}
    quote = _positive(payload.get("quoteVolume"))
    if quote is None:
        return {"status": "NO_DATA", "reason": "Missing spot 24h quoteVolume"}
    return {"status": "READY", "quote_turnover_24h_usdt": round(quote, 2),
            "source": "MEXC spot /api/v3/ticker/24hr", "unit": "USDT"}


def parse_deals(payload: Any, now_ms: int) -> dict[str, Any]:
    if not isinstance(payload, dict) or payload.get("success") is not True:
        return {"status": "NO_DATA", "reason": "Futures trade feed unavailable"}
    trades = payload.get("data")
    if not isinstance(trades, list) or not trades:
        return {"status": "NO_DATA", "reason": "No valid trades"}
    # Only include officially documented side T=1 buy, T=2 sell.
    # v is in contracts. Avoid double counts on exact duplicate records.
    seen: set[tuple[int, float, float, int]] = set()
    valid: list[tuple[int, int, float]] = []
    for row in trades[:100]:
        if not isinstance(row, dict):
            continue
        try:
            side = int(row.get("T"))
            timestamp = int(row.get("t"))
        except (TypeError, ValueError, OverflowError):
            continue
        qty = _positive(row.get("v"))
        price = _positive(row.get("p"))
        if side not in (1, 2) or qty is None or price is None:
            continue
        # Reject impossible future times and old snapshots, no synthesized bars.
        if timestamp < now_ms - 5 * 60_000 or timestamp > now_ms + 15_000:
            continue
        key = (timestamp, price, qty, side)
        if key in seen:
            continue
        seen.add(key)
        valid.append((timestamp, side, qty))
    if not valid:
        return {"status": "NO_DATA", "reason": "No recent side-classified trades"}
    buy = sum(q for _, side, q in valid if side == 1)
    sell = sum(q for _, side, q in valid if side == 2)
    total = buy + sell
    span = max(t for t, _, _ in valid) - min(t for t, _, _ in valid)
    return {
        "status": "READY", "trade_count": len(valid),
        "buy_contracts": round(buy, 5), "sell_contracts": round(sell, 5),
        "sample_delta_contracts": round(buy - sell, 5),
        "taker_buy_pct": round(100 * buy / total, 2),
        "sample_window_sec": round(span / 1000, 2),
        "first_trade_ms": min(t for t, _, _ in valid),
        "last_trade_ms": max(t for t, _, _ in valid),
        "unit": "contracts",
        "source": "MEXC futures recent trades (T=1 buy, T=2 sell)",
        "cvd_status": "NOT_CONNECTED",
        "cvd_reason": "A snapshot of at most 100 recent trades cannot provide complete continuous CVD",
    }


def parse_futures_ticker(ticker: Any) -> dict[str, Any]:
    if not isinstance(ticker, dict):
        return {"status": "NO_DATA", "reason": "Futures ticker unavailable"}
    turnover = _positive(ticker.get("amount_24h"))
    oi = _positive(ticker.get("open_interest"), allow_zero=True)
    funding = ticker.get("funding_rate")
    try:
        funding = float(funding) if funding is not None else None
        if funding is not None and not math.isfinite(funding):
            funding = None
    except (TypeError, ValueError):
        funding = None
    # Never convert OI contracts into USD without contract multiplier.
    return {
        "status": "READY" if any(x is not None for x in (turnover, oi, funding)) else "NO_DATA",
        "turnover_24h_usdt": round(turnover, 2) if turnover is not None else None,
        "open_interest_contracts": oi,
        "funding_pct": round(funding * 100, 6) if funding is not None else None,
        "oi_unit": "contracts", "source": "MEXC futures ticker",
    }


async def _fetch_spot(client: httpx.AsyncClient, symbol: str) -> dict[str, Any]:
    try:
        spot_pair = symbol.replace("_", "")
        response = await client.get(SPOT_URL, params={"symbol": spot_pair})
        response.raise_for_status()
        return parse_spot(response.json(), spot_pair)
    except (httpx.HTTPError, ValueError) as e:
        return {"status": "NO_DATA", "reason": type(e).__name__}


async def _fetch_deals(client: httpx.AsyncClient, symbol: str, now_ms: int) -> dict[str, Any]:
    try:
        response = await client.get(
            FUTURES_DEALS_URL.format(symbol=symbol), params={"limit": 100}
        )
        response.raise_for_status()
        return parse_deals(response.json(), now_ms)
    except (httpx.HTTPError, ValueError) as e:
        return {"status": "NO_DATA", "reason": type(e).__name__}


async def snapshot(symbol: str, ticker: Any) -> dict[str, Any]:
    """Per-symbol 20s cache. Not called for every radar coin."""
    now = time.monotonic()
    cached = _CACHE.get(symbol)
    if cached and now - cached[0] < (
        CACHE_SEC if cached[1].get("status") != "NO_DATA" else FAIL_SEC
    ):
        return cached[1]
    lock = _LOCKS.setdefault(symbol, asyncio.Lock())
    async with lock:
        now = time.monotonic()
        cached = _CACHE.get(symbol)
        if cached and now - cached[0] < (
            CACHE_SEC if cached[1].get("status") != "NO_DATA" else FAIL_SEC
        ):
            return cached[1]
        now_ms = int(time.time() * 1000)
        async with httpx.AsyncClient(timeout=6.0) as client:
            spot, deals = await asyncio.gather(
                _fetch_spot(client, symbol),
                _fetch_deals(client, symbol, now_ms),
            )
        futures = parse_futures_ticker(ticker)
        spot_quote = spot.get("quote_turnover_24h_usdt")
        fut_quote = futures.get("turnover_24h_usdt")
        ratio = (round(fut_quote / spot_quote, 3)
                 if spot_quote is not None and fut_quote is not None and spot_quote > 0
                 else None)
        available = sum(v.get("status") == "READY" for v in (spot, deals, futures))
        out = {
            "symbol": symbol, "as_of_ms": now_ms,
            "status": "PARTIAL" if available else "NO_DATA",
            "spot": spot, "futures": futures, "recent_trades": deals,
            "futures_to_spot_turnover_ratio": ratio,
            "liquidations": {"status": "NO_DATA",
                             "reason": "Verified historical liquidation feed is not connected"},
            "notes": [
                "Spot/futures turnover: rolling 24h USDT notional, not order-flow direction",
                "OI: exchange-reported contracts; not dollars or OI delta",
                "Recent trade delta: sampled executions only, not continuous CVD",
                "Liquidations: NO DATA, never derived from sweeps",
            ],
        }
        _CACHE[symbol] = (time.monotonic(), out)
        if len(_CACHE) > 16:
            oldest = sorted(_CACHE, key=lambda key: _CACHE[key][0])[:-12]
            for key in oldest:
                _CACHE.pop(key, None)
                _LOCKS.pop(key, None)
        return out
