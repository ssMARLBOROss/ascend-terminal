import {useEffect,useMemo,useState} from 'react';
import type {Candle} from '@ascend/contracts';
import type {TrendStructureSnapshot,TrendStructureRow} from './trendStructureResearch';
import {trendFromClosedBars} from './trendStructureResearch';
import {TF_FULL,deriveTimeframe,fullyClosed,type FullTimeframe} from './fullTimeframes';

type NativeId='5'|'15'|'60'|'240'|'720'|'D';
export const NATIVE_TREND_INTERVALS=['5','15','60','240','720','D'] as const;
export type NativeTrendData=Partial<Record<NativeId,Candle[]>>;
type HistoryState={symbol:string;at:number;status:'loading'|'ready'|'error';
  data:NativeTrendData;error?:string};
export type ExpandedTrendSnapshot={rows:TrendStructureRow[];fresh:boolean;
  status:'loading'|'ready'|'error';reason?:string;
  asOf:number;observed30m15m:'LONG'|'SHORT'|'CONFLICT'|'WAIT'};

export function expandTrendStructure(
  core:TrendStructureSnapshot,source:NativeTrendData,
  historyUpdatedAt:number,now:number
):ExpandedTrendSnapshot{
  const asOf=core.asOf;
  const fresh=!!asOf&&!!historyUpdatedAt&&now-historyUpdatedAt<=180000&&
    now-asOf<=180000&&asOf<=now+2000;
  const noData=(tf:FullTimeframe,minutes:number,why:string):TrendStructureRow=>({
    tf,minutes,trend:'NO DATA',high:'—',low:'—',bars:0,reason:why
  });
  const spec:Record<FullTimeframe,{id?:NativeId,from:number,minutes:number}>={
    '1m':{from:1,minutes:1},'3m':{from:3,minutes:3},
    '5m':{id:'5',from:5,minutes:5},
    '10m':{id:'5',from:5,minutes:10},
    '15m':{id:'15',from:15,minutes:15},
    '30m':{id:'15',from:15,minutes:30},
    '45m':{id:'15',from:15,minutes:45},
    '1H':{id:'60',from:60,minutes:60},
    '2H':{id:'60',from:60,minutes:120},
    '4H':{id:'240',from:240,minutes:240},
    '6H':{id:'60',from:60,minutes:360},
    '12H':{id:'720',from:720,minutes:720},
    '1D':{id:'D',from:1440,minutes:1440}
  };
  const rows=TF_FULL.map(([tf,minutes])=>{
    // CORE 1m/3m come from the strict contiguous closed 1m feed.
    if(tf==='1m'||tf==='3m')return core.rows.find(r=>r.tf===tf)??noData(tf,minutes,'Нет строгой 1m истории CORE');
    if(!fresh)return noData(tf,minutes,'История Bybit устарела');
    const item=spec[tf],original=item.id?source[item.id]:undefined;
    if(!original?.length)return noData(tf,minutes,'Исторический ряд Bybit отсутствует');
    const base=fullyClosed(original,item.from,asOf);
    const closed=item.from===item.minutes?base:
      fullyClosed(deriveTimeframe(base,item.from,item.minutes),item.minutes,asOf);
    return trendFromClosedBars(tf,minutes,closed,asOf);
  });
  const thirty=rows.find(r=>r.tf==='30m')?.trend, fifteen=rows.find(r=>r.tf==='15m')?.trend;
  const observed30m15m=thirty==='LONG'&&fifteen==='LONG'?'LONG':
    thirty==='SHORT'&&fifteen==='SHORT'?'SHORT':
    (thirty==='LONG'&&fifteen==='SHORT'||thirty==='SHORT'&&fifteen==='LONG')?'CONFLICT':'WAIT';
  return {rows,asOf,fresh,status:fresh?'ready':'loading',observed30m15m};
}
function parsePayload(payload:unknown):Candle[]{
  if(!payload||typeof payload!=='object')throw Error('История Bybit недоступна');
  const body=payload as {retCode?:number;result?:{list?:unknown[]}};
  if(body.retCode!==0||!Array.isArray(body.result?.list))throw Error('Некорректный ответ Bybit');
  const rows=body.result.list.map(row=>{
    if(!Array.isArray(row)||row.length<6)throw Error('Некорректная OHLCV свеча');
    return {timestamp:Number(row[0]),open:Number(row[1]),high:Number(row[2]),
      low:Number(row[3]),close:Number(row[4]),volume:Number(row[5])};
  }).sort((a,b)=>a.timestamp-b.timestamp);
  if(rows.some((x,i)=>![x.timestamp,x.open,x.high,x.low,x.close,x.volume]
    .every(Number.isFinite)||x.low<=0||x.high<x.low||x.volume<0||
    i>0&&x.timestamp===rows[i-1].timestamp))throw Error('Повреждённые OHLCV данные');
  return rows;
}
/** Observational history, non-gating. Core uses only its own strict 1m chain.
 * Pull 6 native Bybit TF histories every ~2 min, not one WS per interval.
 */
export function useExpandedTrendResearch(symbol:string,core:TrendStructureSnapshot):ExpandedTrendSnapshot{
  const[state,setState]=useState<HistoryState>({
    symbol:'',at:0,status:'loading',data:{}
  });
  useEffect(()=>{
    const abort=new AbortController();
    let timer:number|undefined,active=false;
    const fetchAll=async()=>{
      if(active||abort.signal.aborted||document.visibilityState==='hidden')return;
      active=true;
      try{
        const pairs=await Promise.all(NATIVE_TREND_INTERVALS.map(async interval=>{
          const query=new URLSearchParams({
            category:'linear',symbol,interval,limit:'240'
          });
          const response=await fetch('/market-api/v5/market/kline?'+query,{
            signal:abort.signal,cache:'no-store'
          });
          if(!response.ok)throw Error('Bybit REST '+response.status+' · '+interval);
          return [interval,parsePayload(await response.json())] as const;
        }));
        if(!abort.signal.aborted)setState({symbol,at:Date.now(),
          status:'ready',data:Object.fromEntries(pairs) as NativeTrendData});
      }catch(e){
        if(!abort.signal.aborted)setState({symbol,at:0,status:'error',data:{},
          error:String((e as Error).message??e)});
      }finally{active=false;
        if(!abort.signal.aborted)timer=window.setTimeout(()=>void fetchAll(),120000);}
    };
    setState({symbol,at:0,status:'loading',data:{}});
    const onVisibility=()=>{
      if(document.visibilityState!=='visible'||active)return;
      if(timer!==undefined)window.clearTimeout(timer);
      void fetchAll();
    };
    document.addEventListener('visibilitychange',onVisibility);
    void fetchAll();
    return()=>{abort.abort();if(timer!==undefined)window.clearTimeout(timer);
      document.removeEventListener('visibilitychange',onVisibility)};
  },[symbol]);
  const snapshot=useMemo(()=>expandTrendStructure(core,
    state.symbol===symbol&&state.status==='ready'?state.data:{},
    state.symbol===symbol?state.at:0,Date.now()
  ),[core,state,symbol]);
  return {...snapshot,status:state.symbol!==symbol?'loading':state.status,
    reason:state.error};
}
