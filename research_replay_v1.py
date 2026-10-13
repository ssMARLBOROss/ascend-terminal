"""ASCEND independent *5m proxy* replay, never a live ENTRY READY decision.

Research-only: frozen UTC 00–08 Asia proxy, sweep+reclaim, local BOS, next-open
entry, structural SL, fixed 2R TP, 6h timeout. Matched FVG tags use the SAME
eligible baseline trades and SAME entry/exit, preventing unequal cohorts.
No look-ahead: signal uses only closed bars through BOS. Intrabar TP/SL tie
resolves conservatively to SL. This is NOT the full 30m→1m ASCEND V1 engine.
"""
from __future__ import annotations
import argparse
import datetime as dt
import hashlib
import json
import math
from pathlib import Path
from typing import Any

from research_trade_ledger_v1 import summarize, validate

STEP=300
DAY=86400
FEE_PCT=.0008
SLIPPAGE_PCT=.0004
MAX_HOLD=72
MODEL="ASCEND_ASIA_SWEEP_BOS_5M_PROXY_V1"

def load_bars(raw: list[dict]) -> list[dict]:
    out={}
    for b in raw:
        try:
            row={k:float(b[k]) for k in ("open","high","low","close")}
            ts=int(b["time"])
        except (TypeError,ValueError,KeyError,OverflowError) as e:
            raise ValueError("invalid OHLC input") from e
        if ts%STEP or not all(math.isfinite(v) and v>0 for v in row.values()):
            raise ValueError("invalid 5m candle alignment or price")
        if row["low"]>min(row["open"],row["close"]) or row["high"]<max(row["open"],row["close"]):
            raise ValueError("invalid candle range")
        if ts in out:
            raise ValueError("duplicate candle time")
        out[ts]={"time":ts,**row}
    bars=sorted(out.values(),key=lambda r:r["time"])
    if len(bars)<400:
        raise ValueError("at least 400 5m candles required")
    return bars

def _atr(bars,i):
    if i<14:return None
    return sum(max(bars[j]["high"]-bars[j]["low"],
                abs(bars[j]["high"]-bars[j-1]["close"]),
                abs(bars[j]["low"]-bars[j-1]["close"])) for j in range(i-13,i+1))/14

def _fvg_tags(bars,si,bi,side,atr):
    tags=set()
    for j in range(max(2,si),bi+1):
        x,y=bars[j-2],bars[j]
        lo,hi=(x["high"],y["low"]) if side==1 else (y["high"],x["low"])
        size=(hi-lo)/atr
        if size>=.25 and size<.5:tags.add("SMALL_FVG")
        elif size>=.5 and size<1.:tags.add("LARGE_FVG")
    return sorted(tags)

def _exit(bars,en,side,sl,tp):
    for j in range(en,min(len(bars),en+MAX_HOLD)):
        b=bars[j]
        if j>en and b["time"]-bars[j-1]["time"]!=STEP:
            return None  # Future candle gap invalidates the modeled outcome.
        stop=b["low"]<=sl if side==1 else b["high"]>=sl
        target=b["high"]>=tp if side==1 else b["low"]<=tp
        if stop:return ("SL",sl,b["time"]+STEP)
        if target:return ("TP",tp,b["time"]+STEP)
    last=en+MAX_HOLD-1
    if last>=len(bars):return None
    return ("TIME",bars[last]["close"],bars[last]["time"]+STEP)

def replay(symbol: str, raw: list[dict], *, source: str,
           experiment_id: str="ASCEND_REPLAY_5M_V1") -> list[dict]:
    if source not in ("BINANCE_USDM_5M","MEXC_USDT_PERP_5M"):
        raise ValueError("explicit market-data venue required")
    bars=load_bars(raw)
    bytime={b["time"]:i for i,b in enumerate(bars)}
    begin=(bars[0]["time"]//DAY)*DAY
    end=(bars[-1]["time"]//DAY)*DAY
    results=[]
    for day in range(begin,end+1,DAY):
        # Freeze complete Asia session (00:00–07:55), and require contiguous
        # 08:00–21:55 search window, no bridging across absent candles.
        needed=[bytime.get(day+i*STEP) for i in range(264)]
        if any(i is None for i in needed):continue
        asia=bars[needed[0]:needed[95]+1]
        h=max(b["high"] for b in asia)
        l=min(b["low"] for b in asia)
        used=set()
        for p in range(96,264):
            i=needed[p];b=bars[i];atr=_atr(bars,i)
            if not atr or atr<=0:continue
            side=(1 if b["low"]<l-.05*atr and b["close"]>l
                  else -1 if b["high"]>h+.05*atr and b["close"]<h else 0)
            if not side or side in used:continue
            used.add(side)
            prev=bars[i-12:i]
            if len(prev)<12 or any(prev[k+1]["time"]-prev[k]["time"]!=STEP for k in range(11)):
                continue
            level=max(x["high"] for x in prev) if side==1 else min(x["low"] for x in prev)
            bos=None
            for j in range(i+1,min(i+19,len(bars)-1)):
                if bars[j]["time"]-bars[j-1]["time"]!=STEP:break
                if side*(bars[j]["close"]-level)>0:
                    bos=j;break
            if bos is None:continue
            en=bos+1
            if en>=len(bars) or bars[en]["time"]-bars[bos]["time"]!=STEP:continue
            entry=bars[en]["open"]
            extreme=b["low"] if side==1 else b["high"]
            stop=extreme-side*.05*atr
            risk=side*(entry-stop)
            if risk<=0 or risk/entry<.001 or risk/entry>.035:continue
            target=entry+side*2*risk
            outcome=_exit(bars,en,side,stop,target)
            if outcome is None:continue
            reason,exit_price,exit_ts=outcome
            ident=hashlib.sha256(
                f"{symbol}:{day}:{side}:{b['time']}:{bars[bos]['time']}".encode()
            ).hexdigest()[:24]
            raw_trade={
                "experiment_id":experiment_id,"trade_id":ident,
                "symbol":symbol,"side":"LONG" if side==1 else "SHORT",
                "source":"MODEL_REPLAY", "model_version":MODEL,
                "quote_source":"","outcome":reason,
                "entry_ts":bars[en]["time"],"exit_ts":exit_ts,
                "entry":entry,"stop":stop,"target":target,"exit_price":exit_price,
                "fee_pct":FEE_PCT,"slippage_pct":SLIPPAGE_PCT,
                "data_ref":f"{source}:{symbol}:{bars[0]['time']}:{bars[-1]['time']}",
                "look_ahead_check":"CLOSED_BOS_NEXT_OPEN"
            }
            model=validate(raw_trade)
            model["fvg_tags"]=_fvg_tags(bars,i,bos,side,atr)
            model["sweep_ts"]=b["time"]
            model["bos_ts"]=bars[bos]["time"]+STEP
            model["asia_high"]=h
            model["asia_low"]=l
            results.append(model)
    return sorted(results,key=lambda r:(r["entry_ts"],r["symbol"],r["trade_id"]))

def analyze(rows:list[dict], *, train_pct:float=.7) -> dict:
    ordered=sorted(rows,key=lambda x:(x["entry_ts"],x["trade_id"]))
    if not ordered:
        return {"status":"NO TRADES","count":0,"journal":[]}
    cut=min(len(ordered)-1,max(1,int(len(ordered)*train_pct))) if len(ordered)>1 else 1
    cutoff=ordered[cut-1]["entry_ts"]
    # Split by UTC day, avoiding same-day leakage across train/test.
    first_test_day=(cutoff//DAY+1)*DAY
    first=[x for x in ordered if x["entry_ts"]<first_test_day]
    second=[x for x in ordered if x["entry_ts"]>=first_test_day]
    cohorts={}
    for name,tag in (("BASELINE",None),("SMALL_FVG","SMALL_FVG"),
                     ("LARGE_FVG","LARGE_FVG"),("NO_FVG","NO_FVG")):
        subset=[x for x in ordered if (
            True if tag is None else not x.get("fvg_tags") if tag=="NO_FVG" else tag in x.get("fvg_tags",[])
        )]
        cohorts[name]=summarize(subset)["model"]
    return {
        "status":"RESEARCH_ONLY","model":MODEL,
        "goal_100_met":len(ordered)>=100,
        "count":len(ordered),"cohorts":cohorts,
        "train":summarize(first)["model"],"later":summarize(second)["model"],
        "later_period_is_not_live_execution":True,
        "split_first_test_day":first_test_day if second else None,
        "caveat":"5m UTC Asia sweep/BOS proxy, not actual ASCEND MTF; synthetic model fills",
        "journal":ordered,
    }

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input",help="JSON {source,symbols:{BTC_USDT:[5m OHLC...]}}")
    parser.add_argument("--output",default="ascend_research_replay_v1.json")
    args=parser.parse_args()
    data=json.loads(Path(args.input).read_text())
    if not isinstance(data.get("symbols"),dict):
        raise ValueError("symbols mapping missing")
    trades=[]
    for symbol,raw in data["symbols"].items():
        trades.extend(replay(symbol,raw,source=data.get("source",""),
                             experiment_id="ASCEND_REPLAY_5M_V1"))
    result=analyze(trades)
    result["feed"]=data["source"]
    Path(args.output).write_text(json.dumps(result,ensure_ascii=False,indent=2))
    print(json.dumps({k:v for k,v in result.items() if k!="journal"},ensure_ascii=False))

if __name__=="__main__":main()
