from __future__ import annotations

import asyncio
import csv
import gzip
import io
import logging
import os
import time
from datetime import datetime, timezone
from typing import Any, Iterable

import asyncpg
import httpx

logger = logging.getLogger("ascend.history")

MEXC_KLINE_URL = "https://api.mexc.com/api/v1/contract/kline/{symbol}"
MEXC_DETAIL_URL = "https://api.mexc.com/api/v1/contract/detail"
BYBIT_KLINE_URL = "https://api.bybit.com/v5/market/kline"
BYBIT_INSTRUMENTS_URL = "https://api.bybit.com/v5/market/instruments-info"

TF_SECONDS = {
    "1m": 60,
    "5m": 300,
    "15m": 900,
    "1h": 3600,
    "4h": 14400,
    "1d": 86400,
}

_pool: asyncpg.Pool | None = None
_stop = asyncio.Event()
_tasks: list[asyncio.Task[Any]] = []
_last_seed_at = 0.0
_last_archive_at = 0.0


def _f(v: Any) -> float:
    try:
        n = float(v)
        return n if n == n and n not in (float("inf"), float("-inf")) else 0.0
    except Exception:
        return 0.0


def _safe_symbol(symbol: str) -> str:
    return str(symbol or "").strip().upper().replace("/", "_").replace("-", "_")


def _archive_enabled() -> bool:
    railway_bucket = all(
        os.getenv(k, "").strip()
        for k in (
            "HISTORY_ARCHIVE_ENDPOINT",
            "HISTORY_ARCHIVE_BUCKET",
            "AWS_ACCESS_KEY_ID",
            "AWS_SECRET_ACCESS_KEY",
        )
    )
    r2_bucket = all(
        os.getenv(k, "").strip()
        for k in ("R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET")
    )
    return bool(railway_bucket or r2_bucket)


async def init() -> bool:
    global _pool, _tasks
    dsn = os.getenv("DATABASE_URL", "").strip()
    if not dsn:
        logger.warning("DATABASE_URL is not configured; history storage stays disabled")
        return False
    if _pool is not None:
        return True

    _pool = await asyncpg.create_pool(dsn=dsn, min_size=1, max_size=4, command_timeout=45)
    async with _pool.acquire() as con:
        await con.execute(
            """
            CREATE TABLE IF NOT EXISTS market_candles_1m (
                exchange TEXT NOT NULL,
                symbol TEXT NOT NULL,
                ts BIGINT NOT NULL,
                open DOUBLE PRECISION NOT NULL,
                high DOUBLE PRECISION NOT NULL,
                low DOUBLE PRECISION NOT NULL,
                close DOUBLE PRECISION NOT NULL,
                volume DOUBLE PRECISION NOT NULL DEFAULT 0,
                turnover DOUBLE PRECISION NOT NULL DEFAULT 0,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                PRIMARY KEY (exchange, symbol, ts)
            );
            CREATE INDEX IF NOT EXISTS idx_market_candles_lookup
                ON market_candles_1m(exchange, symbol, ts DESC);

            CREATE TABLE IF NOT EXISTS history_backfill (
                exchange TEXT NOT NULL,
                symbol TEXT NOT NULL,
                cursor_end BIGINT,
                priority INTEGER NOT NULL DEFAULT 10,
                status TEXT NOT NULL DEFAULT 'PENDING',
                attempts INTEGER NOT NULL DEFAULT 0,
                oldest_ts BIGINT,
                newest_ts BIGINT,
                last_error TEXT,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                PRIMARY KEY (exchange, symbol)
            );
            CREATE INDEX IF NOT EXISTS idx_history_backfill_queue
                ON history_backfill(status, priority DESC, updated_at ASC);

            CREATE TABLE IF NOT EXISTS session_transition_events (
                exchange TEXT NOT NULL,
                symbol TEXT NOT NULL,
                day_utc DATE NOT NULL,
                transition TEXT NOT NULL,
                transition_ts BIGINT NOT NULL,
                prev_high DOUBLE PRECISION NOT NULL,
                prev_low DOUBLE PRECISION NOT NULL,
                prev_move_pct DOUBLE PRECISION NOT NULL,
                prev_avg_volume DOUBLE PRECISION NOT NULL,
                next_avg_volume DOUBLE PRECISION NOT NULL,
                volume_ratio DOUBLE PRECISION NOT NULL,
                sweep_side TEXT,
                reclaim BOOLEAN NOT NULL DEFAULT FALSE,
                power TEXT NOT NULL,
                outcome_15m DOUBLE PRECISION,
                outcome_30m DOUBLE PRECISION,
                outcome_60m DOUBLE PRECISION,
                outcome_180m DOUBLE PRECISION,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                PRIMARY KEY(exchange, symbol, day_utc, transition)
            );
            CREATE INDEX IF NOT EXISTS idx_transition_lookup
                ON session_transition_events(symbol, transition, transition_ts DESC);

            CREATE TABLE IF NOT EXISTS history_archives (
                exchange TEXT NOT NULL,
                symbol TEXT NOT NULL,
                year INTEGER NOT NULL,
                month INTEGER NOT NULL,
                object_key TEXT NOT NULL,
                row_count INTEGER NOT NULL,
                min_ts BIGINT NOT NULL,
                max_ts BIGINT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                PRIMARY KEY(exchange, symbol, year, month)
            );
            """
        )

    _stop.clear()
    _tasks = []
    if os.getenv("HISTORY_ENABLE_BACKFILL", "1").strip() != "0":
        _tasks.append(asyncio.create_task(_backfill_loop(), name="ascend-history-backfill"))
    if os.getenv("HISTORY_ENABLE_SEED", "1").strip() != "0":
        _tasks.append(asyncio.create_task(_seed_loop(), name="ascend-history-seed"))
    if os.getenv("HISTORY_ENABLE_ARCHIVE", "1").strip() != "0":
        _tasks.append(asyncio.create_task(_archive_loop(), name="ascend-history-archive"))
    logger.info("ASCEND history storage initialized")
    return True


async def shutdown() -> None:
    global _pool, _tasks
    _stop.set()
    for task in _tasks:
        task.cancel()
    for task in _tasks:
        try:
            await task
        except asyncio.CancelledError:
            pass
        except Exception:
            logger.exception("history task shutdown failed")
    _tasks = []
    if _pool is not None:
        await _pool.close()
        _pool = None


async def status() -> dict[str, Any]:
    if _pool is None:
        return {"enabled": False, "archive_enabled": _archive_enabled()}
    async with _pool.acquire() as con:
        counts = await con.fetchrow(
            """
            SELECT
              (SELECT count(*) FROM market_candles_1m) AS candles,
              (SELECT count(*) FROM history_backfill WHERE status='DONE') AS done_jobs,
              (SELECT count(*) FROM history_backfill WHERE status<>'DONE') AS active_jobs,
              (SELECT count(*) FROM session_transition_events) AS transitions,
              (SELECT count(*) FROM history_archives) AS archives
            """
        )
        coverage = await con.fetch(
            """
            SELECT exchange, count(DISTINCT symbol) symbols,
                   min(ts) min_ts, max(ts) max_ts
            FROM market_candles_1m
            GROUP BY exchange
            ORDER BY exchange
            """
        )
    return {
        "enabled": True,
        "archive_enabled": _archive_enabled(),
        "archive_backend": "railway-bucket" if os.getenv("HISTORY_ARCHIVE_BUCKET", "").strip() else ("r2" if os.getenv("R2_BUCKET", "").strip() else None),
        "full_backfill_enabled": _archive_enabled() or os.getenv("HISTORY_ALLOW_FULL_BACKFILL", "").strip() == "1",
        "hot_days": int(os.getenv("HISTORY_HOT_DAYS", "30")),
        "exchange_filter": os.getenv("HISTORY_EXCHANGE_FILTER", "").strip().lower() or "all",
        "candles": int(counts["candles"] or 0),
        "backfill_done": int(counts["done_jobs"] or 0),
        "backfill_active": int(counts["active_jobs"] or 0),
        "transition_events": int(counts["transitions"] or 0),
        "archive_objects": int(counts["archives"] or 0),
        "coverage": [dict(x) for x in coverage],
    }


async def save_candles(exchange: str, symbol: str, rows: Iterable[dict[str, Any]]) -> int:
    if _pool is None:
        return 0
    exchange = str(exchange or "").lower().strip()
    symbol = _safe_symbol(symbol)
    minute_now = int(time.time() // 60 * 60)
    values: list[tuple[Any, ...]] = []
    touched_days: set[str] = set()
    for row in rows:
        ts = int(_f(row.get("time") or row.get("ts")))
        if ts <= 0 or ts >= minute_now:
            continue
        values.append(
            (
                exchange,
                symbol,
                ts,
                _f(row.get("open")),
                _f(row.get("high")),
                _f(row.get("low")),
                _f(row.get("close")),
                _f(row.get("volume")),
                _f(row.get("turnover")),
            )
        )
        touched_days.add(datetime.fromtimestamp(ts, tz=timezone.utc).date().isoformat())
    if not values:
        return 0

    async with _pool.acquire() as con:
        await con.executemany(
            """
            INSERT INTO market_candles_1m
              (exchange, symbol, ts, open, high, low, close, volume, turnover)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
            ON CONFLICT(exchange, symbol, ts) DO UPDATE SET
              open=EXCLUDED.open,
              high=EXCLUDED.high,
              low=EXCLUDED.low,
              close=EXCLUDED.close,
              volume=EXCLUDED.volume,
              turnover=EXCLUDED.turnover
            """,
            values,
        )

    if touched_days:
        asyncio.create_task(
            rebuild_transitions(exchange, symbol, sorted(touched_days)),
            name=f"transitions-{exchange}-{symbol}",
        )
    return len(values)


async def touch_symbol(symbol: str, priority: int = 100) -> None:
    if _pool is None:
        return
    symbol = _safe_symbol(symbol)
    now_cursor = int(time.time() // 60 * 60) - 60
    async with _pool.acquire() as con:
        for exchange in ("mexc", "bybit"):
            await con.execute(
                """
                INSERT INTO history_backfill(exchange, symbol, cursor_end, priority, status, updated_at)
                VALUES($1,$2,$3,$4,'PENDING',now())
                ON CONFLICT(exchange, symbol) DO UPDATE SET
                  priority=GREATEST(history_backfill.priority, EXCLUDED.priority),
                  status=CASE WHEN history_backfill.status='DONE' THEN 'DONE' ELSE 'PENDING' END,
                  updated_at=now()
                """,
                exchange,
                symbol,
                now_cursor,
                int(priority),
            )


async def get_candles(
    exchange: str,
    symbol: str,
    timeframe: str = "5m",
    start_ts: int | None = None,
    end_ts: int | None = None,
    limit: int = 1000,
) -> list[dict[str, Any]]:
    if _pool is None:
        return []
    exchange = str(exchange or "mexc").lower()
    symbol = _safe_symbol(symbol)
    bucket = TF_SECONDS.get(timeframe)
    if bucket is None:
        raise ValueError("unsupported timeframe")
    limit = max(1, min(int(limit), 5000))
    end_ts = int(end_ts or time.time())
    start_ts = int(start_ts or 0)

    async with _pool.acquire() as con:
        rows = await con.fetch(
            """
            WITH src AS (
              SELECT ts, open, high, low, close, volume, turnover,
                     (ts / $5::bigint) * $5::bigint AS bucket
              FROM market_candles_1m
              WHERE exchange=$1 AND symbol=$2
                AND ts >= $3 AND ts <= $4
            ),
            agg AS (
              SELECT bucket,
                     (array_agg(open ORDER BY ts ASC))[1] AS open,
                     max(high) AS high,
                     min(low) AS low,
                     (array_agg(close ORDER BY ts DESC))[1] AS close,
                     sum(volume) AS volume,
                     sum(turnover) AS turnover
              FROM src
              GROUP BY bucket
              ORDER BY bucket DESC
              LIMIT $6
            )
            SELECT * FROM agg ORDER BY bucket ASC
            """,
            exchange,
            symbol,
            start_ts,
            end_ts,
            bucket,
            limit,
        )
    return [
        {
            "time": int(r["bucket"]),
            "open": float(r["open"]),
            "high": float(r["high"]),
            "low": float(r["low"]),
            "close": float(r["close"]),
            "volume": float(r["volume"] or 0),
            "turnover": float(r["turnover"] or 0),
        }
        for r in rows
    ]


async def transition_stats(
    symbol: str,
    transition: str,
    exchange: str = "mexc",
    limit: int = 5000,
) -> dict[str, Any]:
    if _pool is None:
        return {"enabled": False, "count": 0, "rows": []}
    symbol = _safe_symbol(symbol)
    exchange = str(exchange or "mexc").lower()
    transition = str(transition or "LONDON_NY").upper()
    limit = max(1, min(int(limit), 5000))
    async with _pool.acquire() as con:
        rows = await con.fetch(
            """
            SELECT day_utc, transition_ts, prev_high, prev_low, prev_move_pct,
                   prev_avg_volume, next_avg_volume, volume_ratio, sweep_side,
                   reclaim, power, outcome_15m, outcome_30m, outcome_60m, outcome_180m
            FROM session_transition_events
            WHERE exchange=$1 AND symbol=$2 AND transition=$3
            ORDER BY transition_ts DESC
            LIMIT $4
            """,
            exchange,
            symbol,
            transition,
            limit,
        )
    items = [dict(r) for r in rows]
    for item in items:
        if item.get("day_utc") is not None:
            item["day_utc"] = item["day_utc"].isoformat()

    def _summary(field: str) -> dict[str, Any]:
        vals = [float(x[field]) for x in items if x.get(field) is not None]
        if not vals:
            return {"n": 0, "up": 0, "down": 0, "avg_pct": 0.0}
        return {
            "n": len(vals),
            "up": sum(1 for v in vals if v > 0),
            "down": sum(1 for v in vals if v < 0),
            "avg_pct": sum(vals) / len(vals),
        }

    power_counts: dict[str, int] = {}
    for item in items:
        power_counts[str(item.get("power") or "UNKNOWN")] = power_counts.get(str(item.get("power") or "UNKNOWN"), 0) + 1

    return {
        "enabled": True,
        "exchange": exchange,
        "symbol": symbol,
        "transition": transition,
        "count": len(items),
        "outcome_15m": _summary("outcome_15m"),
        "outcome_30m": _summary("outcome_30m"),
        "outcome_60m": _summary("outcome_60m"),
        "outcome_180m": _summary("outcome_180m"),
        "power_counts": power_counts,
        "rows": items[:200],
    }


async def rebuild_transitions(exchange: str, symbol: str, day_strings: list[str]) -> None:
    if _pool is None:
        return
    exchange = str(exchange or "").lower()
    symbol = _safe_symbol(symbol)
    for day_str in day_strings:
        try:
            day = datetime.fromisoformat(day_str).replace(tzinfo=timezone.utc)
        except Exception:
            continue
        day_start = int(day.timestamp())
        rows = await get_candles(exchange, symbol, "1m", day_start - 3600, day_start + 86400 + 6 * 3600, 2000)
        if len(rows) < 90:
            continue
        by_ts = {int(x["time"]): x for x in rows}
        for transition, transition_utc_hour, prev_start_hour in (
            ("ASIA_LONDON", 5, 0),   # 08:00 Kyiv when terminal uses UTC+3
            ("LONDON_NY", 11, 5),    # 14:00 Kyiv when terminal uses UTC+3
        ):
            t0 = day_start + transition_utc_hour * 3600
            prev_start = day_start + prev_start_hour * 3600
            prev = [x for x in rows if prev_start <= int(x["time"]) < t0]
            nxt = [x for x in rows if t0 <= int(x["time"]) < t0 + 3600]
            if len(prev) < 30 or len(nxt) < 20:
                continue

            prev_open = _f(prev[0]["open"])
            prev_close = _f(prev[-1]["close"])
            prev_high = max(_f(x["high"]) for x in prev)
            prev_low = min(_f(x["low"]) for x in prev)
            prev_move = ((prev_close - prev_open) / prev_open * 100.0) if prev_open else 0.0
            prev_avg_v = sum(_f(x["volume"]) for x in prev) / max(1, len(prev))
            next_avg_v = sum(_f(x["volume"]) for x in nxt) / max(1, len(nxt))
            vol_ratio = next_avg_v / prev_avg_v if prev_avg_v > 0 else 0.0

            next_high = max(_f(x["high"]) for x in nxt)
            next_low = min(_f(x["low"]) for x in nxt)
            sweep_side = None
            reclaim = False
            if next_high > prev_high and next_low < prev_low:
                sweep_side = "BOTH"
            elif next_high > prev_high:
                sweep_side = "HIGH"
                reclaim = _f(nxt[-1]["close"]) < prev_high
            elif next_low < prev_low:
                sweep_side = "LOW"
                reclaim = _f(nxt[-1]["close"]) > prev_low

            next_move_abs = abs(_f(nxt[-1]["close"]) - _f(nxt[0]["open"]))
            prev_range = max(prev_high - prev_low, 1e-12)
            if vol_ratio >= 1.20 and next_move_abs >= prev_range * 0.20:
                power = "NEW_STRONGER"
            elif vol_ratio <= 0.80 and sweep_side is None:
                power = "PREV_STRONGER"
            elif sweep_side == "BOTH":
                power = "BALANCED"
            else:
                power = "SHIFTING"

            entry = _f(by_ts.get(t0, nxt[0])["open"])
            def outcome(minutes: int) -> float | None:
                target = t0 + minutes * 60
                candidates = [x for x in rows if int(x["time"]) <= target and int(x["time"]) >= t0]
                if not candidates or not entry:
                    return None
                close = _f(candidates[-1]["close"])
                return (close - entry) / entry * 100.0

            values = (
                exchange,
                symbol,
                day.date(),
                transition,
                t0,
                prev_high,
                prev_low,
                prev_move,
                prev_avg_v,
                next_avg_v,
                vol_ratio,
                sweep_side,
                reclaim,
                power,
                outcome(15),
                outcome(30),
                outcome(60),
                outcome(180),
            )
            async with _pool.acquire() as con:
                await con.execute(
                    """
                    INSERT INTO session_transition_events(
                      exchange,symbol,day_utc,transition,transition_ts,
                      prev_high,prev_low,prev_move_pct,prev_avg_volume,next_avg_volume,
                      volume_ratio,sweep_side,reclaim,power,
                      outcome_15m,outcome_30m,outcome_60m,outcome_180m
                    )
                    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
                    ON CONFLICT(exchange,symbol,day_utc,transition) DO UPDATE SET
                      transition_ts=EXCLUDED.transition_ts,
                      prev_high=EXCLUDED.prev_high,
                      prev_low=EXCLUDED.prev_low,
                      prev_move_pct=EXCLUDED.prev_move_pct,
                      prev_avg_volume=EXCLUDED.prev_avg_volume,
                      next_avg_volume=EXCLUDED.next_avg_volume,
                      volume_ratio=EXCLUDED.volume_ratio,
                      sweep_side=EXCLUDED.sweep_side,
                      reclaim=EXCLUDED.reclaim,
                      power=EXCLUDED.power,
                      outcome_15m=EXCLUDED.outcome_15m,
                      outcome_30m=EXCLUDED.outcome_30m,
                      outcome_60m=EXCLUDED.outcome_60m,
                      outcome_180m=EXCLUDED.outcome_180m,
                      updated_at=now()
                    """,
                    *values,
                )


async def _mexc_universe() -> set[str]:
    async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
        r = await client.get(MEXC_DETAIL_URL)
        r.raise_for_status()
        payload = r.json()
    out: set[str] = set()
    data = payload.get("data") or []
    if isinstance(data, dict):
        data = [data]
    for x in data:
        if not isinstance(x, dict):
            continue
        sym = str(x.get("symbol") or "").upper()
        quote = str(x.get("quoteCoin") or "").upper()
        try:
            enabled = int(x.get("state")) == 0
        except Exception:
            enabled = False
        if enabled and quote == "USDT" and sym.endswith("_USDT"):
            out.add(sym)
    return out


async def _bybit_universe() -> set[str]:
    out: set[str] = set()
    cursor = ""
    async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
        for _ in range(5):
            params = {"category": "linear", "limit": 1000}
            if cursor:
                params["cursor"] = cursor
            r = await client.get(BYBIT_INSTRUMENTS_URL, params=params)
            r.raise_for_status()
            payload = r.json()
            result = payload.get("result") or {}
            for x in result.get("list") or []:
                if (
                    str(x.get("status") or "").lower() == "trading"
                    and str(x.get("quoteCoin") or "").upper() == "USDT"
                ):
                    raw = str(x.get("symbol") or "").upper()
                    if raw.endswith("USDT"):
                        out.add(raw[:-4] + "_USDT")
            cursor = str(result.get("nextPageCursor") or "")
            if not cursor:
                break
    return out


async def seed_universe() -> int:
    global _last_seed_at
    if _pool is None:
        return 0

    # Full-universe 1m backfill is intentionally held until cheap archive storage
    # is available. This prevents an accidentally large Railway Postgres bill.
    allow_full = _archive_enabled() or os.getenv("HISTORY_ALLOW_FULL_BACKFILL", "").strip() == "1"
    if not allow_full:
        defaults = [
            x.strip().upper()
            for x in os.getenv(
                "HISTORY_BOOTSTRAP_SYMBOLS",
                "BTC_USDT,ETH_USDT,SOL_USDT",
            ).split(",")
            if x.strip()
        ]
        for symbol in defaults:
            await touch_symbol(symbol, priority=80)
        _last_seed_at = time.time()
        logger.info(
            "history full-universe seed paused until archive storage is configured; bootstrap=%s",
            ",".join(defaults),
        )
        return len(defaults)

    exchange_filter = os.getenv("HISTORY_EXCHANGE_FILTER", "").strip().lower()
    if exchange_filter == "mexc":
        symbols = sorted(await _mexc_universe())
        exchanges = ("mexc",)
        label = "MEXC"
    elif exchange_filter == "bybit":
        symbols = sorted(await _bybit_universe())
        exchanges = ("bybit",)
        label = "Bybit"
    else:
        mexc, bybit = await asyncio.gather(_mexc_universe(), _bybit_universe())
        symbols = sorted(mexc & bybit)
        exchanges = ("mexc", "bybit")
        label = "common MEXC+Bybit"

    now_cursor = int(time.time() // 60 * 60) - 60
    async with _pool.acquire() as con:
        for symbol in symbols:
            for exchange in exchanges:
                await con.execute(
                    """
                    INSERT INTO history_backfill(exchange,symbol,cursor_end,priority,status,updated_at)
                    VALUES($1,$2,$3,10,'PENDING',now())
                    ON CONFLICT(exchange,symbol) DO NOTHING
                    """,
                    exchange,
                    symbol,
                    now_cursor,
                )
    _last_seed_at = time.time()
    logger.info("history universe seeded: %s %s symbols", len(symbols), label)
    return len(symbols)


async def _seed_loop() -> None:
    while not _stop.is_set():
        try:
            if time.time() - _last_seed_at > 6 * 3600:
                await seed_universe()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("history universe seed failed")
        try:
            await asyncio.wait_for(_stop.wait(), timeout=300)
        except asyncio.TimeoutError:
            pass


async def _fetch_backfill_mexc(symbol: str, end_ts: int) -> list[dict[str, Any]]:
    start_ts = max(0, int(end_ts) - 1000 * 60)
    async with httpx.AsyncClient(timeout=20.0) as client:
        r = await client.get(
            MEXC_KLINE_URL.format(symbol=symbol),
            params={"interval": "Min1", "start": start_ts, "end": int(end_ts)},
        )
        r.raise_for_status()
        p = r.json()
    if not p.get("success"):
        raise RuntimeError(str(p.get("message") or "MEXC kline failed"))
    data = p.get("data") or {}
    keys = ("time", "open", "high", "low", "close", "vol")
    if any(k not in data for k in keys):
        return []
    n = min(len(data[k]) for k in keys)
    rows = []
    for i in range(n):
        rows.append(
            {
                "time": int(_f(data["time"][i])),
                "open": _f(data["open"][i]),
                "high": _f(data["high"][i]),
                "low": _f(data["low"][i]),
                "close": _f(data["close"][i]),
                "volume": _f(data["vol"][i]),
                "turnover": 0.0,
            }
        )
    rows.sort(key=lambda x: x["time"])
    return rows


async def _fetch_backfill_bybit(symbol: str, end_ts: int) -> list[dict[str, Any]]:
    raw_symbol = symbol.replace("_", "")
    async with httpx.AsyncClient(timeout=20.0) as client:
        r = await client.get(
            BYBIT_KLINE_URL,
            params={
                "category": "linear",
                "symbol": raw_symbol,
                "interval": "1",
                "end": int(end_ts) * 1000,
                "limit": 1000,
            },
        )
        r.raise_for_status()
        p = r.json()
    if int(p.get("retCode") or 0) != 0:
        raise RuntimeError(str(p.get("retMsg") or "Bybit kline failed"))
    raw = (p.get("result") or {}).get("list") or []
    rows = []
    for x in raw:
        if not isinstance(x, list) or len(x) < 6:
            continue
        rows.append(
            {
                "time": int(_f(x[0]) // 1000),
                "open": _f(x[1]),
                "high": _f(x[2]),
                "low": _f(x[3]),
                "close": _f(x[4]),
                "volume": _f(x[5]),
                "turnover": _f(x[6]) if len(x) > 6 else 0.0,
            }
        )
    rows.sort(key=lambda x: x["time"])
    return rows


async def _backfill_once() -> bool:
    if _pool is None:
        return False
    async with _pool.acquire() as con:
        exchange_filter = os.getenv("HISTORY_EXCHANGE_FILTER", "").strip().lower()
        job = await con.fetchrow(
            """
            SELECT exchange, symbol, cursor_end, priority, attempts
            FROM history_backfill
            WHERE status IN ('PENDING','RETRY','RUNNING')
              AND ($1 = '' OR exchange = $1)
            ORDER BY priority DESC, updated_at ASC
            LIMIT 1
            """,
            exchange_filter,
        )
        if not job:
            return False
        exchange = str(job["exchange"])
        symbol = str(job["symbol"])
        cursor_end = int(job["cursor_end"] or (time.time() // 60 * 60 - 60))
        await con.execute(
            "UPDATE history_backfill SET status='RUNNING', updated_at=now() WHERE exchange=$1 AND symbol=$2",
            exchange,
            symbol,
        )

    try:
        rows = (
            await _fetch_backfill_mexc(symbol, cursor_end)
            if exchange == "mexc"
            else await _fetch_backfill_bybit(symbol, cursor_end)
        )
        rows = [x for x in rows if int(x["time"]) <= cursor_end]
        earliest_floor = int(datetime(2015, 1, 1, tzinfo=timezone.utc).timestamp())
        if not rows:
            async with _pool.acquire() as con:
                await con.execute(
                    """
                    UPDATE history_backfill
                    SET status='DONE', last_error=NULL, updated_at=now()
                    WHERE exchange=$1 AND symbol=$2
                    """,
                    exchange,
                    symbol,
                )
            return True

        await save_candles(exchange, symbol, rows)
        oldest = min(int(x["time"]) for x in rows)
        newest = max(int(x["time"]) for x in rows)
        next_cursor = oldest - 60
        done = oldest <= earliest_floor or next_cursor <= 0
        async with _pool.acquire() as con:
            await con.execute(
                """
                UPDATE history_backfill
                SET cursor_end=$3,
                    status=$4,
                    attempts=0,
                    oldest_ts=CASE WHEN oldest_ts IS NULL THEN $5 ELSE LEAST(oldest_ts,$5) END,
                    newest_ts=CASE WHEN newest_ts IS NULL THEN $6 ELSE GREATEST(newest_ts,$6) END,
                    last_error=NULL,
                    updated_at=now()
                WHERE exchange=$1 AND symbol=$2
                """,
                exchange,
                symbol,
                next_cursor,
                "DONE" if done else "PENDING",
                oldest,
                newest,
            )
        return True
    except asyncio.CancelledError:
        raise
    except Exception as exc:
        logger.warning("history backfill failed %s %s: %s", exchange, symbol, exc)
        async with _pool.acquire() as con:
            await con.execute(
                """
                UPDATE history_backfill
                SET status='RETRY', attempts=attempts+1, last_error=$3,
                    priority=GREATEST(1,priority-1), updated_at=now()
                WHERE exchange=$1 AND symbol=$2
                """,
                exchange,
                symbol,
                str(exc)[:500],
            )
        return True


async def _backfill_loop() -> None:
    interval = max(1.0, float(os.getenv("HISTORY_BACKFILL_INTERVAL_SEC", "4")))
    while not _stop.is_set():
        try:
            did = await _backfill_once()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("history backfill loop failed")
            did = False
        delay = interval if did else 20.0
        try:
            await asyncio.wait_for(_stop.wait(), timeout=delay)
        except asyncio.TimeoutError:
            pass


def _archive_client():
    import boto3

    endpoint = os.getenv("HISTORY_ARCHIVE_ENDPOINT", "").strip()
    bucket = os.getenv("HISTORY_ARCHIVE_BUCKET", "").strip()
    access_key = os.getenv("AWS_ACCESS_KEY_ID", "").strip()
    secret_key = os.getenv("AWS_SECRET_ACCESS_KEY", "").strip()
    region = os.getenv("AWS_DEFAULT_REGION", "").strip() or "auto"

    if endpoint and bucket and access_key and secret_key:
        return boto3.client(
            "s3",
            endpoint_url=endpoint,
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            region_name=region,
        ), bucket

    endpoint = f"https://{os.environ['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com"
    return (
        boto3.client(
            "s3",
            endpoint_url=endpoint,
            aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
            aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
            region_name="auto",
        ),
        os.environ["R2_BUCKET"],
    )


def _archive_upload_sync(key: str, payload: bytes) -> None:
    client, bucket = _archive_client()
    client.put_object(
        Bucket=bucket,
        Key=key,
        Body=payload,
        ContentType="text/csv",
        ContentEncoding="gzip",
    )


async def archive_once() -> int:
    global _last_archive_at
    if _pool is None or not _archive_enabled():
        return 0
    hot_days = max(7, int(os.getenv("HISTORY_HOT_DAYS", "30")))
    cutoff = int(time.time() - hot_days * 86400)
    async with _pool.acquire() as con:
        parts = await con.fetch(
            """
            SELECT exchange, symbol,
                   EXTRACT(YEAR FROM to_timestamp(ts))::int AS year,
                   EXTRACT(MONTH FROM to_timestamp(ts))::int AS month,
                   min(ts) min_ts, max(ts) max_ts, count(*) row_count
            FROM market_candles_1m
            WHERE ts < $1
            GROUP BY exchange, symbol, year, month
            ORDER BY max_ts ASC
            LIMIT 8
            """,
            cutoff,
        )
    archived = 0
    for p in parts:
        exchange, symbol = str(p["exchange"]), str(p["symbol"])
        year, month = int(p["year"]), int(p["month"])
        async with _pool.acquire() as con:
            exists = await con.fetchval(
                "SELECT 1 FROM history_archives WHERE exchange=$1 AND symbol=$2 AND year=$3 AND month=$4",
                exchange, symbol, year, month,
            )
            if exists:
                continue
            rows = await con.fetch(
                """
                SELECT ts, open, high, low, close, volume, turnover
                FROM market_candles_1m
                WHERE exchange=$1 AND symbol=$2
                  AND EXTRACT(YEAR FROM to_timestamp(ts))::int=$3
                  AND EXTRACT(MONTH FROM to_timestamp(ts))::int=$4
                ORDER BY ts
                """,
                exchange, symbol, year, month,
            )
        if not rows:
            continue
        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow(["ts","open","high","low","close","volume","turnover"])
        for r in rows:
            w.writerow([r["ts"],r["open"],r["high"],r["low"],r["close"],r["volume"],r["turnover"]])
        payload = gzip.compress(buf.getvalue().encode("utf-8"), compresslevel=6)
        key = f"candles/1m/{exchange}/{symbol}/{year:04d}/{month:02d}.csv.gz"
        await asyncio.to_thread(_archive_upload_sync, key, payload)
        async with _pool.acquire() as con:
            async with con.transaction():
                await con.execute(
                    """
                    INSERT INTO history_archives(exchange,symbol,year,month,object_key,row_count,min_ts,max_ts)
                    VALUES($1,$2,$3,$4,$5,$6,$7,$8)
                    ON CONFLICT DO NOTHING
                    """,
                    exchange, symbol, year, month, key, len(rows), int(rows[0]["ts"]), int(rows[-1]["ts"]),
                )
                await con.execute(
                    """
                    DELETE FROM market_candles_1m
                    WHERE exchange=$1 AND symbol=$2
                      AND EXTRACT(YEAR FROM to_timestamp(ts))::int=$3
                      AND EXTRACT(MONTH FROM to_timestamp(ts))::int=$4
                    """,
                    exchange, symbol, year, month,
                )
        archived += 1
    _last_archive_at = time.time()
    return archived


async def _archive_loop() -> None:
    while not _stop.is_set():
        try:
            if _archive_enabled() and time.time() - _last_archive_at > 24 * 3600:
                n = await archive_once()
                if n:
                    logger.info("archived %s history partitions to object storage", n)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("history archive loop failed")
        try:
            await asyncio.wait_for(_stop.wait(), timeout=1800)
        except asyncio.TimeoutError:
            pass
