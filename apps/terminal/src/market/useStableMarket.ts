import {useEffect,useState} from 'react';
import type {Candle} from '@ascend/contracts';

// Deliberately use only native Bybit intervals in the stable shell.
// Derived intervals (10m/45m) and their aggregation remain in the legacy research UI.
export const STABLE_TIMEFRAMES=['1m','3m','5m','15m','30m','1H','4H','1D'] as const;
export type StableTimeframe=(typeof STABLE_TIMEFRAMES)[number];
type FeedStatus='CONNECTING'|'LIVE'|'RECONNECTING';
type StableMarket={
  candles:Candle[];
  status:FeedStatus;
  error?:string;
  lastPrice?:number;
  lastUpdate?:number;
};

const intervals:Record<StableTimeframe,string>={
  '1m':'1','3m':'3','5m':'5','15m':'15','30m':'30',
  '1H':'60','4H':'240','1D':'D'
};
const MAX_CANDLES=320;

function parseCandle(raw:any):Candle|undefined {
  const candle={
    timestamp:Number(raw.start),
    open:Number(raw.open),
    high:Number(raw.high),
    low:Number(raw.low),
    close:Number(raw.close),
    volume:Number(raw.volume)
  };
  return Object.values(candle).every(Number.isFinite)&&candle.timestamp>0?candle:undefined;
}

function appendLive(previous:Candle[],next:Candle):Candle[] {
  if(!previous.length)return[next];
  const last=previous[previous.length-1];
  if(next.timestamp===last.timestamp){
    if(last.open===next.open&&last.high===next.high&&last.low===next.low&&last.close===next.close&&last.volume===next.volume)return previous;
    const updated=previous.slice();
    updated[updated.length-1]=next;
    return updated;
  }
  if(next.timestamp>last.timestamp)return[...previous.slice(-(MAX_CANDLES-1)),next];
  // Out-of-order frames are ignored; periodic REST reconciliation fills gaps.
  return previous;
}

function mergeHistory(previous:Candle[],historical:Candle[],pending?:Candle):Candle[]{
  const indexed=new Map<number,Candle>();
  for(const c of historical)indexed.set(c.timestamp,c);
  for(const c of previous)indexed.set(c.timestamp,c);
  if(pending)indexed.set(pending.timestamp,pending);
  return [...indexed.values()].sort((a,b)=>a.timestamp-b.timestamp).slice(-MAX_CANDLES);
}

export function useStableMarket(symbol:string,timeframe:StableTimeframe):StableMarket {
  const[candles,setCandles]=useState<Candle[]>([]);
  const[status,setStatus]=useState<FeedStatus>('CONNECTING');
  const[error,setError]=useState<string>();
  const[lastPrice,setLastPrice]=useState<number>();
  const[lastUpdate,setLastUpdate]=useState<number>();

  useEffect(()=>{
    let disposed=false;
    let socket:WebSocket|undefined;
    let retryTimer:number|undefined;
    let pingTimer:number|undefined;
    let refreshTimer:number|undefined;
    let frame:number|undefined;
    let pending:Candle|undefined;
    let connectedBefore=false;
    let retries=0;
    let fetching=false;
    let lastMessageAt=Date.now();
    const abort=new AbortController();
    const interval=intervals[timeframe];

    const syncHistory=async()=>{
      if(disposed||fetching)return;
      fetching=true;
      try{
        const params=new URLSearchParams({category:'linear',symbol,interval,limit:String(MAX_CANDLES)});
        const response=await fetch('/market-api/v5/market/kline?'+params.toString(),{
          cache:'no-store',signal:abort.signal
        });
        if(!response.ok)throw new Error('REST '+response.status);
        const json=await response.json();
        if(json.retCode!==0||!Array.isArray(json.result?.list))throw new Error(String(json.retMsg??'Invalid history'));
        const historical:Candle[]=json.result.list.map((row:any)=>({
          timestamp:Number(row[0]),open:Number(row[1]),high:Number(row[2]),
          low:Number(row[3]),close:Number(row[4]),volume:Number(row[5])
        })).filter((c:Candle)=>Object.values(c).every(Number.isFinite)&&c.timestamp>0)
          .sort((a:Candle,b:Candle)=>a.timestamp-b.timestamp);
        if(!historical.length)throw new Error('No candles returned');
        if(disposed)return;
        setCandles(previous=>mergeHistory(previous,historical,pending));
        setLastPrice(previous=>previous??historical[historical.length-1].close);
        setError(undefined);
      }catch(err){
        if(disposed||abort.signal.aborted)return;
        setError('История свечей: '+String((err as Error).message??err));
      }finally{
        fetching=false;
      }
    };

    const scheduleLiveFrame=()=>{
      if(frame!==undefined)return;
      frame=window.requestAnimationFrame(()=>{
        frame=undefined;
        if(disposed||!pending)return;
        const next=pending;
        pending=undefined;
        setCandles(previous=>appendLive(previous,next));
        setLastPrice(next.close);
        setLastUpdate(Date.now());
      });
    };

    const connect=()=>{
      if(disposed)return;
      setStatus(connectedBefore?'RECONNECTING':'CONNECTING');
      try{
        const ws=new WebSocket('wss://stream.bybit.com/v5/public/linear');
        socket=ws;
        ws.onopen=()=>{
          if(disposed){ws.close();return}
          setStatus('LIVE');
          setError(undefined);
          lastMessageAt=Date.now();
          retries=0;
          ws.send(JSON.stringify({op:'subscribe',args:['kline.'+interval+'.'+symbol]}));
          if(pingTimer!==undefined)window.clearInterval(pingTimer);
          pingTimer=window.setInterval(()=>{
            if(ws.readyState!==WebSocket.OPEN)return;
            if(Date.now()-lastMessageAt>90000){ws.close();return}
            ws.send(JSON.stringify({op:'ping'}));
          },20000);
          if(connectedBefore)void syncHistory();
          connectedBefore=true;
        };
        ws.onmessage=(event:MessageEvent<string>)=>{
          if(disposed)return;
          lastMessageAt=Date.now();
          let message:any;
          try{message=JSON.parse(event.data)}catch{return}
          if(message.topic!=='kline.'+interval+'.'+symbol)return;
          const item=Array.isArray(message.data)?message.data[0]:undefined;
          if(!item)return;
          const candle=parseCandle(item);
          if(!candle)return;
          pending=candle;
          scheduleLiveFrame();
        };
        ws.onerror=()=>{if(!disposed)ws.close()};
        ws.onclose=()=>{
          if(pingTimer!==undefined){window.clearInterval(pingTimer);pingTimer=undefined}
          if(disposed)return;
          setStatus('RECONNECTING');
          retries+=1;
          const delay=Math.min(16000,1000*Math.pow(2,Math.min(retries-1,4)));
          retryTimer=window.setTimeout(connect,delay);
        };
      }catch{
        if(disposed)return;
        setStatus('RECONNECTING');
        retryTimer=window.setTimeout(connect,5000);
      }
    };

    void syncHistory();
    connect();
    // Reconcile missed candles without repeatedly loading history or other timeframes.
    refreshTimer=window.setInterval(()=>{void syncHistory()},180000);
    return()=>{
      disposed=true;
      abort.abort();
      if(retryTimer!==undefined)window.clearTimeout(retryTimer);
      if(pingTimer!==undefined)window.clearInterval(pingTimer);
      if(refreshTimer!==undefined)window.clearInterval(refreshTimer);
      if(frame!==undefined)window.cancelAnimationFrame(frame);
      if(socket){
        socket.onopen=null;socket.onmessage=null;socket.onerror=null;socket.onclose=null;
        socket.close();
      }
    };
  },[symbol,timeframe]);

  return{candles,status,error,lastPrice,lastUpdate};
}
