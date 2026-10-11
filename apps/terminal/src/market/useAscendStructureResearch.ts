import {useEffect,useMemo,useState} from 'react';
import type {Candle} from '@ascend/contracts';
import {computeStructureReport,type StructureReport} from './ascendStructureResearch';
import type {PreviousDayLevels} from './usePreviousDayLevels';

const MINUTE=60000,DAY=86400000;
type State={key:string;status:'loading'|'ready'|'error';bars:Candle[];at:number;reason?:string};

/**
 * Causal research feed. Exact nonoverlapping daily 1m ranges (<=720 candles)
 * avoid Bybit's 1000-bar cap. Do not use forming candles.
 * No orders, execution, alerts, or signal routing.
 */
export function useAscendStructureResearch(
  symbol:string,previousDay?:PreviousDayLevels
):{status:'loading'|'ready'|'error';report?:StructureReport;reason?:string;bars?:Candle[];asOf?:number}{
  const[utcDay,setUtcDay]=useState(()=>Math.floor(Date.now()/DAY)*DAY);
  const[state,setState]=useState<State>({key:'',status:'loading',bars:[],at:0});
  useEffect(()=>{
    const day=()=>setUtcDay(Math.floor(Date.now()/DAY)*DAY);
    const timer=window.setInterval(day,20000);
    document.addEventListener('visibilitychange',day);
    return()=>{window.clearInterval(timer);document.removeEventListener('visibilitychange',day)};
  },[]);
  const key=symbol+':'+utcDay;
  useEffect(()=>{
    const abort=new AbortController();
    let timer:number|undefined,busy=false;
    const get=async()=>{
      if(abort.signal.aborted||busy||document.visibilityState==='hidden')return;
      busy=true;
      try{
        const latestClosed=Math.floor(Date.now()/MINUTE)*MINUTE-MINUTE;
        if(latestClosed<utcDay)throw Error('Ожидание первой закрытой минуты UTC');
        const blocks:[
          number,number
        ][]=[[utcDay,Math.min(utcDay+12*3600000-MINUTE,latestClosed)]];
        if(latestClosed>=utcDay+12*3600000)
          blocks.push([utcDay+12*3600000,latestClosed]);
        const raw=await Promise.all(blocks.map(async([from,to])=>{
          const qs=new URLSearchParams({category:'linear',symbol,interval:'1',
            start:String(from),end:String(to),limit:'750'});
          const response=await fetch('/market-api/v5/market/kline?'+qs,{
            signal:abort.signal,cache:'no-store'});
          if(!response.ok)throw Error('Bybit REST '+response.status);
          const json=await response.json();
          if(json.retCode!==0||!Array.isArray(json.result?.list))
            throw Error('Неполная история 1m Bybit');
          return json.result.list;
        }));
        const bars:Candle[]=raw.flat().map((row:unknown)=>{
          if(!Array.isArray(row)||row.length<6)throw Error('Некорректная OHLCV свеча');
          return {timestamp:Number(row[0]),open:Number(row[1]),high:Number(row[2]),
            low:Number(row[3]),close:Number(row[4]),volume:Number(row[5])};
        }).sort((a,b)=>a.timestamp-b.timestamp);
        const count=Math.floor((latestClosed-utcDay)/MINUTE)+1;
        if(bars.length!==count||
          bars.some((b,i)=>b.timestamp!==utcDay+i*MINUTE||
            ![b.open,b.high,b.low,b.close,b.volume].every(Number.isFinite)||
            b.low<=0||b.high<b.low||b.open<b.low||b.open>b.high||
            b.close<b.low||b.close>b.high||b.volume<0))
          throw Error('Есть пробелы в закрытых 1m барах — подтверждения отключены');
        if(!abort.signal.aborted)setState({key,status:'ready',bars,at:Date.now()});
      }catch(error){
        if(!abort.signal.aborted)setState({key,status:'error',bars:[],at:0,
          reason:String((error as Error)?.message??error)});
      }finally{
        busy=false;
        if(!abort.signal.aborted)timer=window.setTimeout(()=>void get(),60000);
      }
    };
    const visible=()=>{
      if(document.visibilityState!=='visible')return;
      if(timer!==undefined)window.clearTimeout(timer);
      void get();
    };
    setState({key,status:'loading',bars:[],at:0});
    document.addEventListener('visibilitychange',visible);
    void get();
    return()=>{abort.abort();if(timer!==undefined)window.clearTimeout(timer);
      document.removeEventListener('visibilitychange',visible)};
  },[key,symbol,utcDay]);
  const report=useMemo(()=>state.key===key&&state.status==='ready'
    ?computeStructureReport(symbol,state.bars,state.at,previousDay):undefined,
    [symbol,state,key,previousDay]);
  return state.key===key?{status:state.status,report,reason:state.reason,
      bars:state.status==='ready'?state.bars:undefined,
      asOf:state.status==='ready'?state.at:undefined}:
    {status:'loading'};
}
