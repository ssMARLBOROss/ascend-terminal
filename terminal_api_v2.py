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

MEXC_BASE_URL = "https://api.mexc.com"
MEXC_KLINE_URL = MEXC_BASE_URL + "/api/v1/contract/kline/{symbol}"
MEXC_TICKER_URL = MEXC_BASE_URL + "/api/v1/contract/ticker"
MEXC_CONTRACT_DETAIL_URL = MEXC_BASE_URL + "/api/v1/contract/detail"
RADAR_STATUS_URL = "https://ascend-clean-production.up.railway.app/api/telegram-reversal-41/status"
RADAR_CANDIDATES_URL = "https://ascend-clean-production.up.railway.app/api/radar-candidates-v2/latest"

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
        return JSONResponse(
            {"symbol": safe, "timeframe": timeframe, "candles": rows, "server_time": int(time.time())},
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
