import { useEffect, useMemo, useRef, useState } from 'react';
import type { AscendTimeframe, Candle } from '@ascend/contracts';

type Ticker={
  lastPrice?:number;
  change24hPct?:number;
  high24h?:number;
  low24h?:number;
  turnover24h?:number;
};

const intervalMap:Record<string,string>={
  '1m':'1','3m':'3','5m':'5','10m':'5','15m':'15','30m':'30','45m':'15',
  '1H':'60','2H':'120','4H':'240','6H':'360','12H':'720','1D':'D','1W':'W','1M':'M'
};

const tfMs:Record<string,number>={
  '1m':60000,'3m':180000,'5m':300000,'10m':600000,'15m':900000,'30m':1800000,'45m':2700000,
  '1H':3600000,'2H':7200000,'4H':14400000,'6H':21600000,'12H':43200000,'1D':86400000
};

type CachedChart={raw:Candle[];display:Candle[];updatedAt:number};
type CachedContext={candles:Candle[];updatedAt:number};
const chartCache=new Map<string,CachedChart>();
const contextCache=new Map<string,CachedContext>();
const prefetchingSymbols=new Set<string>();
const PREFETCH_TFS:AscendTimeframe[]=['1m','3m','5m','10m','15m','30m','1H'];

const chartKey=(symbol:string,timeframe:AscendTimeframe)=>`${symbol}:${timeframe}`;

function aggregate(candles:Candle[],timeframe:AscendTimeframe){
  if(timeframe!=='10m'&&timeframe!=='45m')return candles;
  const size=tfMs[timeframe];
  const buckets=new Map<number,Candle>();
  for(const c of candles){
    const ts=Math.floor(c.timestamp/size)*size;
    const prev=buckets.get(ts);
    if(!prev)buckets.set(ts,{...c,timestamp:ts});
    else buckets.set(ts,{timestamp:ts,open:prev.open,high:Math.max(prev.high,c.high),low:Math.min(prev.low,c.low),close:c.close,volume:prev.volume+c.volume});
  }
  return [...buckets.values()].sort((a,b)=>a.timestamp-b.timestamp);
}

function normalize(list:any[]):Candle[]{
  return list.map(row=>({
    timestamp:Number(row[0]),
    open:Number(row[1]),
    high:Number(row[2]),
    low:Number(row[3]),
    close:Number(row[4]),
    volume:Number(row[5])
  })).filter(c=>Number.isFinite(c.timestamp)&&Number.isFinite(c.close)).sort((a,b)=>a.timestamp-b.timestamp);
}

async function fetchKlines(symbol:string,interval:string,limit=360,end?:number){
  const qs=new URLSearchParams({category:'linear',symbol,interval,limit:String(limit)});
  if(end!==undefined)qs.set('end',String(end));
  const res=await fetch('/market-api/v5/market/kline?'+qs.toString(),{cache:'no-store'});
  if(!res.ok)throw new Error('REST '+res.status);
  const json=await res.json();
  if(json?.retCode!==0||!Array.isArray(json?.result?.list))throw new Error(json?.retMsg||'Invalid kline response');
  return normalize(json.result.list);
}

async function warmTimeframes(symbol:string,current:AscendTimeframe){
  if(prefetchingSymbols.has(symbol))return;
  prefetchingSymbols.add(symbol);
  try{
    for(const tf of PREFETCH_TFS){
      if(tf===current||chartCache.has(chartKey(symbol,tf)))continue;
      const interval=intervalMap[tf]??'15';
      try{
        const raw=await fetchKlines(symbol,interval,tf==='10m'?720:360);
        chartCache.set(chartKey(symbol,tf),{raw,display:aggregate(raw,tf).slice(-500),updatedAt:Date.now()});
        if(tf==='15m')contextCache.set(symbol,{candles:raw.slice(-500),updatedAt:Date.now()});
      }catch{
        // Prefetch is opportunistic. The active timeframe keeps its own error state.
      }
    }
  }finally{
    prefetchingSymbols.delete(symbol);
  }
}

export type LiveMarketState={
  status:'CONNECTING'|'LIVE'|'RECONNECTING'|'ERROR';
  source:'BYBIT';
  symbol:string;
  timeframe:AscendTimeframe;
  candles:Candle[];
  contextCandles:Candle[];
  ticker:Ticker;
  lastUpdate?:number;
  latencyMs?:number;
  error?:string;
  historyReady:boolean;
  loadingOlder:boolean;
  hasOlder:boolean;
  loadOlder:()=>Promise<void>;
};

export function useBybitMarket(symbol:string,timeframe:AscendTimeframe):LiveMarketState{
  const[candles,setCandles]=useState<Candle[]>([]);
  const[rawCandles,setRawCandles]=useState<Candle[]>([]);
  const[contextCandles,setContextCandles]=useState<Candle[]>([]);
  const[ticker,setTicker]=useState<Ticker>({});
  const[status,setStatus]=useState<LiveMarketState['status']>('CONNECTING');
  const[lastUpdate,setLastUpdate]=useState<number>();
  const[latencyMs,setLatencyMs]=useState<number>();
  const[restError,setRestError]=useState<string>();
  const[wsError,setWsError]=useState<string>();
  const[loadingOlder,setLoadingOlder]=useState(false);
  const[hasOlder,setHasOlder]=useState(true);
  const retryRef=useRef<number>();
  const interval=useMemo(()=>intervalMap[timeframe]??'15',[timeframe]);
  const cacheKey=useMemo(()=>chartKey(symbol,timeframe),[symbol,timeframe]);

  useEffect(()=>{
    let disposed=false;
    const cached=chartCache.get(cacheKey);
    const cachedContext=contextCache.get(symbol);

    setStatus('CONNECTING');
    setRestError(undefined);setWsError(undefined);setHasOlder(true);
    setLoadingOlder(false);setTicker({});setLastUpdate(undefined);setLatencyMs(undefined);

    if(cached){
      setRawCandles(cached.raw);
      setCandles(cached.display);
    }else{
      setRawCandles([]);
      setCandles([]);
    }
    if(cachedContext)setContextCandles(cachedContext.candles);
    else if(timeframe==='15m'&&cached)setContextCandles(cached.raw.slice(-500));
    else setContextCandles([]);

    const load=async()=>{
      try{
        const chartLimit=timeframe==='10m'||timeframe==='45m'?720:360;
        const chartPromise=fetchKlines(symbol,interval,chartLimit);
        const contextPromise=interval==='15'?chartPromise:fetchKlines(symbol,'15',360);
        const[chart,context]=await Promise.all([chartPromise,contextPromise]);
        if(disposed)return;
        const display=aggregate(chart,timeframe).slice(-500);
        setRawCandles(chart);setCandles(display);setContextCandles(context.slice(-500));setRestError(undefined);
        chartCache.set(cacheKey,{raw:chart,display,updatedAt:Date.now()});
        contextCache.set(symbol,{candles:context.slice(-500),updatedAt:Date.now()});
        window.setTimeout(()=>{void warmTimeframes(symbol,timeframe)},120);
      }catch(err){
        if(disposed)return;
        setRestError('История REST: '+String(err?.message??err));
      }
    };
    void load();
    return()=>{disposed=true};
  },[symbol,interval,timeframe,cacheKey]);

  useEffect(()=>{
    let disposed=false;
    let ws:WebSocket|undefined;
    let ping:number|undefined;
    const connect=()=>{
      if(disposed)return;
      setStatus(s=>s==='LIVE'?'RECONNECTING':'CONNECTING');
      ws=new WebSocket('wss://stream.bybit.com/v5/public/linear');
      ws.onopen=()=>{
        if(disposed)return;
        setStatus('LIVE');setWsError(undefined);
        const topics=[`kline.${interval}.${symbol}`,`tickers.${symbol}`];if(interval!=='15')topics.push(`kline.15.${symbol}`);ws?.send(JSON.stringify({op:'subscribe',args:topics}));
        ping=window.setInterval(()=>{if(ws?.readyState===WebSocket.OPEN)ws.send(JSON.stringify({op:'ping'}))},20000);
      };
      ws.onmessage=(event)=>{
        if(disposed)return;
        try{
          const msg=JSON.parse(event.data);
          const now=Date.now();
          if(typeof msg?.ts==='number')setLatencyMs(Math.max(0,now-msg.ts));
          setLastUpdate(now);
          if(typeof msg?.topic==='string'&&msg.topic.startsWith('kline.')){
            const item=Array.isArray(msg.data)?msg.data[0]:undefined;
            if(!item)return;
            const next:Candle={timestamp:Number(item.start),open:Number(item.open),high:Number(item.high),low:Number(item.low),close:Number(item.close),volume:Number(item.volume)};
            const topicInterval=msg.topic.split('.')[1];
            if(topicInterval===interval){
              setRawCandles(prev=>{
                const copy=prev.slice();
                const i=copy.findIndex(c=>c.timestamp===next.timestamp);
                if(i>=0)copy[i]=next;else copy.push(next);
                copy.sort((a,b)=>a.timestamp-b.timestamp);
                const trimmed=copy.slice(-1500);
                const display=aggregate(trimmed,timeframe).slice(-500);
                chartCache.set(cacheKey,{raw:trimmed,display,updatedAt:Date.now()});
                setCandles(display);
                return trimmed;
              });
            }
            if(topicInterval==='15'){
              setContextCandles(prev=>{
                const copy=prev.slice();
                const i=copy.findIndex(c=>c.timestamp===next.timestamp);
                if(i>=0)copy[i]=next;else copy.push(next);
                copy.sort((a,b)=>a.timestamp-b.timestamp);
                const trimmed=copy.slice(-500);
                contextCache.set(symbol,{candles:trimmed,updatedAt:Date.now()});
                return trimmed;
              });
            }
          }else if(typeof msg?.topic==='string'&&msg.topic.startsWith('tickers.')){
            const item=Array.isArray(msg.data)?msg.data[0]:msg.data;
            if(!item)return;
            setTicker(prev=>({
              lastPrice:item.lastPrice!==undefined?Number(item.lastPrice):prev.lastPrice,
              change24hPct:item.price24hPcnt!==undefined?Number(item.price24hPcnt)*100:prev.change24hPct,
              high24h:item.highPrice24h!==undefined?Number(item.highPrice24h):prev.high24h,
              low24h:item.lowPrice24h!==undefined?Number(item.lowPrice24h):prev.low24h,
              turnover24h:item.turnover24h!==undefined?Number(item.turnover24h):prev.turnover24h
            }));
          }
        }catch{}
      };
      ws.onerror=()=>{if(!disposed){setStatus('ERROR');setWsError('WebSocket error')}};
      ws.onclose=()=>{
        if(ping)window.clearInterval(ping);
        if(disposed)return;
        setStatus('RECONNECTING');
        retryRef.current=window.setTimeout(connect,1800);
      };
    };
    connect();
    return()=>{disposed=true;if(ping)window.clearInterval(ping);if(retryRef.current)window.clearTimeout(retryRef.current);ws?.close()};
  },[symbol,interval,timeframe,cacheKey]);

  const loadOlder=async()=>{
    if(loadingOlder||!hasOlder||!candles.length)return;
    setLoadingOlder(true);
    try{
      const oldestRaw=rawCandles[0]?.timestamp??candles[0].timestamp;
      const older=await fetchKlines(symbol,interval,500,oldestRaw-1);
      setRawCandles(prev=>{
        const byTs=new Map<number,Candle>();
        [...older,...prev].forEach(x=>byTs.set(x.timestamp,x));
        const merged=[...byTs.values()].sort((a,b)=>a.timestamp-b.timestamp).slice(-8000);
        const display=aggregate(merged,timeframe).slice(-5000);
        chartCache.set(cacheKey,{raw:merged,display,updatedAt:Date.now()});
        setCandles(display);
        return merged;
      });
      if(older.length<500)setHasOlder(false);
    }catch(err){
      setRestError('История REST: '+String((err as Error)?.message??err));
    }finally{
      setLoadingOlder(false);
    }
  };

  const historyReady=contextCandles.length>=192&&candles.length>=20;
  const error=restError??wsError;
  return{status,source:'BYBIT',symbol,timeframe,candles,contextCandles,ticker,lastUpdate,latencyMs,error,historyReady,loadingOlder,hasOlder,loadOlder};
}
