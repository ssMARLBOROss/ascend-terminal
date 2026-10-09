import {useEffect,useMemo,useState} from 'react';
import type {Candle} from '@ascend/contracts';
import type {PreviousDayLevels} from './usePreviousDayLevels';
import type {PreviousSessionLevels} from './usePreviousSessionLevels';
import {computeFvgContext,FVG_TF_MS,type FvgTf,type FvgRecord,type FvgContextLevel,
  type EngineSettings,type FvgObservation} from './fvgContextEngine';
import {deriveLiveMarketContext} from './engine';

const MAX_CANDLES=320;
const JOURNAL_PREFIX='ascend.fvg.research.journal.v1.';
export const FVG_TIMEFRAMES=Object.keys(FVG_TF_MS) as FvgTf[];

function candlesFromBybit(rows:unknown[]):Candle[]{
  const results:Candle[]=[];
  for(const row of rows){
    if(!Array.isArray(row)||row.length<6)continue;
    const timestamp=Number(row[0]),open=Number(row[1]),high=Number(row[2]),
      low=Number(row[3]),close=Number(row[4]),volume=Number(row[5]);
    if([timestamp,open,high,low,close,volume].every(Number.isFinite))
      results.push({timestamp,open,high,low,close,volume});
  }
  return results.sort((a,b)=>a.timestamp-b.timestamp);
}
function readJournal(symbol:string):FvgRecord[]{
  try{
    const raw=window.localStorage.getItem(JOURNAL_PREFIX+symbol);
    if(!raw)return [];
    const parsed=JSON.parse(raw);
    return Array.isArray(parsed)?parsed.filter((x:unknown)=>
      typeof x==='object'&&x!==null&&(x as FvgRecord).symbol===symbol&&
      typeof (x as FvgRecord).id==='string').slice(-700):[];
  }catch{return []}
}
export function exportFvgJournal(symbol:string,records:FvgRecord[]){
  const blob=new Blob([JSON.stringify({
    source:'ASCEND FVG RESEARCH',exchange:'BYBIT',symbol,
    exportedAt:new Date().toISOString(),
    scope:'browser-observed historical candle replay; not validated trade records',
    records
  },null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const link=document.createElement('a');link.href=url;
  link.download='ASCEND_FVG_'+symbol+'_'+new Date().toISOString().slice(0,10)+'.json';
  link.click();window.setTimeout(()=>URL.revokeObjectURL(url),1200);
}
/**
 * Closed candle snapshots from Bybit, per selected FVG timeframe.
 * Cached journal is browser-local, NOT server-side and NOT an audit-grade feed.
 */
export function useFvgResearch(
  symbol:string,chartTf:string,chartCandles:Candle[],
  enabledTimeframes:Record<FvgTf,boolean>,
  settings:EngineSettings,
  previousDay?:PreviousDayLevels,
  previousSessions?:PreviousSessionLevels
){
  const[external,setExternal]=useState<{symbol:string;bars:Partial<Record<FvgTf,Candle[]>>;
    errors:Partial<Record<FvgTf,string>>}>({symbol:'',bars:{},errors:{}});
  const[journal,setJournal]=useState<{symbol:string;records:FvgRecord[]}>(
    ()=>({symbol,records:readJournal(symbol)}));

  const enabledKeys=FVG_TIMEFRAMES.filter(tf=>enabledTimeframes[tf]);
  const joined=enabledKeys.join(',');
  useEffect(()=>{
    setJournal({symbol,records:readJournal(symbol)});
  },[symbol]);

  useEffect(()=>{
    const active=enabledKeys.filter(tf=>tf!==chartTf);
    const controller=new AbortController();
    let timer:number|undefined;
    let alive=true;
    if(!active.length){
      setExternal({symbol,bars:{},errors:{}});
      return()=>controller.abort();
    }
    const load=async()=>{
      const batches=await Promise.all(active.map(async(tf)=>{
        try{
          const query=new URLSearchParams({category:'linear',symbol,
            interval:String(FVG_TF_MS[tf]/60000),limit:String(MAX_CANDLES)});
          const res=await fetch('/market-api/v5/market/kline?'+query,{
            signal:controller.signal,cache:'no-store'});
          if(!res.ok)throw Error('HTTP '+res.status);
          const body=await res.json();
          if(body.retCode!==0||!Array.isArray(body.result?.list))
            throw Error(String(body.retMsg??'Invalid candle history'));
          const bars=candlesFromBybit(body.result.list);
          if(bars.length<30)throw Error('Insufficient candles');
          return {tf,bars,error:null};
        }catch(err){
          return {tf,bars:null,error:String((err as Error).message??err)};
        }
      }));
      if(!alive)return;
      const bars:Partial<Record<FvgTf,Candle[]>>={},errors:Partial<Record<FvgTf,string>>={};
      for(const result of batches){
        if(result.bars)bars[result.tf]=result.bars;
        if(result.error)errors[result.tf]=result.error;
      }
      setExternal({symbol,bars,errors});
    };
    void load();
    timer=window.setInterval(()=>{
      if(document.visibilityState==='visible')void load();
    },90000);
    return()=>{alive=false;controller.abort();if(timer!==undefined)window.clearInterval(timer)};
  // joined is a canonical representation of the enabled TF set
  },[symbol,chartTf,joined]);

  const engineContextBars=chartTf==='15m'?chartCandles:
    external.symbol===symbol?external.bars['15m']:undefined;
  // Reuse legacy level/event calculations as READ-ONLY research context.
  // No chart signal, order route, or Core decision consumes this return value.
  const legacyContext=useMemo(()=>{
    if(!engineContextBars||engineContextBars.length<192)
      return {levels:[] as FvgContextLevel[],observations:[] as FvgObservation[]};
    try{
      const state=deriveLiveMarketContext(symbol,engineContextBars,
        engineContextBars,[],Date.now());
      const levels=state.levels.filter(l=>l.status==='FROZEN')
        .map(l=>({id:l.id,price:l.price,availableFrom:l.availableFrom,
          status:'FROZEN' as const}));
      const observations=state.chronology
        .filter(e=>['SWEEP','RECLAIM','ACCEPT','BREAK'].includes(e.type))
        .map(e=>({type:e.type,level:e.level,at:e.timestamp+900000,
          source:'LEGACY_ENGINE_RESEARCH' as const}));
      return {levels,observations};
    }catch{
      return {levels:[] as FvgContextLevel[],observations:[] as FvgObservation[]};
    }
  },[symbol,engineContextBars]);
  const relevantLevels=useMemo(()=>{
    const levels:FvgContextLevel[]=[];
    if(previousDay?.symbol===symbol){
      // Yesterday's high/low became known after that UTC day had closed.
      const knownAt=previousDay.dayStartUtc+86400000;
      levels.push({id:'YH',price:previousDay.high,availableFrom:knownAt,status:'FROZEN'});
      levels.push({id:'YL',price:previousDay.low,availableFrom:knownAt,status:'FROZEN'});
    }
    if(previousSessions?.symbol===symbol){
      for(const session of previousSessions.sessions){
        levels.push({id:session.id+' H',price:session.high,
          availableFrom:previousSessions.dayStartUtc+session.to*3600000,status:'FROZEN'});
        levels.push({id:session.id+' L',price:session.low,
          availableFrom:previousSessions.dayStartUtc+session.to*3600000,status:'FROZEN'});
      }
    }
    for(const l of legacyContext.levels){
      // Never let a live, still-developing range rewrite older FVG context.
      if(!levels.some(existing=>existing.id===l.id))levels.push(l);
    }
    return levels;
  },[previousDay,previousSessions,symbol,legacyContext]);
  const records=useMemo(()=>{
    const all:FvgRecord[]=[];
    for(const tf of enabledKeys){
      const bars=tf===chartTf?chartCandles:external.symbol===symbol?external.bars[tf]:undefined;
      if(!bars?.length)continue;
      all.push(...computeFvgContext(bars,symbol,tf,settings,relevantLevels,
        Date.now(),legacyContext.observations));
    }
    return all.sort((a,b)=>a.formedAt-b.formedAt);
  },[symbol,chartTf,chartCandles,external,joined,settings,relevantLevels,legacyContext]);

  // Merge stable zone IDs and deduplicated candle-observation events.
  // Journal is maintained even if FVG drawing is turned OFF; closing the
  // browser stops collection. No fake order outcomes are ever populated.
  useEffect(()=>{
    if(!records.length)return;
    setJournal(previous=>{
      if(previous.symbol!==symbol)return previous;
      const byId=new Map(previous.records.map(z=>[z.id,z]));
      let changed=false;
      for(const z of records){
        const old=byId.get(z.id);
        if(!old){
          byId.set(z.id,z);changed=true;continue;
        }
        const historical=old.events??[];
        const fresh=z.events??[];
        const events=new Map(historical.map(e=>[e.id,e]));
        for(const event of fresh)events.set(event.id,event);
        const mergedEvents=[...events.values()].sort((a,b)=>a.at-b.at||a.id.localeCompare(b.id));
        const newer=z.formedAt<=old.formedAt?
          {...z,events:mergedEvents,
            maxFillPct:Math.max(z.maxFillPct,old.maxFillPct),
            firstTouchAt:z.firstTouchAt??old.firstTouchAt,
            visits:Math.max(z.visits,old.visits),
            milestones:{...old.milestones,...z.milestones}}:
          {...old,events:mergedEvents};
        if(JSON.stringify(newer)!==JSON.stringify(old)){byId.set(z.id,newer);changed=true}
      }
      if(!changed)return previous;
      return {symbol,records:[...byId.values()]
        .sort((a,b)=>a.formedAt-b.formedAt).slice(-700)};
    });
  },[symbol,records]);

  useEffect(()=>{
    if(journal.symbol!==symbol)return;
    try{window.localStorage.setItem(JOURNAL_PREFIX+symbol,JSON.stringify(journal.records))}
    catch{/* browser storage may be full or disabled */}
  },[symbol,journal]);
  return {
    zones:records,
    journal:journal.symbol===symbol?journal.records:[],
    errors:external.symbol===symbol?external.errors:{},
    loadedTimeframes:enabledKeys.filter(tf=>tf===chartTf?
      chartCandles.length>0:external.symbol===symbol&&!!external.bars[tf])
  };
}
