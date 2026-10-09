import {useEffect,useState} from 'react';
import {SESSION_WINDOWS} from '../components/SessionClock';

const DAY_MS=86400000;
const FIVE_MINUTES_MS=300000;
const ERROR_RETRY_MS=45000;
export type PreviousSessionId=(typeof SESSION_WINDOWS)[number]['id'];
export type ClosedSessionRange={
  id:PreviousSessionId;
  name:string;
  from:number;
  to:number;
  high:number;
  low:number;
};
export type PreviousSessionLevels={
  symbol:string;
  dayStartUtc:number;
  sessions:ClosedSessionRange[];
};
type SessionState={
  key:string;
  status:'loading'|'ready'|'error';
  levels?:PreviousSessionLevels;
};

/**
 * Calculate complete, frozen UTC session ranges using only five-minute bars
 * belonging to the prior calendar day. Both endpoints are [open, close).
 * Overlap bars legitimately count toward each corresponding session.
 * Refuse to show an incomplete range (e.g. delisted/new coin or API gap).
 */
export function buildPreviousSessionLevels(
  rows:unknown[],symbol:string,previousDayStartUtc:number
):PreviousSessionLevels|undefined{
  const bars=new Map<number,{high:number;low:number}>();
  const end=previousDayStartUtc+22*3600000;
  for(const row of rows){
    if(!Array.isArray(row)||row.length<4)continue;
    const time=Number(row[0]);
    if(!Number.isFinite(time)||time<previousDayStartUtc||time>=end)continue;
    const high=Number(row[2]),low=Number(row[3]);
    if(!Number.isFinite(high)||!Number.isFinite(low)||low<=0||high<low)return undefined;
    if((time-previousDayStartUtc)%FIVE_MINUTES_MS!==0)return undefined;
    if(bars.has(time))return undefined;
    bars.set(time,{high,low});
  }
  const sessions:ClosedSessionRange[]=[];
  for(const session of SESSION_WINDOWS){
    const from=previousDayStartUtc+session.from*3600000;
    const to=previousDayStartUtc+session.to*3600000;
    let high=-Infinity,low=Infinity;
    for(let t=from;t<to;t+=FIVE_MINUTES_MS){
      const candle=bars.get(t);
      if(!candle)return undefined;
      high=Math.max(high,candle.high);
      low=Math.min(low,candle.low);
    }
    if(!Number.isFinite(high)||!Number.isFinite(low))return undefined;
    sessions.push({id:session.id,name:session.name,from:session.from,to:session.to,high,low});
  }
  return {symbol,dayStartUtc:previousDayStartUtc,sessions};
}

export function usePreviousSessionLevels(symbol:string){
  const[utcDay,setUtcDay]=useState(()=>Math.floor(Date.now()/DAY_MS)*DAY_MS);
  const[state,setState]=useState<SessionState>({key:'',status:'loading'});
  useEffect(()=>{
    const syncUtcDate=()=>setUtcDay(Math.floor(Date.now()/DAY_MS)*DAY_MS);
    const timer=window.setInterval(syncUtcDate,30000);
    document.addEventListener('visibilitychange',syncUtcDate);
    return()=>{
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange',syncUtcDate);
    };
  },[]);
  const previousDayStartUtc=utcDay-DAY_MS;
  const key=symbol+':'+previousDayStartUtc;
  useEffect(()=>{
    const abort=new AbortController();
    let retryTimer:number|undefined;
    const getSessions=async()=>{
      try{
        // 00:00–22:00 UTC: 264 five-minute candles, covering all 3 windows.
        // Using explicit start/end avoids mixing a partially formed current day.
        const params=new URLSearchParams({
          category:'linear',symbol,interval:'5',limit:'270',
          start:String(previousDayStartUtc),
          end:String(previousDayStartUtc+22*3600000-1)
        });
        const response=await fetch('/market-api/v5/market/kline?'+params.toString(),{
          cache:'no-store',signal:abort.signal
        });
        if(!response.ok)throw new Error('5m REST '+response.status);
        const body=await response.json();
        if(body.retCode!==0||!Array.isArray(body.result?.list))
          throw new Error('Invalid Bybit 5m history');
        const levels=buildPreviousSessionLevels(body.result.list,symbol,previousDayStartUtc);
        if(!levels)throw new Error('Incomplete previous session history');
        if(abort.signal.aborted)return;
        setState({key,status:'ready',levels});
      }catch{
        if(abort.signal.aborted)return;
        setState({key,status:'error'});
        retryTimer=window.setTimeout(()=>{void getSessions()},ERROR_RETRY_MS);
      }
    };
    setState({key,status:'loading'});
    void getSessions();
    return()=>{
      abort.abort();
      if(retryTimer!==undefined)window.clearTimeout(retryTimer);
    };
  },[symbol,previousDayStartUtc,key]);
  return state.key===key
    ? {status:state.status,levels:state.levels}
    : {status:'loading' as const,levels:undefined};
}
