import {useEffect,useState} from 'react';

const DAY_MS=86400000;
const FIVE_MS=300000;
export type VwapPoint={timestamp:number;value:number;closed:boolean};
export type DailyVwap={symbol:string;dayStartUtc:number;points:VwapPoint[];value:number;updatedAt:number};
type State={key:string;status:'loading'|'ready'|'error';daily?:DailyVwap};

/** UTC-anchored VWAP using complete 5m history from 00:00, weighted by traded base volume. */
export function calculateDailyVwap(rows:unknown[],symbol:string,start:number,now:number):DailyVwap|undefined{
  const bars=new Map<number,{high:number;low:number;close:number;volume:number}>();
  for(const raw of rows){
    if(!Array.isArray(raw)||raw.length<6)continue;
    const t=Number(raw[0]);
    if(!Number.isFinite(t)||t<start||t>now)continue;
    if((t-start)%FIVE_MS!==0||bars.has(t))return undefined;
    const high=Number(raw[2]),low=Number(raw[3]),close=Number(raw[4]),volume=Number(raw[5]);
    if(![high,low,close,volume].every(Number.isFinite)||low<=0||high<low||close<low||close>high||volume<0)return undefined;
    bars.set(t,{high,low,close,volume});
  }
  const last=Math.floor((now-start)/FIVE_MS)*FIVE_MS+start;
  if(last<start||last>=start+DAY_MS)return undefined;
  let weighted=0,total=0;
  const points:VwapPoint[]=[];
  for(let t=start;t<=last;t+=FIVE_MS){
    const b=bars.get(t);
    if(!b)return undefined; // Never construct a VWAP from a truncated day.
    weighted+=(b.high+b.low+b.close)/3*b.volume;
    total+=b.volume;
    if(total>0)points.push({timestamp:t,value:weighted/total,closed:t+FIVE_MS<=now});
  }
  if(!points.length)return undefined;
  return {symbol,dayStartUtc:start,points,value:points[points.length-1].value,updatedAt:now};
}

export function useDailyVwap(symbol:string){
  const[dayStart,setDayStart]=useState(()=>Math.floor(Date.now()/DAY_MS)*DAY_MS);
  const[state,setState]=useState<State>({key:'',status:'loading'});
  useEffect(()=>{
    const sync=()=>setDayStart(Math.floor(Date.now()/DAY_MS)*DAY_MS);
    const timer=window.setInterval(sync,15000);
    document.addEventListener('visibilitychange',sync);
    return()=>{window.clearInterval(timer);document.removeEventListener('visibilitychange',sync)};
  },[]);
  const key=symbol+':'+dayStart;
  useEffect(()=>{
    const abort=new AbortController();
    let timer:number|undefined,fetching=false;
    const refresh=async()=>{
      if(abort.signal.aborted||fetching)return;
      fetching=true;
      try{
        const now=Date.now();
        const qs=new URLSearchParams({
          category:'linear',symbol,interval:'5',limit:'300',start:String(dayStart),end:String(now)
        });
        const response=await fetch('/market-api/v5/market/kline?'+qs,{cache:'no-store',signal:abort.signal});
        if(!response.ok)throw new Error('Bybit REST error');
        const result=await response.json();
        if(result.retCode!==0||!Array.isArray(result.result?.list))throw new Error('Bad 5m data');
        const daily=calculateDailyVwap(result.result.list,symbol,dayStart,now);
        if(!daily)throw new Error('Incomplete UTC day data');
        if(!abort.signal.aborted)setState({key,status:'ready',daily});
      }catch{
        if(!abort.signal.aborted)setState({key,status:'error'});
      }finally{
        fetching=false;
        if(!abort.signal.aborted)timer=window.setTimeout(()=>{void refresh()},60000);
      }
    };
    const onVisible=()=>{
      if(document.visibilityState==='visible'){
        if(timer!==undefined)window.clearTimeout(timer);
        void refresh();
      }
    };
    setState({key,status:'loading'});
    void refresh();
    document.addEventListener('visibilitychange',onVisible);
    return()=>{
      abort.abort();
      if(timer!==undefined)window.clearTimeout(timer);
      document.removeEventListener('visibilitychange',onVisible);
    };
  },[key,symbol,dayStart]);
  return state.key===key?{status:state.status,daily:state.daily}:
    {status:'loading' as const,daily:undefined};
}
