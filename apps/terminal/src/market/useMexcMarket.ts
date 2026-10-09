import {useEffect,useState} from 'react';
import type {Candle} from '@ascend/contracts';
import type {StableTimeframe} from './useStableMarket';

/** MEXC Futures REST K-lines. Volumes are CONTRACT LOTS, not base coin volume. */
const periods:Record<StableTimeframe,string>={
  '1m':'Min1','3m':'Min1','5m':'Min5','15m':'Min15',
  '30m':'Min30','1H':'Min60','4H':'Hour4','1D':'Day1'
};
const duration:Record<StableTimeframe,number>={
  '1m':60,'3m':60,'5m':300,'15m':900,'30m':1800,
  '1H':3600,'4H':14400,'1D':86400
};
export function parseMexcKlines(data:unknown):Candle[]{
  const obj=data as {success?:boolean;code?:number;message?:string;
    data?:{time?:unknown[];open?:unknown[];high?:unknown[];low?:unknown[];
      close?:unknown[];vol?:unknown[]}};
  if(obj?.success!==true||!obj.data)throw Error('MEXC kline: '+String(obj?.message??'invalid response'));
  const x=obj.data;
  if(!Array.isArray(x.time)||!Array.isArray(x.open)||
      !Array.isArray(x.high)||!Array.isArray(x.low)||
      !Array.isArray(x.close)||!Array.isArray(x.vol))
    throw Error('MEXC returned incomplete candle arrays');
  const n=x.time.length;
  if([x.open,x.high,x.low,x.close,x.vol].some(a=>a!.length!==n))
    throw Error('MEXC candle arrays have inconsistent length');
  const bars:Candle[]=[];
  for(let i=0;i<n;i++){
    const timestamp=Number(x.time[i])*1000;
    const open=Number(x.open[i]),high=Number(x.high[i]),low=Number(x.low[i]),
      close=Number(x.close[i]),volume=Number(x.vol[i]);
    if(!Number.isFinite(timestamp)||timestamp<=0||
      ![open,high,low,close,volume].every(Number.isFinite)||
      low<=0||high<Math.max(open,close)||low>Math.min(open,close)||volume<0)
      continue;
    bars.push({timestamp,open,high,low,close,volume});
  }
  return [...new Map(bars.map(b=>[b.timestamp,b])).values()]
    .sort((a,b)=>a.timestamp-b.timestamp).slice(-1200);
}
export function aggregateMexc3m(bars:Candle[],now:number):Candle[]{
  const sorted=[...bars].sort((a,b)=>a.timestamp-b.timestamp);
  const groups=new Map<number,Candle[]>();
  for(const bar of sorted){
    const start=Math.floor(bar.timestamp/180000)*180000;
    if(!groups.has(start))groups.set(start,[]);
    groups.get(start)!.push(bar);
  }
  const result:Candle[]=[];
  for(const [start,part] of groups){
    const newest=start+180000>now;
    if(!newest&&part.length!==3)continue;
    if(newest&&(!part.length||part.length>3))continue;
    if(part.some((bar,i)=>bar.timestamp!==start+i*60000))continue;
    result.push({
      timestamp:start,open:part[0].open,high:Math.max(...part.map(b=>b.high)),
      low:Math.min(...part.map(b=>b.low)),close:part.at(-1)!.close,
      volume:part.reduce((v,b)=>v+b.volume,0)
    });
  }
  return result.slice(-320);
}
export async function getMexcKlines(fetcher:typeof fetch,symbol:string,
  timeframe:StableTimeframe,now:number,signal?:AbortSignal):Promise<Candle[]>{
  if(!/^[A-Z0-9]+_USDT$/.test(symbol))throw Error('Invalid MEXC symbol');
  const step=duration[timeframe],barsNeeded=timeframe==='3m'?990:350;
  const start=Math.floor(now/1000)-step*barsNeeded;
  const end=Math.floor(now/1000);
  const qs=new URLSearchParams({interval:periods[timeframe],
    start:String(start),end:String(end)});
  const response=await fetcher('/mexc-market-api/api/v1/contract/kline/'+
    encodeURIComponent(symbol)+'?'+qs,{signal,cache:'no-store'});
  if(!response.ok)throw Error('MEXC candles HTTP '+response.status);
  const parsed=parseMexcKlines(await response.json());
  if(!parsed.length)throw Error('MEXC returned no candles for '+symbol);
  return timeframe==='3m'?aggregateMexc3m(parsed,now):parsed.slice(-320);
}

export function useMexcMarket(symbol:string,timeframe:StableTimeframe){
  const[state,setState]=useState<{
    symbol:string;timeframe:StableTimeframe;candles:Candle[];
    status:'LOADING'|'POLLING'|'ERROR';error?:string;lastUpdate?:number;
  }>({symbol,timeframe,candles:[],status:'LOADING'});
  useEffect(()=>{
    const abort=new AbortController();
    let running=false,timer:number|undefined;
    setState({symbol,timeframe,candles:[],status:'LOADING'});
    const poll=async()=>{
      if(abort.signal.aborted||running||document.visibilityState==='hidden')return;
      running=true;
      try{
        const candles=await getMexcKlines(fetch,symbol,timeframe,Date.now(),abort.signal);
        if(!abort.signal.aborted)setState({
          symbol,timeframe,candles,status:'POLLING',lastUpdate:Date.now()
        });
      }catch(e){
        if(!abort.signal.aborted)setState(prev=>({
          symbol,timeframe,candles:prev.symbol===symbol?prev.candles:[],
          status:'ERROR',error:String((e as Error).message??e),
          lastUpdate:prev.lastUpdate
        }));
      }finally{running=false}
    };
    void poll();
    timer=window.setInterval(()=>{void poll()},15000);
    const visible=()=>{if(document.visibilityState==='visible')void poll()};
    document.addEventListener('visibilitychange',visible);
    return()=>{
      abort.abort();if(timer!==undefined)window.clearInterval(timer);
      document.removeEventListener('visibilitychange',visible);
    };
  },[symbol,timeframe]);
  return state.symbol===symbol&&state.timeframe===timeframe?state:
    {symbol,timeframe,candles:[],status:'LOADING' as const};
}
