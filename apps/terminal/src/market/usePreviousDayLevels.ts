import {useEffect,useState} from 'react';

const DAY_MS=24*60*60*1000;
const REFRESH_ON_ERROR_MS=45000;

// Previous fully closed UTC calendar day, not a rolling 24-hour range.
export type PreviousDayLevels={
  symbol:string;
  dayStartUtc:number;
  high:number;
  low:number;
};
type LevelState={
  key:string;
  status:'loading'|'ready'|'error';
  levels?:PreviousDayLevels;
};

export function selectPreviousUtcDay(
  rows:unknown[],
  symbol:string,
  previousDayStartUtc:number
):PreviousDayLevels|undefined{
  for(const value of rows){
    if(!Array.isArray(value)||value.length<4)continue;
    if(Number(value[0])!==previousDayStartUtc)continue;
    const high=Number(value[2]),low=Number(value[3]);
    if(!Number.isFinite(high)||!Number.isFinite(low)||low<=0||high<low)return undefined;
    return {symbol,dayStartUtc:previousDayStartUtc,high,low};
  }
  return undefined;
}

export function usePreviousDayLevels(symbol:string){
  const[utcDayStart,setUtcDayStart]=useState(()=>Math.floor(Date.now()/DAY_MS)*DAY_MS);
  const[state,setState]=useState<LevelState>({key:'',status:'loading'});

  useEffect(()=>{
    const checkDate=()=>setUtcDayStart(Math.floor(Date.now()/DAY_MS)*DAY_MS);
    const interval=window.setInterval(checkDate,30000);
    document.addEventListener('visibilitychange',checkDate);
    return()=>{
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange',checkDate);
    };
  },[]);

  const previousDayStartUtc=utcDayStart-DAY_MS;
  const key=symbol+':'+previousDayStartUtc;
  useEffect(()=>{
    const abort=new AbortController();
    let retryTimer:number|undefined;
    const fetchPrevious=async()=>{
      try{
        const params=new URLSearchParams({
          category:'linear',symbol,interval:'D',limit:'5'
        });
        const response=await fetch('/market-api/v5/market/kline?'+params.toString(),{
          signal:abort.signal,cache:'no-store'
        });
        if(!response.ok)throw Error('HTTP '+response.status);
        const body=await response.json();
        if(body.retCode!==0||!Array.isArray(body.result?.list))throw Error('Invalid daily response');
        const levels=selectPreviousUtcDay(body.result.list,symbol,previousDayStartUtc);
        if(!levels)throw Error('Previous closed UTC daily candle not found');
        if(abort.signal.aborted)return;
        setState({key,status:'ready',levels});
      }catch{
        if(abort.signal.aborted)return;
        setState({key,status:'error'});
        retryTimer=window.setTimeout(()=>{void fetchPrevious()},REFRESH_ON_ERROR_MS);
      }
    };
    setState({key,status:'loading'});
    void fetchPrevious();
    return()=>{
      abort.abort();
      if(retryTimer!==undefined)window.clearTimeout(retryTimer);
    };
  },[symbol,previousDayStartUtc,key]);

  return state.key===key
    ? {status:state.status,levels:state.levels}
    : {status:'loading' as const,levels:undefined};
}
