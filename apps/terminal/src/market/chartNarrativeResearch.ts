import type {Candle} from '@ascend/contracts';
import type {TrendStructureSnapshot} from './trendStructureResearch';
import {aggregateClosed,type ResearchDecision} from './liquidityDecisionResearch';

const MINUTE=60000,DAY=86400000,HOUR=3600000;
const WINDOWS=[
  {id:'ASIA',name:'Азия',from:0,to:8},
  {id:'LONDON',name:'Лондон',from:7,to:16},
  {id:'NEW_YORK',name:'Нью-Йорк',from:13,to:22}
] as const;

export type SessionPriceContext={
  id:string;name:string;overlap?:string;phase:'ОТКРЫТИЕ'|'ПЕРЕСЕЧЕНИЕ'|'АКТИВНА'|'ЗАВЕРШЕНИЕ';
  openAt:number;open:number;high:number;low:number;close:number;
  changePct:number;observedAt:number;
};
export type ChartRiskMark={kind:'ENTRY'|'SL'|'TP';price:number;label:string};
export type ChartNarrative={
  asOf:number;valid:boolean;headline:string;trend:string;setup:string;status:string;
  warning:string;session?:SessionPriceContext;
  swingHigh?:number;swingLow?:number;impulse?:string;impulseDirection?:'LONG'|'SHORT';
  marks:ChartRiskMark[];ready:boolean;rr?:number;reason?:string;
};

/** Read-only chart interpretation of existing CORE/MTF evidence.
 * A change of session is context (price vs its open), NOT causation or a trade signal.
 * Only continuous closed 1m bars and fresh upstream timestamps are accepted.
 */
export function buildChartNarrative(args:{
  symbol:string;bars:Candle[];trend:TrendStructureSnapshot;decision:ResearchDecision;
  now:number;freshAt?:number
}):ChartNarrative{
  const {symbol,trend,decision,now,freshAt}=args;
  const asOf=Math.min(trend.asOf,decision.asOf);
  const expired=!asOf||asOf>now+2000||now-asOf>180000||
    !freshAt||now-freshAt>130000||trend.symbol!==symbol||decision.symbol!==symbol;
  const defaultView:ChartNarrative={asOf,valid:false,headline:'ДАННЫХ НЕДОСТАТОЧНО',
    trend:'30m/15m · ОЖИДАНИЕ',setup:'НЕ ПОДТВЕРЖДЁН',
    status:'WAIT',warning:'Ожидаем свежую закрытую минуту и расчёты структуры',
    marks:[],ready:false};
  if(expired)return defaultView;
  const dayStart=Math.floor((asOf-1)/DAY)*DAY;
  const bars=args.bars.filter(b=>b.timestamp>=dayStart&&b.timestamp+MINUTE<=asOf)
    .sort((a,b)=>a.timestamp-b.timestamp);
  if(!bars.length)return defaultView;
  const last=bars.at(-1)!;
  const ctxTime=asOf-1;
  const elapsed=(ctxTime-dayStart)/HOUR;
  const active=WINDOWS.filter(w=>elapsed>=w.from&&elapsed<w.to);
  const latest=active.at(-1);
  let session:SessionPriceContext|undefined;
  if(latest){
    const sessionStart=dayStart+latest.from*HOUR;
    const points=bars.filter(b=>b.timestamp>=sessionStart);
    const continuous=points.length>0&&points[0].timestamp===sessionStart&&
      points.every((b,i)=>i===0||b.timestamp===points[i-1].timestamp+MINUTE);
    if(continuous){
      const open=points[0].open,close=points.at(-1)!.close;
      const age=(asOf-sessionStart)/MINUTE;
      const remaining=(latest.to*HOUR-(asOf-dayStart))/MINUTE;
      session={id:latest.id,name:latest.name,openAt:sessionStart,open,
        high:Math.max(...points.map(b=>b.high)),low:Math.min(...points.map(b=>b.low)),
        close,changePct:open>0?(close/open-1)*100:0,observedAt:asOf,
        overlap:active.length>1?active.map(w=>w.name).join(' + '):undefined,
        phase:active.length>1?'ПЕРЕСЕЧЕНИЕ':
          age<=20?'ОТКРЫТИЕ':remaining<=20?'ЗАВЕРШЕНИЕ':'АКТИВНА'};
    }
  }
  const lastSix=aggregateClosed(bars,5).slice(-6);
  const validSix=lastSix.length===6&&lastSix.every((b,i)=>
    i===0||b.timestamp===lastSix[i-1].timestamp+5*MINUTE);
  const impulsePct=validSix&&lastSix[0].open>0?
    (lastSix.at(-1)!.close/lastSix[0].open-1)*100:undefined;
  const impulseDirection=impulsePct!==undefined&&impulsePct>=1?'LONG':
    impulsePct!==undefined&&impulsePct<=-1?'SHORT':undefined;
  const impulse=impulsePct===undefined?'5m / 30 мин: недостаточно данных':
    '5m / 30 мин: '+(impulsePct>=0?'+':'')+impulsePct.toFixed(2)+'%'+
    (impulseDirection==='LONG'?' · ИМПУЛЬС ВВЕРХ':
      impulseDirection==='SHORT'?' · ИМПУЛЬС ВНИЗ':' · БЕЗ СИЛЬНОГО ИМПУЛЬСА');
  const htf=trend.alignment;
  const headline=htf==='LONG'?'ВОСХОДЯЩИЙ ТРЕНД':
    htf==='SHORT'?'НИСХОДЯЩИЙ ТРЕНД':
    htf==='CONFLICT'?'КОНФЛИКТ 30m / 15m':'ТРЕНД НЕ ПОДТВЕРЖДЁН';
  const setup=decision.direction??trend.setupDirection??'НЕ СФОРМИРОВАН';
  const against=(htf==='LONG'&&setup==='SHORT')||
    (htf==='SHORT'&&setup==='LONG');
  const status=decision.status;
  const impulseConflict=impulseDirection!==undefined&&setup===
    (impulseDirection==='LONG'?'SHORT':'LONG');
  const warning=against?'СЕТАП ПРОТИВ 30m/15m ТРЕНДА · ждать слома структуры':
    impulseConflict?'СЕТАП ПРОТИВ 5m ИМПУЛЬСА · ждём подтверждения слома':
    decision.status==='SKIP'?'Риск / структура запрещают вход':
    decision.status==='WAIT'?decision.reasons[0]??'Не хватает подтверждения CORE':
    'Исследовательский план подтверждён, ордер не открыт';
  const fifteen=trend.rows.find(x=>x.tf==='15m');
  const ready=decision.status==='ENTRY READY'&&
    decision.entry!==undefined&&decision.sl!==undefined&&decision.tp!==undefined&&
    decision.rr!==undefined&&Number.isFinite(decision.rr)&&decision.rr>=2;
  const marks:ChartRiskMark[]=ready?[
    {kind:'ENTRY',price:decision.entry!,label:'ENTRY · RESEARCH'},
    {kind:'SL',price:decision.sl!,label:'SL · STRUCTURE'},
    {kind:'TP',price:decision.tp!,label:'TP · '+(decision.targetLevel??'FROZEN')}
  ]:[];
  return {asOf,valid:true,headline,trend:htf,setup:String(setup),
    status,warning,session,impulse,impulseDirection,swingHigh:fifteen?.recentHigh?.price,
    swingLow:fifteen?.recentLow?.price,
    marks,rr:ready?decision.rr:undefined,ready};
}
