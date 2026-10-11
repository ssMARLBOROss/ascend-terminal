from __future__ import annotations

import asyncio
import math
import re
import statistics
import time
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime
from typing import Any

import httpx
from fastapi import HTTPException, Query
from fastapi.responses import JSONResponse

import history_store
import macro_fred

MEXC_BASE_URL = "https://api.mexc.com"
MEXC_KLINE_URL = MEXC_BASE_URL + "/api/v1/contract/kline/{symbol}"
MEXC_TICKER_URL = MEXC_BASE_URL + "/api/v1/contract/ticker"
MEXC_CONTRACT_DETAIL_URL = MEXC_BASE_URL + "/api/v1/contract/detail"
RADAR_STATUS_URL = "https://ascend-clean-production.up.railway.app/api/telegram-reversal-41/status"
RADAR_CANDIDATES_URL = "https://ascend-clean-production.up.railway.app/api/radar-candidates-v2/latest"
BYBIT_INSTRUMENTS_URL = "https://api.bybit.com/v5/market/instruments-info"

TIMEFRAMES = {
    "1m": ("Min1", 60),
    "5m": ("Min5", 300),
    "15m": ("Min15", 900),
    "1h": ("Min60", 3600),
    "4h": ("Hour4", 14_400),
    "1d": ("Day1", 86_400),
}

_SYMBOL_RE = re.compile(r"^[A-Z0-9]{1,28}_USDT$")
_TICKER_CACHE: dict[str, Any] = {"at": 0.0, "rows": []}
_CONTRACT_CACHE: dict[str, Any] = {"at": 0.0, "symbols": set()}
_NEWS_CACHE: dict[str, Any] = {"at": 0.0, "rows": []}
_PROFILE_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}
_BREADTH_CACHE: dict[str, Any] = {"at": 0.0, "data": None}
_CANDIDATE_CACHE: dict[str, Any] = {"at": 0.0, "data": None}
_BYBIT_SYMBOL_CACHE: dict[str, Any] = {"at": 0.0, "symbols": []}
_SESSION_RADAR_CACHE: dict[str, Any] = {"at": 0.0, "data": None}
_HISTORY_SAVE_AT: dict[str, float] = {}


def _safe_symbol(raw: str) -> str:
    value = str(raw or "").strip().upper().replace("/", "_").replace("-", "_")
    if not _SYMBOL_RE.fullmatch(value):
        raise HTTPException(status_code=400, detail="Неподдерживаемый формат монеты")
    return value


def _f(value: Any) -> float:
    try:
        n = float(value)
        return n if math.isfinite(n) else 0.0
    except Exception:
        return 0.0


async def _active_contract_symbols(force: bool = False) -> set[str]:
    """Return every currently enabled MEXC USDT perpetual contract.

    MEXC /contract/detail defines state=0 as enabled. The set is cached because
    that endpoint has a much lower rate limit than the ticker feed.
    """
    now = time.monotonic()
    cached = _CONTRACT_CACHE.get("symbols") or set()
    if not force and cached and now - float(_CONTRACT_CACHE.get("at") or 0.0) < 300.0:
        return set(cached)
    try:
        async with httpx.AsyncClient(timeout=12.0, follow_redirects=True) as client:
            response = await client.get(MEXC_CONTRACT_DETAIL_URL)
            response.raise_for_status()
            payload = response.json()
        if not isinstance(payload, dict) or not payload.get("success"):
            raise ValueError((payload or {}).get("message") if isinstance(payload, dict) else "invalid payload")
        data = payload.get("data") or []
        if isinstance(data, dict):
            data = [data]
        symbols: set[str] = set()
        for item in data:
            if not isinstance(item, dict):
                continue
            symbol = str(item.get("symbol") or "").upper()
            quote = str(item.get("quoteCoin") or "").upper()
            try:
                state = int(item.get("state"))
            except (TypeError, ValueError):
                state = -1
            if state != 0 or quote != "USDT" or not _SYMBOL_RE.fullmatch(symbol):
                continue
            symbols.add(symbol)
        if not symbols:
            raise ValueError("MEXC returned no enabled USDT futures")
        _CONTRACT_CACHE["at"] = now
        _CONTRACT_CACHE["symbols"] = set(symbols)
        return symbols
    except (httpx.HTTPError, ValueError) as exc:
        if cached:
            return set(cached)
        raise HTTPException(status_code=502, detail=f"Ошибка списка активных MEXC futures: {exc}") from exc


async def _ticker_rows(force: bool = False) -> list[dict[str, Any]]:
    now = time.monotonic()
    if not force and _TICKER_CACHE["rows"] and now - float(_TICKER_CACHE["at"]) < 8.0:
        return list(_TICKER_CACHE["rows"])
    try:
        async with httpx.AsyncClient(timeout=12.0, follow_redirects=True) as client:
            response = await client.get(MEXC_TICKER_URL)
            response.raise_for_status()
            payload = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        if _TICKER_CACHE["rows"]:
            return list(_TICKER_CACHE["rows"])
        raise HTTPException(status_code=502, detail=f"Ошибка MEXC ticker: {exc}") from exc

    if not payload.get("success"):
        raise HTTPException(status_code=502, detail=payload.get("message") or "Ошибка MEXC")

    data = payload.get("data") or []
    if isinstance(data, dict):
        data = [data]
    active = await _active_contract_symbols(force=force)

    rows: list[dict[str, Any]] = []
    for item in data:
        if not isinstance(item, dict):
            continue
        symbol = str(item.get("symbol") or "").upper()
        if not _SYMBOL_RE.fullmatch(symbol) or symbol not in active:
            continue
        rows.append({
            "symbol": symbol,
            "last_price": _f(item.get("lastPrice")),
            "fair_price": _f(item.get("fairPrice")),
            "index_price": _f(item.get("indexPrice")),
            "bid": _f(item.get("bid1")),
            "ask": _f(item.get("ask1")),
            "funding_rate": _f(item.get("fundingRate")),
            "change_24h": _f(item.get("riseFallRate")) * 100.0,
            "open_interest": _f(item.get("holdVol")),
            "volume_24h": _f(item.get("volume24")),
            "amount_24h": _f(item.get("amount24")),
            "high_24h": _f(item.get("high24Price")),
            "low_24h": _f(item.get("lower24Price")),
        })

    rows.sort(key=lambda x: (float(x.get("amount_24h") or 0.0), float(x.get("volume_24h") or 0.0)), reverse=True)
    _TICKER_CACHE["at"] = now
    _TICKER_CACHE["rows"] = rows
    return list(rows)


async def _ticker_one(symbol: str) -> dict[str, Any]:
    rows = await _ticker_rows()
    for row in rows:
        if row["symbol"] == symbol:
            return row

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(MEXC_TICKER_URL, params={"symbol": symbol})
            response.raise_for_status()
            payload = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(status_code=502, detail=f"Ошибка MEXC ticker: {exc}") from exc
    data = payload.get("data") or {}
    if not payload.get("success") or not isinstance(data, dict):
        raise HTTPException(status_code=404, detail="Монета не найдена на MEXC futures")
    return {
        "symbol": symbol,
        "last_price": _f(data.get("lastPrice")),
        "fair_price": _f(data.get("fairPrice")),
        "index_price": _f(data.get("indexPrice")),
        "bid": _f(data.get("bid1")),
        "ask": _f(data.get("ask1")),
        "funding_rate": _f(data.get("fundingRate")),
        "change_24h": _f(data.get("riseFallRate")) * 100.0,
        "open_interest": _f(data.get("holdVol")),
        "volume_24h": _f(data.get("volume24")),
        "amount_24h": _f(data.get("amount24")),
        "high_24h": _f(data.get("high24Price")),
        "low_24h": _f(data.get("lower24Price")),
    }


async def _klines(symbol: str, timeframe: str, limit: int = 260) -> list[dict[str, Any]]:
    if timeframe not in TIMEFRAMES:
        raise HTTPException(status_code=400, detail="Неподдерживаемый таймфрейм")
    mexc_interval, seconds = TIMEFRAMES[timeframe]
    limit = max(60, min(700, int(limit)))
    end_ts = int(time.time())
    start_ts = end_ts - seconds * (limit + 30)
    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            response = await client.get(
                MEXC_KLINE_URL.format(symbol=symbol),
                params={"interval": mexc_interval, "start": start_ts, "end": end_ts},
            )
            response.raise_for_status()
            payload = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(status_code=502, detail=f"Ошибка свечей MEXC: {exc}") from exc
    if not payload.get("success"):
        raise HTTPException(status_code=502, detail=payload.get("message") or "Ошибка MEXC")
    data = payload.get("data") or {}
    keys = ("time", "open", "high", "low", "close", "vol")
    if any(key not in data for key in keys):
        raise HTTPException(status_code=502, detail="MEXC вернул неполные свечи")
    size = min(len(data[key]) for key in keys)
    rows = [
        {
            "time": int(data["time"][i]),
            "open": _f(data["open"][i]),
            "high": _f(data["high"][i]),
            "low": _f(data["low"][i]),
            "close": _f(data["close"][i]),
            "volume": _f(data["vol"][i]),
        }
        for i in range(size)
    ]
    rows.sort(key=lambda x: int(x["time"]))
    return rows[-limit:]



async def _bybit_usdt_symbols(force: bool = False) -> list[str]:
    now = time.monotonic()
    cached = list(_BYBIT_SYMBOL_CACHE.get("symbols") or [])
    if not force and cached and now - float(_BYBIT_SYMBOL_CACHE.get("at") or 0.0) < 300.0:
        return cached
    try:
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
            response = await client.get(
                BYBIT_INSTRUMENTS_URL,
                params={"category": "linear", "limit": 1000},
                headers={"User-Agent": "ASCEND-Terminal/2.3"},
            )
            response.raise_for_status()
            payload = response.json()
        result = payload.get("result") or {}
        raw = result.get("list") or []
        symbols = sorted({
            str(item.get("symbol") or "").upper()
            for item in raw
            if isinstance(item, dict)
            and str(item.get("status") or "").lower() == "trading"
            and str(item.get("quoteCoin") or "").upper() == "USDT"
            and str(item.get("symbol") or "").upper().endswith("USDT")
        })
        if not symbols:
            raise ValueError("Bybit returned no active USDT linear symbols")
        _BYBIT_SYMBOL_CACHE["at"] = now
        _BYBIT_SYMBOL_CACHE["symbols"] = symbols
        return list(symbols)
    except Exception:
        if cached:
            return cached
        return []


async def _candidate_rows_for_session(limit: int = 15) -> list[dict[str, Any]]:
    now = time.monotonic()
    cached = _CANDIDATE_CACHE.get("data")
    if isinstance(cached, dict) and now - float(_CANDIDATE_CACHE.get("at") or 0.0) < 20.0:
        rows = cached.get("rows") or []
        if isinstance(rows, list) and rows:
            return [x for x in rows[:limit] if isinstance(x, dict)]

    try:
        async with httpx.AsyncClient(timeout=6.0, follow_redirects=True) as client:
            response = await client.get(
                RADAR_CANDIDATES_URL,
                params={"limit": int(limit)},
                headers={"User-Agent": "ASCEND-Terminal/2.3"},
            )
            response.raise_for_status()
            data = response.json()
        if isinstance(data, dict):
            _CANDIDATE_CACHE["at"] = now
            _CANDIDATE_CACHE["data"] = data
            rows = data.get("rows") or []
            if isinstance(rows, list) and rows:
                return [x for x in rows[:limit] if isinstance(x, dict)]
    except Exception:
        pass

    if isinstance(cached, dict):
        rows = cached.get("rows") or []
        if isinstance(rows, list) and rows:
            return [x for x in rows[:limit] if isinstance(x, dict)]

    # Last-resort fallback: use liquid movers, but mark them as market fallback
    # in the response so the UI never confuses them with production radar picks.
    tickers = await _ticker_rows()
    ranked = sorted(
        tickers,
        key=lambda x: abs(_f(x.get("change_24h"))) * max(1.0, math.log10(max(10.0, _f(x.get("amount_24h"))))),
        reverse=True,
    )
    return [
        {
            "symbol": row.get("symbol"),
            "status": "MARKET",
            "direction": "LONG" if _f(row.get("change_24h")) > 0 else "SHORT" if _f(row.get("change_24h")) < 0 else "NEUTRAL",
            "score": 0,
        }
        for row in ranked[:limit]
    ]


def _latest_session_handoff(now_ts: int) -> dict[str, Any]:
    # The terminal intentionally uses fixed UTC+3 session labels, matching its
    # existing session panel. We compare the newest session open with the
    # immediately preceding handoff range.
    offset = 3 * 3600
    local_now = int(now_ts) + offset
    day = (local_now // 86400) * 86400

    specs = (
        ("SYDNEY", "НЬЮ-ЙОРК", 22 * 3600, 14 * 3600, 0),
        ("ASIA", "СИДНЕЙ", 3 * 3600, 22 * 3600, -1),
        ("LONDON", "АЗИЯ", 8 * 3600, 3 * 3600, 0),
        ("NEW YORK", "ЛОНДОН", 14 * 3600, 8 * 3600, 0),
    )
    candidates: list[dict[str, Any]] = []
    for day_shift in (-86400, 0):
        base = day + day_shift
        for name, prev_name, start_sec, prev_sec, prev_day_shift in specs:
            start_local = base + start_sec
            if start_local > local_now:
                continue
            prev_local = base + prev_sec + (prev_day_shift * 86400)
            candidates.append({
                "session": name,
                "previous_session": prev_name,
                "open_ts": int(start_local - offset),
                "previous_open_ts": int(prev_local - offset),
            })
    if not candidates:
        return {
            "session": "—",
            "previous_session": "—",
            "open_ts": now_ts - 3600,
            "previous_open_ts": now_ts - 6 * 3600,
        }
    return max(candidates, key=lambda x: int(x["open_ts"]))


def _session_classification(
    symbol: str,
    rows: list[dict[str, Any]],
    handoff: dict[str, Any],
    candidate: dict[str, Any],
) -> dict[str, Any] | None:
    open_ts = int(handoff["open_ts"])
    prev_ts = int(handoff["previous_open_ts"])
    prev = [x for x in rows if prev_ts <= int(x.get("time") or 0) < open_ts]
    current = [x for x in rows if int(x.get("time") or 0) >= open_ts]
    if len(prev) < 8 or len(current) < 2:
        return None

    prev_high = max(_f(x.get("high")) for x in prev)
    prev_low = min(_f(x.get("low")) for x in prev)
    span = prev_high - prev_low
    if span <= 0:
        return None

    open_price = _f(current[0].get("open"))
    current_price = _f(current[-1].get("close"))
    if open_price <= 0 or current_price <= 0:
        return None

    open_pos = (open_price - prev_low) / span * 100.0
    current_pos = (current_price - prev_low) / span * 100.0
    move_from_open = (current_price / open_price - 1.0) * 100.0

    closed_current = current[:-1] if len(current) > 2 else current
    last2 = closed_current[-2:] if len(closed_current) >= 2 else closed_current
    above_hold = len(last2) >= 2 and all(_f(x.get("close")) > prev_high for x in last2)
    below_hold = len(last2) >= 2 and all(_f(x.get("close")) < prev_low for x in last2)
    swept_high = any(_f(x.get("high")) > prev_high for x in current)
    swept_low = any(_f(x.get("low")) < prev_low for x in current)

    if open_pos >= 85.0:
        open_position = "EXTREME HIGH"
    elif open_pos >= 70.0:
        open_position = "HIGH"
    elif open_pos <= 15.0:
        open_position = "EXTREME LOW"
    elif open_pos <= 30.0:
        open_position = "LOW"
    else:
        open_position = "MID"

    reaction = "NEUTRAL"
    bias = "NEUTRAL"
    group = "watch"

    if open_pos >= 70.0:
        rejected = (
            (current_price < open_price and current_pos <= open_pos - 8.0)
            or (swept_high and current_price < prev_high)
        )
        if rejected:
            reaction = "REJECT ↓"
            bias = "SHORT PRESSURE"
            group = "high_reject"
        elif above_hold:
            reaction = "ACCEPT ↑"
            bias = "LONG CONTINUE"
            group = "accept"
        else:
            reaction = "TEST HIGH"
            bias = "WAIT"
            group = "watch"
    elif open_pos <= 30.0:
        rejected = (
            (current_price > open_price and current_pos >= open_pos + 8.0)
            or (swept_low and current_price > prev_low)
        )
        if rejected:
            reaction = "REJECT ↑"
            bias = "LONG PRESSURE"
            group = "low_reject"
        elif below_hold:
            reaction = "ACCEPT ↓"
            bias = "SHORT CONTINUE"
            group = "accept"
        else:
            reaction = "TEST LOW"
            bias = "WAIT"
            group = "watch"
    else:
        if above_hold:
            reaction = "BREAK + ACCEPT ↑"
            bias = "LONG CONTINUE"
            group = "accept"
        elif below_hold:
            reaction = "BREAK + ACCEPT ↓"
            bias = "SHORT CONTINUE"
            group = "accept"
        else:
            reaction = "MID / WAIT"
            bias = "NEUTRAL"
            group = "watch"

    edge_score = min(100.0, abs(open_pos - 50.0) * 2.0)
    reaction_bonus = 20.0 if group in {"high_reject", "low_reject", "accept"} else 0.0
    score = min(100.0, edge_score * 0.72 + reaction_bonus + min(12.0, abs(move_from_open) * 4.0))

    return {
        "symbol": symbol,
        "session": handoff["session"],
        "previous_session": handoff["previous_session"],
        "open_ts": open_ts,
        "previous_open_ts": prev_ts,
        "open_position": open_position,
        "open_pos_pct": round(open_pos, 2),
        "current_pos_pct": round(current_pos, 2),
        "reaction": reaction,
        "bias": bias,
        "group": group,
        "score": round(score, 1),
        "open_price": open_price,
        "current_price": current_price,
        "move_from_open_pct": round(move_from_open, 3),
        "previous_high": prev_high,
        "previous_low": prev_low,
        "swept_high": bool(swept_high),
        "swept_low": bool(swept_low),
        "radar_status": str(candidate.get("status") or "CANDIDATE"),
        "radar_direction": str(candidate.get("direction") or "NEUTRAL"),
        "radar_score": _f(candidate.get("score")),
    }


async def _session_radar(limit: int = 15, force: bool = False) -> dict[str, Any]:
    now_mono = time.monotonic()
    cached = _SESSION_RADAR_CACHE.get("data")
    if not force and isinstance(cached, dict) and now_mono - float(_SESSION_RADAR_CACHE.get("at") or 0.0) < 45.0:
        data = dict(cached)
        data["rows"] = list((data.get("rows") or [])[:limit])
        return data

    now_ts = int(time.time())
    handoff = _latest_session_handoff(now_ts)
    candidates = await _candidate_rows_for_session(max(8, min(15, int(limit))))
    semaphore = asyncio.Semaphore(4)

    async def one(candidate: dict[str, Any]):
        symbol = str(candidate.get("symbol") or "").upper()
        if not _SYMBOL_RE.fullmatch(symbol):
            return None
        async with semaphore:
            try:
                rows = await _klines(symbol, "5m", 320)
                return _session_classification(symbol, rows, handoff, candidate)
            except Exception:
                return None

    scanned = await asyncio.gather(*(one(x) for x in candidates))
    rows = [x for x in scanned if isinstance(x, dict)]
    rows.sort(key=lambda x: (float(x.get("score") or 0.0), abs(float(x.get("move_from_open_pct") or 0.0))), reverse=True)
    counts = {
        "high_reject": sum(1 for x in rows if x.get("group") == "high_reject"),
        "low_reject": sum(1 for x in rows if x.get("group") == "low_reject"),
        "accept": sum(1 for x in rows if x.get("group") == "accept"),
        "watch": sum(1 for x in rows if x.get("group") == "watch"),
    }
    data = {
        "session": handoff["session"],
        "previous_session": handoff["previous_session"],
        "open_ts": handoff["open_ts"],
        "previous_open_ts": handoff["previous_open_ts"],
        "rows": rows,
        "counts": counts,
        "scanned": len(candidates),
        "updated_ts": now_ts,
        "basis": "CURRENT SESSION OPEN vs PREVIOUS HANDOFF RANGE · 5m · observational",
    }
    _SESSION_RADAR_CACHE["at"] = now_mono
    _SESSION_RADAR_CACHE["data"] = data
    return dict(data)


def _median(values: list[float]) -> float:
    vals = [float(x) for x in values if float(x) > 0 and math.isfinite(float(x))]
    return float(statistics.median(vals)) if vals else 0.0


def _volume_profile_from_rows(symbol: str, rows: list[dict[str, Any]]) -> dict[str, Any]:
    # Use only closed candles: the newest MEXC candle can still be forming.
    closed = rows[:-1] if len(rows) > 2 else rows
    if len(closed) < 25:
        return {
            "symbol": symbol,
            "standard_volume": 0.0,
            "current_volume": 0.0,
            "ratio": 0.0,
            "deviation_pct": 0.0,
            "percentile": 0.0,
            "class": "NO DATA",
        }
    current = closed[-1]
    previous = closed[-21:-1]
    standard = _median([_f(x.get("volume")) for x in previous])
    current_volume = _f(current.get("volume"))
    ratio = current_volume / standard if standard > 0 else 0.0

    ratios: list[float] = []
    volumes = [_f(x.get("volume")) for x in closed]
    for i in range(20, len(volumes)):
        base = _median(volumes[i - 20:i])
        if base > 0:
            ratios.append(volumes[i] / base)
    if ratios:
        percentile = sum(1 for x in ratios if x <= ratio) / len(ratios) * 100.0
    else:
        percentile = 0.0

    if percentile >= 97.0:
        cls = "EXTREME VOLUME"
    elif percentile >= 90.0:
        cls = "STRONG VOLUME"
    elif percentile >= 75.0:
        cls = "ELEVATED VOLUME"
    else:
        cls = "NORMAL VOLUME"

    prev_close = _f(closed[-2].get("close")) if len(closed) > 1 else 0.0
    move_pct = ((_f(current.get("close")) - prev_close) / prev_close * 100.0) if prev_close else 0.0
    return {
        "symbol": symbol,
        "standard_volume": standard,
        "current_volume": current_volume,
        "ratio": ratio,
        "deviation_pct": (ratio - 1.0) * 100.0 if ratio else 0.0,
        "percentile": percentile,
        "class": cls,
        "move_pct": move_pct,
        "candle_time": int(current.get("time") or 0),
    }


async def _profile(symbol: str, force: bool = False) -> dict[str, Any]:
    now = time.monotonic()
    cached = _PROFILE_CACHE.get(symbol)
    if cached and not force and now - cached[0] < 50.0:
        return dict(cached[1])
    rows = await _klines(symbol, "1m", 100)
    result = _volume_profile_from_rows(symbol, rows)
    _PROFILE_CACHE[symbol] = (now, result)
    return dict(result)


async def _news() -> list[dict[str, str]]:
    now = time.monotonic()
    if _NEWS_CACHE["rows"] and now - float(_NEWS_CACHE["at"]) < 240.0:
        return list(_NEWS_CACHE["rows"])

    feeds = (
        ("CoinDesk", "https://www.coindesk.com/arc/outboundfeeds/rss/"),
        ("Decrypt", "https://decrypt.co/feed"),
    )
    high_words = (
        "fed", "rate", "sec", "cftc", "hack", "exploit", "liquidat", "etf",
        "bitcoin", "ethereum", "war", "oil", "sanction", "tariff", "inflation",
    )
    medium_words = ("exchange", "stablecoin", "regulat", "token", "crypto", "treasury")
    rows: list[dict[str, str]] = []

    async with httpx.AsyncClient(
        timeout=5.0,
        follow_redirects=True,
        headers={"User-Agent": "ASCEND-Terminal/2.0"},
    ) as client:
        for source, url in feeds:
            try:
                response = await client.get(url)
                response.raise_for_status()
                root = ET.fromstring(response.content)
                for item in root.findall(".//item")[:10]:
                    title = (item.findtext("title") or "").strip()
                    link = (item.findtext("link") or "").strip()
                    published = (item.findtext("pubDate") or "").strip()
                    if not title:
                        continue
                    low = title.lower()
                    impact = "HIGH" if any(w in low for w in high_words) else "MEDIUM" if any(w in low for w in medium_words) else "INFO"
                    try:
                        published_dt = parsedate_to_datetime(published) if published else None
                        published_ts = int(published_dt.timestamp()) if published_dt else 0
                    except Exception:
                        published_ts = 0
                    rows.append({
                        "source": source,
                        "title": title,
                        "link": link,
                        "published": published,
                        "published_ts": published_ts,
                        "impact": impact,
                    })
            except Exception:
                continue

    seen: set[str] = set()
    clean: list[dict[str, str]] = []
    for row in rows:
        key = row["title"].lower()
        if key in seen:
            continue
        seen.add(key)
        clean.append(row)
    _NEWS_CACHE["at"] = now
    _NEWS_CACHE["rows"] = clean[:14]
    return clean[:14]


def install(app: Any) -> None:
    @app.get("/api/v2/macro/daily")
    async def macro_daily():
        # Observations only; not a live quote and not a trading filter.
        return JSONResponse(await macro_fred.snapshot(),
                            headers={"Cache-Control": "private, no-store"})

    @app.get("/api/v2/status")
    async def status():
        return {
            "ok": True,
            "service": "ASCEND Terminal API v2",
            "universe_target": "ALL_ACTIVE_MEXC_USDT_FUTURES",
            "volume_profile": "per-symbol 1m median-20 + percentile",
        }

    @app.get("/api/v2/symbols")
    async def symbols(limit: int = Query(default=0, ge=0, le=5000)):
        rows = await _ticker_rows()
        selected = rows if int(limit) <= 0 else rows[: int(limit)]
        return JSONResponse(
            {"count": len(selected), "symbols": selected},
            headers={"Cache-Control": "no-store"},
        )

    @app.get("/api/v2/bybit-symbols")
    async def bybit_symbols():
        symbols = await _bybit_usdt_symbols()
        return JSONResponse(
            {"count": len(symbols), "symbols": symbols},
            headers={"Cache-Control": "no-store"},
        )

    @app.get("/api/v2/session-radar")
    async def session_radar(limit: int = Query(default=15, ge=4, le=15)):
        return JSONResponse(
            await _session_radar(limit=int(limit)),
            headers={"Cache-Control": "no-store"},
        )

    @app.get("/api/v2/ticker")
    async def ticker(symbol: str = Query(default="BTC_USDT")):
        safe = _safe_symbol(symbol)
        row = await _ticker_one(safe)
        return JSONResponse(row, headers={"Cache-Control": "no-store"})

    @app.get("/api/v2/klines")
    async def klines(
        symbol: str = Query(default="BTC_USDT"),
        timeframe: str = Query(default="5m"),
        limit: int = Query(default=260, ge=60, le=700),
    ):
        safe = _safe_symbol(symbol)
        rows = await _klines(safe, timeframe, limit)

        # Reuse the 1m data the terminal already requests instead of adding extra
        # exchange calls. Writes are throttled per symbol to keep storage cheap.
        if timeframe == "1m":
            now_mono = time.monotonic()
            if now_mono - float(_HISTORY_SAVE_AT.get(safe) or 0.0) >= 45.0:
                _HISTORY_SAVE_AT[safe] = now_mono
                asyncio.create_task(history_store.save_candles("mexc", safe, rows))
                asyncio.create_task(history_store.touch_symbol(safe, priority=100))

        return JSONResponse(
            {"symbol": safe, "timeframe": timeframe, "candles": rows, "server_time": int(time.time())},
            headers={"Cache-Control": "no-store"},
        )

    @app.get("/api/v2/history/status")
    async def history_status():
        return JSONResponse(await history_store.status(), headers={"Cache-Control": "no-store"})

    @app.get("/api/v2/history/candles")
    async def history_candles(
        symbol: str = Query(default="BTC_USDT"),
        exchange: str = Query(default="mexc"),
        timeframe: str = Query(default="5m"),
        start_ts: int = Query(default=0, ge=0),
        end_ts: int = Query(default=0, ge=0),
        limit: int = Query(default=1000, ge=1, le=5000),
    ):
        safe = _safe_symbol(symbol)
        ex = str(exchange or "mexc").lower()
        if ex not in {"mexc", "bybit"}:
            raise HTTPException(status_code=400, detail="exchange must be mexc or bybit")
        if timeframe not in TIMEFRAMES:
            raise HTTPException(status_code=400, detail="unsupported timeframe")
        await history_store.touch_symbol(safe, priority=120)
        rows = await history_store.get_candles(
            ex,
            safe,
            timeframe,
            start_ts=start_ts or None,
            end_ts=end_ts or None,
            limit=limit,
        )
        return JSONResponse(
            {
                "symbol": safe,
                "exchange": ex,
                "timeframe": timeframe,
                "candles": rows,
                "count": len(rows),
            },
            headers={"Cache-Control": "no-store"},
        )

    @app.get("/api/v2/history/transitions")
    async def history_transitions(
        symbol: str = Query(default="BTC_USDT"),
        transition: str = Query(default="LONDON_NY"),
        exchange: str = Query(default="mexc"),
        limit: int = Query(default=5000, ge=1, le=5000),
    ):
        safe = _safe_symbol(symbol)
        ex = str(exchange or "mexc").lower()
        tr = str(transition or "LONDON_NY").upper()
        if ex not in {"mexc", "bybit"}:
            raise HTTPException(status_code=400, detail="exchange must be mexc or bybit")
        if tr not in {"ASIA_LONDON", "LONDON_NY"}:
            raise HTTPException(status_code=400, detail="unsupported transition")
        await history_store.touch_symbol(safe, priority=140)
        return JSONResponse(
            await history_store.transition_stats(safe, tr, exchange=ex, limit=limit),
            headers={"Cache-Control": "no-store"},
        )

    @app.get("/api/v2/volume-profile")
    async def volume_profile(symbol: str = Query(default="BTC_USDT")):
        safe = _safe_symbol(symbol)
        return JSONResponse(await _profile(safe), headers={"Cache-Control": "no-store"})

    @app.get("/api/v2/breadth")
    async def breadth(limit: int = Query(default=0, ge=0, le=5000)):
        # Read the exact breadth produced by the main reversal-radar cycle.
        # This endpoint is observation-only; no terminal calculation can alter
        # the radar or its entries.
        now = time.monotonic()
        cached = _BREADTH_CACHE.get("data")
        if cached and now - float(_BREADTH_CACHE.get("at") or 0.0) < 8.0:
            return JSONResponse(cached, headers={"Cache-Control": "no-store"})
        try:
            async with httpx.AsyncClient(timeout=5.0, follow_redirects=True) as client:
                response = await client.get(RADAR_STATUS_URL, headers={"User-Agent": "ASCEND-Terminal/2.1"})
                response.raise_for_status()
                status = response.json()
            raw = status.get("breadth") or {}
            data = {
                "available": int(raw.get("TOTAL") or status.get("crypto_available_last_cycle") or 0),
                "target": int(raw.get("TARGET") or status.get("breadth_target") or limit),
                "long": int(raw.get("LONG") or 0),
                "short": int(raw.get("SHORT") or 0),
                "neutral": int(raw.get("NEUTRAL") or 0),
                "basis": "LIVE REVERSAL RADAR · 5m structure · same production cycle",
                "source": "ascend-clean radar",
                "cycle": int(status.get("cycles") or 0),
                "last_cycle_ms": status.get("last_cycle_ms"),
                "running": bool(status.get("running")),
            }
            if data["available"] > 0:
                _BREADTH_CACHE["at"] = now
                _BREADTH_CACHE["data"] = data
                return JSONResponse(data, headers={"Cache-Control": "no-store"})
        except Exception:
            pass

        # Fail soft if the production radar is temporarily unreachable. The
        # terminal shows this as fallback so it is never confused with radar data.
        all_rows = await _ticker_rows()
        rows = all_rows if int(limit) <= 0 else all_rows[: int(limit)]
        long_n = short_n = neutral_n = 0
        for row in rows:
            ch = _f(row.get("change_24h"))
            if ch > 0.20:
                long_n += 1
            elif ch < -0.20:
                short_n += 1
            else:
                neutral_n += 1
        data = {
            "available": len(rows),
            "target": len(rows),
            "long": long_n,
            "short": short_n,
            "neutral": neutral_n,
            "basis": "FALLBACK ONLY · 24h price change",
            "source": "fallback",
            "running": False,
        }
        return JSONResponse(data, headers={"Cache-Control": "no-store"})

    @app.get("/api/v2/radar-candidates")
    async def radar_candidates(limit: int = Query(default=15, ge=1, le=15)):
        now = time.monotonic()
        cached = _CANDIDATE_CACHE.get("data")
        if cached and now - float(_CANDIDATE_CACHE.get("at") or 0.0) < 8.0:
            data = dict(cached)
            data["rows"] = list((data.get("rows") or [])[: int(limit)])
            return JSONResponse(data, headers={"Cache-Control": "no-store"})
        try:
            async with httpx.AsyncClient(timeout=6.0, follow_redirects=True) as client:
                response = await client.get(
                    RADAR_CANDIDATES_URL,
                    params={"limit": int(limit)},
                    headers={"User-Agent": "ASCEND-Terminal/2.2"},
                )
                response.raise_for_status()
                data = response.json()
            if isinstance(data, dict):
                _CANDIDATE_CACHE["at"] = now
                _CANDIDATE_CACHE["data"] = data
                return JSONResponse(data, headers={"Cache-Control": "no-store"})
        except Exception:
            pass
        fallback = cached if isinstance(cached, dict) else {
            "status": {
                "mode": "PRIMARY_CANDIDATE_RADAR_NO_ENTRY_SEARCH",
                "candidate_count": 0,
                "last_error": "candidate_radar_temporarily_unreachable",
            },
            "rows": [],
        }
        return JSONResponse(fallback, headers={"Cache-Control": "no-store"})

    @app.get("/api/v2/spikes")
    async def spikes(
        offset: int = Query(default=0, ge=0),
        batch: int = Query(default=24, ge=4, le=36),
        universe: int = Query(default=0, ge=0, le=5000),
    ):
        all_tickers = await _ticker_rows()
        tickers = all_tickers if int(universe) <= 0 else all_tickers[: int(universe)]
        symbols = [str(x["symbol"]) for x in tickers]
        if not symbols:
            return {"rows": [], "next_offset": 0, "universe": 0}
        start = int(offset) % len(symbols)
        chosen = [symbols[(start + i) % len(symbols)] for i in range(min(int(batch), len(symbols)))]
        semaphore = asyncio.Semaphore(6)

        async def one(symbol: str):
            async with semaphore:
                try:
                    result = await _profile(symbol, force=True)
                    if result.get("ratio", 0.0) <= 0:
                        return None
                    return result
                except Exception:
                    return None

        results = await asyncio.gather(*(one(symbol) for symbol in chosen))
        rows = [x for x in results if isinstance(x, dict)]
        rows.sort(key=lambda x: (float(x.get("percentile") or 0.0), float(x.get("ratio") or 0.0)), reverse=True)
        next_offset = (start + len(chosen)) % len(symbols)
        return JSONResponse(
            {
                "rows": rows,
                "next_offset": next_offset,
                "scanned": len(chosen),
                "universe": len(symbols),
            },
            headers={"Cache-Control": "no-store"},
        )

    @app.get("/api/v2/news")
    async def news():
        return JSONResponse({"rows": await _news()}, headers={"Cache-Control": "no-store"})
