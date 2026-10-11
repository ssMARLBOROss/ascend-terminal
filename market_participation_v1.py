"""ASCEND research-only Market Participation: venue-labeled, append-only Postgres events.

No signal scores, order submission or reconstructed CVD after stream gaps.
Source time and receive time are separate; MEXC trades in contract units,
Bybit liquidations in native base contracts. Do not add cross-venue quantities.
"""
from __future__ import annotations
import hashlib
import json
import math
import time
from typing import Any

SYMBOLS = ("BTC", "ETH", "SOL", "XRP", "DOGE")
VALID_KINDS = {"TRADE", "OPEN_INTEREST", "BOOK", "LIQUIDATION", "STREAM_STATE", "SETUP"}
VALID_VENUES = {"MEXC", "BYBIT"}
SCHEMA = """
CREATE TABLE IF NOT EXISTS ascend_market_events_v1 (
 venue TEXT NOT NULL, symbol TEXT NOT NULL, kind TEXT NOT NULL,
 event_id TEXT NOT NULL, exchange_ts_ms BIGINT NOT NULL,
 received_ts_ms BIGINT NOT NULL, payload JSONB NOT NULL,
 inserted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(venue,symbol,kind,event_id)
);
CREATE INDEX IF NOT EXISTS idx_ascend_events_at
 ON ascend_market_events_v1(venue,symbol,kind,exchange_ts_ms DESC);
CREATE TABLE IF NOT EXISTS ascend_setup_events_v1 (
 setup_id TEXT NOT NULL, venue TEXT NOT NULL, symbol TEXT NOT NULL,
 stage TEXT NOT NULL, status TEXT NOT NULL, event_ts_ms BIGINT NOT NULL,
 observed_ts_ms BIGINT NOT NULL, source TEXT NOT NULL,
 payload JSONB NOT NULL, inserted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(setup_id,stage,status,event_ts_ms)
);
CREATE INDEX IF NOT EXISTS idx_ascend_setups_at
 ON ascend_setup_events_v1(venue,symbol,event_ts_ms DESC);
"""
def norm_symbol(symbol: str) -> str:
    s = str(symbol).upper().replace("_", "")
    return s if s.endswith("USDT") and s[:-4] in SYMBOLS else ""

def number(v: Any) -> float | None:
    try:
        f = float(v)
        return f if math.isfinite(f) and f > 0 else None
    except (ValueError, TypeError, OverflowError):
        return None

def event(venue: str, symbol: str, kind: str, ts: Any,
          fields: dict[str, Any], event_id: str = "",
          received_ms: int | None = None) -> dict[str, Any] | None:
    if venue not in VALID_VENUES or kind not in VALID_KINDS or not norm_symbol(symbol):
        return None
    try: t = int(ts)
    except (ValueError, TypeError, OverflowError): return None
    received = received_ms if received_ms is not None else time.time_ns() // 1_000_000
    if t < 1_500_000_000_000 or t > received + 30_000 or t < received - 86_400_000:
        return None
    data = dict(fields)
    identity = event_id or hashlib.sha256(json.dumps([t,data],sort_keys=True,
        separators=(",",":")).encode()).hexdigest()
    return dict(venue=venue,symbol=norm_symbol(symbol),kind=kind,event_id=identity,
       exchange_ts_ms=t,received_ts_ms=received,payload=data)

def parse_mexc(raw: dict, received_ms: int | None = None) -> list[dict]:
    channel = raw.get("channel")
    symbol = raw.get("symbol","")
    data = raw.get("data") or {}
    received = received_ms if received_ms is not None else time.time_ns()//1_000_000
    if not isinstance(data,dict): return []
    if channel=="push.deal":
        side = {1:"BUY",2:"SELL"}.get(data.get("T"))
        price,qty = number(data.get("p")),number(data.get("v"))
        if not side or price is None or qty is None: return []
        e=event("MEXC",symbol,"TRADE",data.get("t"),
          {"side":side,"price":price,"contracts":qty,"unit":"CONTRACTS"},received_ms=received)
        return [e] if e else []
    if channel=="push.ticker":
        oi=number(data.get("holdVol"))
        if oi is None:return []
        e=event("MEXC",symbol,"OPEN_INTEREST",data.get("timestamp") or raw.get("ts"),
          {"contracts":oi,"unit":"CONTRACTS","source":"push.ticker"},received_ms=received)
        return [e] if e else []
    # MEXC depth delta must be merged with a verified snapshot and strict versions;
    # intentionally no BOOK from individual delta messages.
    return []

def parse_bybit(raw: dict, received_ms: int | None = None) -> list[dict]:
    topic = str(raw.get("topic") or "")
    if not topic.startswith("allLiquidation."): return []
    symbol=topic.split(".",1)[1]
    items=raw.get("data")
    if not isinstance(items,list):return []
    received=received_ms if received_ms is not None else time.time_ns()//1_000_000
    out=[]
    for row in items:
        if not isinstance(row,dict): continue
        pos_side={"Buy":"LONG","Sell":"SHORT"}.get(row.get("S"))
        price,qty=number(row.get("p")),number(row.get("v"))
        if not pos_side or price is None or qty is None:continue
        e=event("BYBIT",symbol,"LIQUIDATION",row.get("T"),
          {"liquidated_position":pos_side,"price":price,"quantity":qty,
           "unit":"NATIVE_QTY","price_type":"BANKRUPTCY_PRICE"},
          received_ms=received)
        if e:out.append(e)
    return out

class BybitBook:
    """Snapshot and deltas must be ordered; never treat dropped deltas as live depth."""
    def __init__(self,symbol: str):
        self.symbol=norm_symbol(symbol);self.bids={};self.asks={}
        self.seq=None;self.updated_at_ms=None;self.valid=False
    def reset(self):
        self.bids.clear();self.asks.clear();self.seq=None
        self.updated_at_ms=None;self.valid=False
    def apply(self,raw: dict,received_ms: int|None=None) -> dict|None:
        if raw.get("topic")!=f"orderbook.50.{self.symbol}":return None
        data=raw.get("data") or {}
        try:
            update=int(data.get("u"))
            seq=int(data.get("seq"))
        except (ValueError,TypeError): self.reset();return None
        typ=raw.get("type")
        if typ=="snapshot" or update==1:
            self.reset();self.valid=True
        elif not self.valid or seq<=self.seq:
            self.reset();return None
        # Exchange seq is increasing, not necessarily consecutive across book levels:
        # on reconnect always reset until a fresh complete snapshot is received.
        for side,rows in (("b",self.bids),("a",self.asks)):
            patch=data.get(side,[])
            if not isinstance(patch,list):self.reset();return None
            for item in patch:
                try:p,q=float(item[0]),float(item[1])
                except (TypeError,ValueError,IndexError):self.reset();return None
                if not math.isfinite(p) or p<=0 or not math.isfinite(q) or q<0:
                    self.reset();return None
                if not q:rows.pop(p,None)
                else:rows[p]=q
        if not self.bids or not self.asks:self.reset();return None
        best_bid=max(self.bids);best_ask=min(self.asks)
        if best_bid>=best_ask:self.reset();return None
        self.seq=seq
        ts=int(raw.get("ts") or 0)
        now=received_ms if received_ms is not None else time.time_ns()//1_000_000
        self.updated_at_ms=now
        levels=50
        bids=sorted(self.bids.items(),reverse=True)[:levels]
        asks=sorted(self.asks.items())[:levels]
        return event("BYBIT",self.symbol,"BOOK",ts,
          {"best_bid":best_bid,"best_ask":best_ask,
           "bid_quantity_top50":sum(q for _,q in bids),
           "ask_quantity_top50":sum(q for _,q in asks),
           "spread_pct":(best_ask/best_bid-1)*100,
           "book_update":update,"seq":seq,"snapshot":typ=="snapshot",
           "unit":"NATIVE_QTY","levels":levels},
           event_id=str(seq),received_ms=now)

async def ensure_schema(pool) -> bool:
    if pool is None:return False
    async with pool.acquire() as con: await con.execute(SCHEMA)
    return True

async def persist(pool,events: list[dict]) -> int:
    if pool is None or not events:return 0
    n=0
    async with pool.acquire() as con:
        async with con.transaction():
            for e in events:
                result=await con.execute("""
                 INSERT INTO ascend_market_events_v1
                 (venue,symbol,kind,event_id,exchange_ts_ms,received_ts_ms,payload)
                 VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
                 ON CONFLICT DO NOTHING
                """,e["venue"],e["symbol"],e["kind"],e["event_id"],
                e["exchange_ts_ms"],e["received_ts_ms"],json.dumps(e["payload"]))
                if result=="INSERT 0 1":n+=1
    return n

async def snapshot(pool,symbol: str) -> dict:
    sym=norm_symbol(symbol)
    if not sym:return {"status":"NO DATA","reason":"unsupported_symbol"}
    result={"symbol":sym,"status":"NO DATA","venues":{},
        "cvd":None,"delta_oi":None,"order_book":None,"liquidations":None}
    if pool is None:return {**result,"reason":"database_unavailable"}
    now=time.time_ns()//1_000_000
    async with pool.acquire() as con:
        rows=await con.fetch("""
          SELECT venue,kind,event_id,exchange_ts_ms,received_ts_ms,payload
          FROM ascend_market_events_v1
          WHERE symbol=$1 AND exchange_ts_ms >= $2
          ORDER BY exchange_ts_ms DESC LIMIT 10000
        """,sym,now-15*60_000)
    by={}
    for row in rows:
        item=dict(row)
        if isinstance(item["payload"],str):
            item["payload"]=json.loads(item["payload"])
        k=(item["venue"],item["kind"])
        by.setdefault(k,[]).append(item)
    for (venue,kind),group in by.items():
        latest=max(x["received_ts_ms"] for x in group)
        age=now-latest
        status="LIVE" if age<=45000 else "STALE"
        result["venues"][venue+":"+kind]={"status":status,"age_ms":age,"count":len(group)}
    trades=by.get(("MEXC","TRADE"),[])
    # A reconnect or missing stream may yield incomplete coverage.
    transitions=by.get(("MEXC","STREAM_STATE"),[])
    continuity=(bool(trades) and any(
        x["payload"].get("state")=="CONNECTED" for x in transitions))
    if trades:
        delta=sum((1 if r["payload"].get("side")=="BUY" else -1)
                  *float(r["payload"].get("contracts") or 0) for r in trades)
        result["cvd"]={"status":"PARTIAL" if continuity else "NO DATA",
            "reason":"requires_confirmed_gap_free_stream_and_prior_baseline",
            "delta_15m_contracts":delta,"trades":len(trades),
            "cumulative_cvd":None}
    points=sorted(by.get(("MEXC","OPEN_INTEREST"),[]),key=lambda z:z["exchange_ts_ms"])
    if len(points)>=2:
        first,last=points[0],points[-1]
        result["delta_oi"]={"status":"PARTIAL",
          "reason":"15m_window_unverified" if last["exchange_ts_ms"]-first["exchange_ts_ms"]<14*60_000 else "READY",
          "change_pct":(float(last["payload"]["contracts"])/float(first["payload"]["contracts"])-1)*100,
          "source":"MEXC","unit":"CONTRACTS","from_ms":first["exchange_ts_ms"],
          "to_ms":last["exchange_ts_ms"]}
    book=by.get(("BYBIT","BOOK"),[])
    if book:
        row=book[0];result["order_book"]={"status":result["venues"]["BYBIT:BOOK"]["status"],
           "source":"BYBIT","exchange_ts_ms":row["exchange_ts_ms"],**dict(row["payload"])}
    liqs=by.get(("BYBIT","LIQUIDATION"),[])
    if liqs:
        result["liquidations"]={"status":"PARTIAL","source":"BYBIT",
         "reason":"starts_at_collector_connection",
         "count_15m":len(liqs),
         "long_qty":sum(float(x["payload"]["quantity"]) for x in liqs
                if x["payload"]["liquidated_position"]=="LONG"),
         "short_qty":sum(float(x["payload"]["quantity"]) for x in liqs
                if x["payload"]["liquidated_position"]=="SHORT"),
         "unit":"NATIVE_QTY"}
    if by:result["status"]="PARTIAL"
    return result
