"""Immutable, explicitly non-executed ASCEND research trade ledger.

MODEL_REPLAY and PAPER_OBSERVED must never be represented as exchange fills.
All writes require the separate owner authorization gate in terminal_api_v2.
"""
from __future__ import annotations
import json
import math
import re
import time
from typing import Any

import history_store

_ID = re.compile(r"^[A-Za-z0-9_.:-]{1,96}$")
_SYMBOL = re.compile(r"^[A-Z0-9]{1,28}_USDT$")
SOURCES = {"MODEL_REPLAY", "PAPER_OBSERVED"}
RESULTS = {"TP", "SL", "TIME", "MANUAL", "OTHER"}
MAX_BATCH = 100

def validate(raw: dict) -> dict:
    if not isinstance(raw, dict):
        raise ValueError("trade must be a JSON object")
    exp, tid = str(raw.get("experiment_id") or ""), str(raw.get("trade_id") or "")
    symbol = str(raw.get("symbol") or "").upper()
    side = str(raw.get("side") or "").upper()
    source = str(raw.get("source") or "").upper()
    outcome = str(raw.get("outcome") or "").upper()
    if not _ID.fullmatch(exp) or not _ID.fullmatch(tid):
        raise ValueError("invalid experiment_id or trade_id")
    if not _SYMBOL.fullmatch(symbol):
        raise ValueError("invalid symbol")
    if side not in {"LONG", "SHORT"} or source not in SOURCES or outcome not in RESULTS:
        raise ValueError("invalid side/source/outcome; real exchange fills are not accepted")
    try:
        entry_ts, exit_ts = int(raw["entry_ts"]), int(raw["exit_ts"])
        entry, stop, target, exit_price = (float(raw[k]) for k in
                                           ("entry", "stop", "target", "exit_price"))
        fee, slippage = float(raw["fee_pct"]), float(raw["slippage_pct"])
    except (KeyError, TypeError, ValueError, OverflowError) as e:
        raise ValueError("incomplete or non-numeric trade fields") from e
    if entry_ts < 1_600_000_000 or exit_ts <= entry_ts or exit_ts > int(time.time()) + 60:
        raise ValueError("trade must be already CLOSED and time ordered (seconds UTC)")
    if not all(math.isfinite(v) for v in (entry, stop, target, exit_price, fee, slippage)):
        raise ValueError("all price and cost fields must be finite")
    if min(entry, stop, target, exit_price) <= 0 or fee < 0 or slippage < 0 or fee > .05 or slippage > .05:
        raise ValueError("prices positive; plausible cost fraction required")
    sign = 1 if side == "LONG" else -1
    risk = sign * (entry-stop)
    if risk <= 0 or sign*(target-entry) <= 0:
        raise ValueError("SL and target must lie on the correct side of entry")
    risk_pct = risk/entry
    if risk_pct < .0001 or risk_pct > .25:
        raise ValueError("risk outside 0.01%-25%")
    value_r = (sign*(exit_price-entry) - entry*(fee+slippage))/risk
    if not math.isfinite(value_r):
        raise ValueError("invalid R")
    if source == "MODEL_REPLAY" and not str(raw.get("model_version") or ""):
        raise ValueError("model_version required for a modeled fill")
    if source == "PAPER_OBSERVED" and not str(raw.get("quote_source") or ""):
        raise ValueError("quote_source required for paper observed close")
    ref = str(raw.get("data_ref") or "")
    if not ref or len(ref) > 250:
        raise ValueError("data_ref required for reproducibility")
    return {
      "experiment_id": exp, "trade_id": tid, "symbol": symbol, "side": side,
      "source": source, "outcome": outcome,
      "entry_ts": entry_ts, "exit_ts": exit_ts,
      "entry": entry, "stop": stop, "target": target, "exit_price": exit_price,
      "fee_pct": fee, "slippage_pct": slippage, "risk_pct": round(100*risk_pct,6),
      "net_r": round(value_r,7),
      "data_ref": ref,
      "model_version": str(raw.get("model_version") or "")[:80],
      "quote_source": str(raw.get("quote_source") or "")[:80],
      "look_ahead_check": str(raw.get("look_ahead_check") or "NOT_VERIFIED")[:40],
      "verified_exchange_fill": False,
    }

def summarize(rows: list[dict]) -> dict:
    # The ledger requires independently closed trades, not setup-stage events.
    model = [r for r in rows if r.get("source") == "MODEL_REPLAY"]
    paper = [r for r in rows if r.get("source") == "PAPER_OBSERVED"]
    def stats(items):
        r = [float(x["net_r"]) for x in items]
        wins = sum(v>0 for v in r)
        peak=0.0;eq=0.0;maxdd=0.0
        for v in sorted(items,key=lambda z:(z["exit_ts"],z["trade_id"])):
            eq += float(v["net_r"]);peak=max(peak,eq);maxdd=max(maxdd,peak-eq)
        return {"closed":len(r),"positive":wins,
                "wr_pct":round(100*wins/len(r),3) if r else None,
                "sum_r":round(sum(r),5) if r else None,
                "avg_r":round(sum(r)/len(r),5) if r else None,
                "max_drawdown_r":round(maxdd,5) if r else None}
    return {"target":100,"model":stats(model),"paper":stats(paper),
            "total_closed":len(rows),"broker_verified_fills":None,
            "status":"SAMPLE_TARGET_MET" if len(model)>=100 else "INSUFFICIENT_MODEL_SAMPLE",
            "no_real_orders":True}

DDL = """
CREATE TABLE IF NOT EXISTS ascend_research_trade_ledger_v1 (
    experiment_id TEXT NOT NULL,
    trade_id TEXT NOT NULL,
    symbol TEXT NOT NULL,
    source TEXT NOT NULL CHECK(source IN ('MODEL_REPLAY','PAPER_OBSERVED')),
    entry_ts BIGINT NOT NULL,
    exit_ts BIGINT NOT NULL,
    body JSONB NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (experiment_id, trade_id)
);
CREATE INDEX IF NOT EXISTS idx_ascend_research_ledger_time
ON ascend_research_trade_ledger_v1 (source, exit_ts DESC);
"""

async def ensure_schema(pool) -> None:
    async with pool.acquire() as con:
        await con.execute(DDL)

async def append_batch(pool, raw_trades: list[dict]) -> dict:
    if not isinstance(raw_trades, list) or not 1 <= len(raw_trades) <= MAX_BATCH:
        raise ValueError("batch length must be 1..100")
    parsed=[validate(t) for t in raw_trades]
    keyset={(t["experiment_id"],t["trade_id"]) for t in parsed}
    if len(keyset)!=len(parsed):
        raise ValueError("duplicate trade key within one request")
    # Atomic, append-only; a retry with matching data is idempotent, different
    # payload with same key rejects the whole request instead of overwriting.
    inserted=0;identical=0
    async with pool.acquire() as con:
        async with con.transaction():
            for t in parsed:
                old=await con.fetchval("""SELECT body FROM ascend_research_trade_ledger_v1
                    WHERE experiment_id=$1 AND trade_id=$2 FOR UPDATE""",
                    t["experiment_id"],t["trade_id"])
                if old is not None:
                    existing=json.loads(old) if isinstance(old,str) else dict(old)
                    if existing!=t:
                        raise ValueError("conflicting immutable trade id")
                    identical+=1
                else:
                    await con.execute("""INSERT INTO ascend_research_trade_ledger_v1
                      (experiment_id,trade_id,symbol,source,entry_ts,exit_ts,body)
                      VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)""",
                      t["experiment_id"],t["trade_id"],t["symbol"],t["source"],
                      t["entry_ts"],t["exit_ts"],json.dumps(t,sort_keys=True))
                    inserted+=1
    return {"inserted":inserted,"already_present":identical,"accepted":len(parsed)}

async def list_records(pool,experiment_id: str,limit: int=100) -> dict:
    if not _ID.fullmatch(experiment_id):
        raise ValueError("invalid experiment_id")
    count=max(1,min(1000,int(limit)))
    async with pool.acquire() as con:
        rows=await con.fetch("""SELECT body FROM ascend_research_trade_ledger_v1
        WHERE experiment_id=$1 ORDER BY exit_ts ASC, trade_id ASC LIMIT $2""",
        experiment_id,count)
        total=await con.fetchval("""SELECT count(*) FROM ascend_research_trade_ledger_v1
        WHERE experiment_id=$1""",experiment_id)
    result=[dict(r["body"]) if not isinstance(r["body"],str) else json.loads(r["body"]) for r in rows]
    return {"experiment_id":experiment_id,"records":result,"returned":len(result),
            "total":int(total or 0),"summary":summarize(result),
            "truncated":int(total or 0)>len(result),
            "data_type":"MODEL_OR_PAPER_ONLY","verified_exchange_fills":False}
