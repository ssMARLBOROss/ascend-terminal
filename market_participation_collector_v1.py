"""Research-only websocket collector with bounded writes / reconnect markers.

Use inside existing Railway bybit-history-collector only when
MARKET_PARTICIPATION_ENABLED=1. Recording is venue-isolated; real orders disabled.
"""
from __future__ import annotations
import asyncio
import collections
import json
import logging
import os
import time
from typing import Any
import websockets
import httpx

import market_participation_v1 as M

log=logging.getLogger("ascend.participation")
MEXC="wss://contract.mexc.com/edge"
BYBIT="wss://stream.bybit.com/v5/public/linear"
SYMS=[s.strip().upper() for s in os.getenv(
    "MARKET_PARTICIPATION_SYMBOLS","BTC,ETH,SOL,XRP,DOGE").split(",")
    if s.strip().upper() in M.SYMBOLS]
SYMS=SYMS or ["BTC","ETH","SOL"]

class Batch:
    def __init__(self):
        self.entries:list[dict]=[]
        self.trade_buckets:dict[tuple,list]=collections.defaultdict(lambda:[0.0,0])
        self.lock=asyncio.Lock()
        self.last_oi:dict[str,int]={}
        self.last_book:dict[str,int]={}
    async def push(self,entry:dict):
        async with self.lock:
            if len(self.entries)>=10000:
                self.entries=self.entries[-7000:]
                # Payload gaps imply PARTIAL stream, never full accumulated CVD.
                log.warning("market collector queue overflow: raw event completeness lost")
            self.entries.append(entry)
    async def add_trade(self,e:dict):
        p=e["payload"];key=(e["symbol"],p["side"],
            (e["exchange_ts_ms"]//60000)*60000)
        async with self.lock:
            item=self.trade_buckets[key];item[0]+=p["contracts"];item[1]+=1
    async def flush(self,pool):
        now_ms=time.time_ns()//1_000_000
        async with self.lock:
            pending=self.entries;self.entries=[]
            mature=[(k,v) for k,v in self.trade_buckets.items() if k[2]+60000<=now_ms-2000]
            for k,v in mature:
                del self.trade_buckets[k]
        for (symbol,side,minute), (volume,prints) in mature:
            e=M.event("MEXC",symbol,"TRADE",minute+60000,
               {"side":side,"contracts":round(volume,9),"prints":prints,
                "unit":"CONTRACTS","source":"WS_1M_AGG"},
               event_id=f"{minute}:{side}",received_ms=now_ms)
            if e:pending.append(e)
        if pending:
            try:
                # Bound one transaction; retries retain the same event ids for deduplication.
                for i in range(0,len(pending),500):
                    await M.persist(pool,pending[i:i+500])
            except Exception:
                log.exception("participation Postgres write failed")
                async with self.lock:self.entries=pending+self.entries
                await asyncio.sleep(5)
    async def state(self,venue:str,value:str):
        now=time.time_ns()//1_000_000
        for base in SYMS:
            e=M.event(venue,base+"USDT","STREAM_STATE",now,
                {"state":value,"source":"WEBSOCKET","no_replay_on_gap":True},
                event_id=str(now)+":"+value,received_ms=now)
            if e:await self.push(e)

async def seed_mexc_book(book:M.MexcBook)->bool:
    if not book.symbol:return False
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            url="https://contract.mexc.com/api/v1/contract/depth/"+book.symbol[:-4]+"_USDT"
            r=await client.get(url,params={"limit":100})
            r.raise_for_status()
            return book.seed(r.json())
    except Exception as exc:
        log.warning("MEXC BOOK REST resync %s: %s",book.symbol,exc)
        book.reset()
        return False

async def mexc_reader(batch:Batch):
    delay=2
    books={s+"USDT":M.MexcBook(s+"USDT") for s in SYMS}
    last_reseed={}
    while True:
        try:
            async with websockets.connect(MEXC,ping_interval=20,
               ping_timeout=20,max_size=4_000_000) as ws:
                for sym in SYMS:
                    for method in ("sub.deal","sub.ticker","sub.depth"):
                        param={"symbol":sym+"_USDT"}
                        if method=="sub.depth":param["compress"]=False
                        await ws.send(json.dumps({"method":method,"param":param}))
                for book in books.values():book.reset()
                await asyncio.gather(*(seed_mexc_book(b) for b in books.values()))
                await batch.state("MEXC","CONNECTED");delay=2
                async for message in ws:
                    obj=json.loads(message)
                    if obj.get("channel")=="push.depth":
                        sym=M.norm_symbol(obj.get("symbol",""))
                        book=books.get(sym)
                        if book:
                            book_event=book.apply(obj)
                            if book_event:
                                last=batch.last_book.get("MEXC:"+sym,0)
                                if book_event["exchange_ts_ms"]-last>=10000:
                                    batch.last_book["MEXC:"+sym]=book_event["exchange_ts_ms"]
                                    await batch.push(book_event)
                            elif book.version is None:
                                now=time.monotonic()
                                if now-last_reseed.get(sym,0)>=10:
                                    last_reseed[sym]=now
                                    await seed_mexc_book(book)
                    events=M.parse_mexc(obj)
                    for e in events:
                        if e["kind"]=="TRADE":await batch.add_trade(e)
                        elif e["kind"]=="OPEN_INTEREST":
                            last=batch.last_oi.get(e["symbol"],0)
                            if e["exchange_ts_ms"]-last>=30000:
                                batch.last_oi[e["symbol"]]=e["exchange_ts_ms"]
                                await batch.push(e)
        except asyncio.CancelledError:raise
        except Exception as exc:log.warning("MEXC WS reconnect: %s",exc)
        await batch.state("MEXC","DISCONNECTED")
        for book in books.values():book.reset()
        await asyncio.sleep(delay);delay=min(90,delay*2)

async def bybit_reader(batch:Batch):
    delay=2
    books={s+"USDT":M.BybitBook(s+"USDT") for s in SYMS}
    while True:
        try:
            async with websockets.connect(BYBIT,ping_interval=20,
               ping_timeout=20,max_size=4_000_000) as ws:
                for b in books.values():b.reset()
                args=[f"allLiquidation.{s}USDT" for s in SYMS]+[
                    f"orderbook.50.{s}USDT" for s in SYMS]
                await ws.send(json.dumps({"op":"subscribe","args":args}))
                await batch.state("BYBIT","CONNECTED");delay=2
                last_app_ping=time.monotonic()
                while True:
                    try:
                        payload=await asyncio.wait_for(ws.recv(),timeout=10)
                    except asyncio.TimeoutError:
                        await ws.send(json.dumps({"op":"ping"}))
                        continue
                    msg=json.loads(payload)
                    for e in M.parse_bybit(msg):await batch.push(e)
                    topic=str(msg.get("topic") or "")
                    if topic.startswith("orderbook.50."):
                        book=books.get(topic.removeprefix("orderbook.50."))
                        if book:
                            event=book.apply(msg)
                            if event:
                                last=batch.last_book.get(book.symbol,0)
                                if event["exchange_ts_ms"]-last>=10000:
                                    batch.last_book[book.symbol]=event["exchange_ts_ms"]
                                    await batch.push(event)
                    if time.monotonic()-last_app_ping>=20:
                        await ws.send(json.dumps({"op":"ping"}))
                        last_app_ping=time.monotonic()
        except asyncio.CancelledError:raise
        except Exception as exc:log.warning("Bybit WS reconnect: %s",exc)
        await batch.state("BYBIT","DISCONNECTED")
        for b in books.values():b.reset()
        await asyncio.sleep(delay);delay=min(90,delay*2)

async def run(pool):
    if pool is None:raise RuntimeError("Postgres pool is required for participation")
    await M.ensure_schema(pool)
    batch=Batch()
    async def flush_forever():
        while True:
            await asyncio.sleep(5)
            await batch.flush(pool)
    tasks=[asyncio.create_task(mexc_reader(batch),name="market-mexc-ws"),
        asyncio.create_task(bybit_reader(batch),name="market-bybit-ws"),
        asyncio.create_task(flush_forever(),name="market-store")]
    log.info("Participation enabled: %s MEXC trades/OI + Bybit book/liquidations",SYMS)
    try:await asyncio.gather(*tasks)
    finally:
        for t in tasks:t.cancel()
        await asyncio.gather(*tasks,return_exceptions=True)
        await batch.flush(pool)
