import {useEffect,useMemo,useRef,useState} from 'react';
import type {Candle} from '@ascend/contracts';
import type {DailyVwap} from './useDailyVwap';
import type {Metric,TpoProfile,OpenInterest,TradeDelta} from './useLiveMarketMetrics';
import type {OrderbookSnapshot} from './useOrderbookClusters';
import type {PreviousDayLevels} from './usePreviousDayLevels';
import type {PreviousSessionLevels} from './usePreviousSessionLevels';
import type {FvgRecord} from './fvgContextEngine';
import type {ContinuousCvd} from './useContinuousCvd';
import {buildParticipationSnapshot,detectObservedLevelEvents,frozenReferences,
  type ParticipationSnapshot,type ParticipationEvent} from './marketParticipationEngine';

export type ParticipationJournal={symbol:string;startedAt:number;
  snapshots:ParticipationSnapshot[];events:ParticipationEvent[]};
const KEY='ascend.participation.local.v1.';
function read(symbol:string):ParticipationJournal{
  try{
    const saved=window.localStorage.getItem(KEY+symbol);
    if(saved){
      const j=JSON.parse(saved) as ParticipationJournal;
      if(j.symbol===symbol&&Array.isArray(j.snapshots)&&Array.isArray(j.events))
        return {symbol,startedAt:j.startedAt||Date.now(),
          snapshots:j.snapshots.slice(-180),events:j.events.slice(-140)};
    }
  }catch{/* storage may not be accessible */}
  return {symbol,startedAt:Date.now(),snapshots:[],events:[]};
}
export function downloadParticipationJournal(journal:ParticipationJournal){
  const file=new Blob([JSON.stringify({
    label:'ASCEND MARKET PARTICIPATION V1',
    scope:'LOCAL ONLINE OBSERVATIONS; NOT VERIFIED CORE TRADES',
    exportedAt:new Date().toISOString(),journal
  },null,2)],{type:'application/json'});
  const url=URL.createObjectURL(file);
  const anchor=document.createElement('a');anchor.href=url;
  anchor.download='ASCEND_MARKET_PARTICIPATION_'+journal.symbol+'_'+
    new Date().toISOString().slice(0,10)+'.json';
  anchor.click();
  window.setTimeout(()=>URL.revokeObjectURL(url),1500);
}

/** Read-only observation in chosen symbol. Only current market observations
 *  are snapshotted; older replay FVG events cannot silently become live ones. */
export function useMarketParticipation(args:{
  enabled:boolean;symbol:string;timeframe:string;candles:Candle[];
  price?:number;priceAt?:number;dailyVwap?:DailyVwap;
  tpo:Metric<TpoProfile>;oi:Metric<OpenInterest>;cvd:Metric<TradeDelta>;
  continuousCvd?:ContinuousCvd;
  book?:OrderbookSnapshot;previousDay?:PreviousDayLevels;
  previousSessions?:PreviousSessionLevels;fvgs:FvgRecord[];
}){
  const {enabled,symbol,candles,timeframe,price,priceAt,dailyVwap,
    tpo,oi,cvd,book,previousDay,previousSessions,fvgs}=args;
  const [journal,setJournal]=useState<ParticipationJournal>(()=>read(symbol));
  const [now,setNow]=useState(()=>Date.now());
  const openedAtRef=useRef(Date.now());
  const lastSavedRef=useRef(0);
  const levels=useMemo(()=>frozenReferences(previousDay,previousSessions),
    [previousDay,previousSessions]);
  useEffect(()=>{
    const update=()=>setNow(Date.now());
    const handle=window.setInterval(update,30000);
    document.addEventListener('visibilitychange',update);
    return()=>{window.clearInterval(handle);document.removeEventListener('visibilitychange',update)};
  },[]);
  const snapshot=useMemo(()=>buildParticipationSnapshot({
    symbol,now,price,priceAt,candles,timeframe,vwap:dailyVwap,
    tpo,oi,cvd,continuousCvd:args.continuousCvd,orderbook:book,levels
  }),[symbol,now,price,priceAt,candles,timeframe,dailyVwap,tpo,oi,cvd,
    args.continuousCvd,book,levels]);
  useEffect(()=>{
    if(!enabled||journal.symbol!==symbol||document.visibilityState==='hidden')return;
    const started=openedAtRef.current;
    const observed=Date.now();
    const freshSnapshot={...snapshot,observedAt:observed};
    const obs=detectObservedLevelEvents({symbol,candles,timeframe,levels,
      startedAt:started,now:observed,snapshot:freshSnapshot});
    const fvgEvents:ParticipationEvent[]=[];
    for(const z of fvgs){
      if(z.symbol!==symbol)continue;
      for(const e of z.events){
        if(e.at<started||e.at>observed)continue;
        const type=e.type==='CREATED'?'FVG_CREATED':
          e.type==='RETEST'?'FVG_RETEST':e.type==='FILLED'?'FVG_FILLED':null;
        if(!type)continue;
        fvgEvents.push({id:'PARTICIPATION:'+e.id,symbol,
          type,occurredAt:e.at,observedAt:observed,
          source:'FVG_REPLAY',snapshot:freshSnapshot,
          notes:'FVG from CLOSED '+z.timeframe+' candle replay. Metrics are from observation time, NOT time-of-event historical measurements.'});
      }
    }
    const recordSnapshot=lastSavedRef.current===0||observed-lastSavedRef.current>=60000;
    if(!recordSnapshot&&!obs.length&&!fvgEvents.length)return;
    if(recordSnapshot)lastSavedRef.current=observed;
    setJournal(previous=>{
      if(previous.symbol!==symbol)return previous;
      const oldIds=new Set(previous.events.map(e=>e.id));
      const nextEvents=[...obs,...fvgEvents].filter(e=>!oldIds.has(e.id));
      const nextSnapshots=recordSnapshot?
        [...previous.snapshots,freshSnapshot].slice(-180):previous.snapshots;
      if(!recordSnapshot&&!nextEvents.length)return previous;
      return {...previous,snapshots:nextSnapshots,
        events:[...previous.events,...nextEvents]
          .sort((a,b)=>a.occurredAt-b.occurredAt||a.id.localeCompare(b.id)).slice(-140)};
    });
  },[enabled,journal.symbol,symbol,snapshot,candles,timeframe,levels,fvgs]);
  useEffect(()=>{
    if(journal.symbol!==symbol)return;
    try{window.localStorage.setItem(KEY+symbol,JSON.stringify(journal))}
    catch{/* storage unavailable or quota exhausted; user may export */}
  },[journal,symbol]);
  return {snapshot,journal,levels};
}
