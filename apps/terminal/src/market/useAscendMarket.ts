import {useEffect,useMemo,useRef,useState} from 'react';
import type {
  AscendTimeframe,Candle,DexDiscoverySnapshot,HistoricalCandle,
  MarketBootstrapPayload,MarketConsensusSnapshot,MarketStreamMessage,
  NormalizedTicker,SourceHealth
} from '@ascend/contracts';
import {useBybitMarket} from './useBybitMarket';

type Ticker={
  lastPrice?:number;
  change24hPct?:number;
  high24h?:number;
  low24h?:number;
  turnover24h?:number;
};

const TF_MS:Partial<Record<AscendTimeframe,number>>={
  '1m':60000,'3m':180000,'5m':300000,'10m':600000,'15m':900000,'30m':1800000,
  '45m':2700000,'1H':3600000,'2H':7200000,'4H':14400000,'6H':21600000,
  '12H':43200000,'1D':86400000,'1W':604800000
};

const toCandles=(items:HistoricalCandle[]):Candle[]=>
  items.map(({timestamp,open,high,low,close,volume})=>({timestamp,open,high,low,close,volume}));

function upsert(items:Candle[],next:Candle,max=1200){
  const copy=items.slice();
  const index=copy.findIndex(c=>c.timestamp===next.timestamp);
  if(index>=0)copy[index]=next;else copy.push(next);
  copy.sort((a,b)=>a.timestamp-b.timestamp);
  return copy.slice(-max);
}

function aggregate(items:Candle[],tf:AscendTimeframe){
  const size=TF_MS[tf];
  if(!size)return items;
  const buckets=new Map<number,Candle>();
  for(const candle of items){
    const ts=Math.floor(candle.timestamp/size)*size;
    const prev=buckets.get(ts);
    if(!prev)buckets.set(ts,{...candle,timestamp:ts});
    else buckets.set(ts,{
      timestamp:ts,open:prev.open,high:Math.max(prev.high,candle.high),
      low:Math.min(prev.low,candle.low),close:candle.close,volume:prev.volume+candle.volume
    });
  }
  return [...buckets.values()].sort((a,b)=>a.timestamp-b.timestamp);
}

function baseTfFor(target:AscendTimeframe):'1m'|'15m'{
  const size=TF_MS[target]??900000;
  return size<=900000?'1m':'15m';
}

export type AscendLiveMarketState={
  status:'CONNECTING'|'LIVE'|'RECONNECTING'|'ERROR';
  source:'ASCEND_ENGINE'|'BYBIT_FALLBACK';
  symbol:string;
  timeframe:AscendTimeframe;
  candles:Candle[];
  contextCandles:Candle[];
  eventCandles:Candle[];
  ticker:Ticker;
  lastUpdate?:number;
  latencyMs?:number;
  error?:string;
  historyReady:boolean;
  loadingOlder:boolean;
  hasOlder:boolean;
  loadOlder:()=>Promise<void>;
  sources:SourceHealth[];
  consensus?:MarketConsensusSnapshot;
  dex?:DexDiscoverySnapshot;
  storage?:MarketBootstrapPayload['storage'];
};

export function useAscendMarket(symbol:string,timeframe:AscendTimeframe,enabled=true):AscendLiveMarketState{
  const[status,setStatus]=useState<AscendLiveMarketState['status']>('CONNECTING');
  const[candles,setCandles]=useState<Candle[]>([]);
  const[contextCandles,setContextCandles]=useState<Candle[]>([]);
  const[eventCandles,setEventCandles]=useState<Candle[]>([]);
  const[ticker,setTicker]=useState<Ticker>({});
  const[sources,setSources]=useState<SourceHealth[]>([]);
  const[consensus,setConsensus]=useState<MarketConsensusSnapshot>();
  const[dex,setDex]=useState<DexDiscoverySnapshot>();
  const[storage,setStorage]=useState<MarketBootstrapPayload['storage']>();
  const[lastUpdate,setLastUpdate]=useState<number>();
  const[latencyMs,setLatencyMs]=useState<number>();
  const[error,setError]=useState<string>();
  const[loadingOlder,setLoadingOlder]=useState(false);
  const[hasOlder,setHasOlder]=useState(true);
  const[fallbackEnabled,setFallbackEnabled]=useState(false);
  const primaryRef=useRef<'BYBIT'|'MEXC'>('BYBIT');
  const base1mRef=useRef<Candle[]>([]);
  const base15mRef=useRef<Candle[]>([]);
  const timeframeRef=useRef(timeframe);
  timeframeRef.current=timeframe;

  const fallback=useBybitMarket(symbol,timeframe,enabled&&fallbackEnabled);

  useEffect(()=>{
    if(!enabled)return;
    let disposed=false;
    let eventSource:EventSource|undefined;

    setStatus('CONNECTING');
    setError(undefined);
    setHasOlder(true);
    setFallbackEnabled(false);

    const start=async()=>{
      try{
        const controller=new AbortController();
        const timeout=window.setTimeout(()=>controller.abort(),6000);
        const res=await fetch(`/ascend-api/market/bootstrap/${encodeURIComponent(symbol)}?tf=${encodeURIComponent(timeframe)}&limit=360`,{signal:controller.signal,cache:'no-store'});
        window.clearTimeout(timeout);
        if(!res.ok)throw new Error(`ASCEND API ${res.status}`);
        const payload=await res.json() as MarketBootstrapPayload;
        if(disposed)return;

        primaryRef.current=payload.consensus.primarySource;
        const chart=toCandles(payload.chartCandles);
        const context=toCandles(payload.context15m);
        const micro=toCandles(payload.event1m);
        setCandles(chart);
        setContextCandles(context);
        setEventCandles(micro);
        base1mRef.current=micro.slice(-1200);
        base15mRef.current=context.slice(-800);
        setTicker(payload.ticker??{});
        setSources(payload.sources);
        setConsensus(payload.consensus);
        setDex(payload.dex);
        setStorage(payload.storage);
        setStatus('LIVE');
        setLastUpdate(Date.now());

        eventSource=new EventSource(`/ascend-api/market/stream/${encodeURIComponent(symbol)}`);
        eventSource.onopen=()=>{if(!disposed)setStatus('LIVE')};
        eventSource.onerror=()=>{if(!disposed)setStatus('RECONNECTING')};
        eventSource.onmessage=(event)=>{
          if(disposed)return;
          try{
            const msg=JSON.parse(event.data) as MarketStreamMessage;
            const now=Date.now();
            setLastUpdate(now);
            if(msg.type==='heartbeat')return;
            if(msg.type==='consensus'){
              setConsensus(msg.snapshot);
              primaryRef.current=msg.snapshot.primarySource;
              return;
            }
            if(msg.type==='dex'){setDex(msg.snapshot);return}
            if(msg.type==='ticker'){
              if(msg.source===primaryRef.current){
                const t=msg.ticker as NormalizedTicker;
                setTicker({
                  lastPrice:t.lastPrice,change24hPct:t.change24hPct,high24h:t.high24h,
                  low24h:t.low24h,turnover24h:t.turnover24h
                });
                setLatencyMs(Math.max(0,now-t.timestamp));
              }
              return;
            }
            if(msg.type==='candle'&&msg.source===primaryRef.current){
              const next:Candle={
                timestamp:msg.candle.timestamp,open:msg.candle.open,high:msg.candle.high,
                low:msg.candle.low,close:msg.candle.close,volume:msg.candle.volume
              };
              if(msg.timeframe==='1m'){
                base1mRef.current=upsert(base1mRef.current,next,1200);
                setEventCandles(base1mRef.current);
                if(baseTfFor(timeframeRef.current)==='1m'){
                  setCandles(aggregate(base1mRef.current,timeframeRef.current).slice(-600));
                }
              }
              if(msg.timeframe==='15m'){
                base15mRef.current=upsert(base15mRef.current,next,800);
                setContextCandles(base15mRef.current);
                if(baseTfFor(timeframeRef.current)==='15m'){
                  setCandles(aggregate(base15mRef.current,timeframeRef.current).slice(-600));
                }
              }
            }
          }catch{}
        };
      }catch(err){
        if(disposed)return;
        setError(String((err as Error)?.message??err));
        setStatus('ERROR');
        setFallbackEnabled(true);
      }
    };
    void start();
    return()=>{disposed=true;eventSource?.close()};
  },[symbol,timeframe,enabled]);

  const loadOlder=async()=>{
    if(fallbackEnabled)return fallback.loadOlder();
    if(loadingOlder||!hasOlder||!candles.length)return;
    setLoadingOlder(true);
    try{
      const before=candles[0].timestamp;
      const source=primaryRef.current;
      const res=await fetch(`/ascend-api/market/history/${encodeURIComponent(symbol)}?tf=${encodeURIComponent(timeframe)}&source=${source}&limit=300&before=${before}`,{cache:'no-store'});
      if(!res.ok)throw new Error(`History ${res.status}`);
      const page=await res.json() as HistoricalCandle[];
      const older=toCandles(page);
      const byTs=new Map<number,Candle>();
      [...older,...candles].forEach(c=>byTs.set(c.timestamp,c));
      const merged=[...byTs.values()].sort((a,b)=>a.timestamp-b.timestamp);
      setCandles(merged.slice(-2400));
      if(older.length<250)setHasOlder(false);
    }catch(err){
      setError(String((err as Error)?.message??err));
    }finally{
      setLoadingOlder(false);
    }
  };

  const fallbackState=useMemo<AscendLiveMarketState>(()=>({
    ...fallback,source:'BYBIT_FALLBACK',sources:[{source:'BYBIT',status:fallback.status==='LIVE'?'LIVE':'DEGRADED',lastUpdate:fallback.lastUpdate,latencyMs:fallback.latencyMs,note:'direct browser fallback'}]
  }),[fallback]);

  if(fallbackEnabled)return fallbackState;

  return{
    status,source:'ASCEND_ENGINE',symbol,timeframe,candles,contextCandles,eventCandles,ticker,
    lastUpdate,latencyMs,error,historyReady:contextCandles.length>=100&&candles.length>=20,
    loadingOlder,hasOlder,loadOlder,sources,consensus,dex,storage
  };
}
