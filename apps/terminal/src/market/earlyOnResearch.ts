import type {Candle} from '@ascend/contracts';
import {FIVE,type RadarObservation,type RadarDirection} from './radarEngine';

export type EarlyOnStatus='NONE'|'EARLY WATCH'|'EARLY CANDIDATE'|'EARLY SKIP'|'EXPIRED';
export type EarlyOnResearch={
  status:EarlyOnStatus;direction:RadarDirection;reason:string;
  level?:'ONH'|'ONL';levelPrice?:number;
  sweepAt?:number;reclaimAt?:number;reactionAt?:number;asOf?:number;
  indicativeEntry?:number;structuralSl?:number;target?:number;
  rr?:number;riskPct?:number;targetPct?:number;
  volumeRatio?:number;
  /** Important: only a CLOSED 5m research observation, NOT executable ENTRY READY. */
  isResearch:true;
};
const MAX_AGE=30*60000;
const SIGNAL_AGE=10*60000;
const VOL_MULT=1.8;
const RR_MIN=2;
const ATR_BUFFER=.15;

const result=(status:EarlyOnStatus,direction:RadarDirection,reason:string,
  extra:Partial<EarlyOnResearch>={}):EarlyOnResearch=>({
  status,direction,reason,isResearch:true,...extra
});
function atr14(bars:Candle[]):number|undefined{
  if(bars.length<15)return undefined;
  const recent=bars.slice(-15),ranges:number[]=[];
  for(let i=1;i<recent.length;i++){
    const current=recent[i],lastClose=recent[i-1].close;
    ranges.push(Math.max(current.high-current.low,
      Math.abs(current.high-lastClose),Math.abs(current.low-lastClose)));
  }
  return ranges.reduce((sum,v)=>sum+v,0)/14;
}
/** Research-only 5m early reversal AFTER a historically frozen ONH/ONL sweep.
 * Does NOT infer 1m micro-BOS, 30m bias, order flow, intrabar wick ordering
 * or any exchange fills. Checks the initial 5m reclaim, volume spike, later
 * separate 5m follow-through, frozen opposite ON target and R:R >= 2.
 * An early candidate is a reason to OPEN the chart for 1m verification.
 */
export function analyzeEarlyOnSetup(
  observation:RadarObservation,bars:Candle[],now:number
):EarlyOnResearch{
  const no=result('NONE','NEUTRAL','Нет действующего подтверждённого ON-сетапа');
  if(observation.integrity!=='COMPLETE'||observation.onState!=='FROZEN'||
    observation.stage==='NO DATA'||observation.stage==='BUILDING'||
    !observation.sweepAt||!observation.levelPrice||
    !observation.onh||!observation.onl)return no;
  const side=observation.onSide;
  if(side!=='ONH'&&side!=='ONL')return no;
  // Post-sweep continuation needs another known target. Never invent one.
  const reverseDir:RadarDirection=side==='ONL'?'LONG':'SHORT';
  const common={level:side,levelPrice:observation.levelPrice,
    sweepAt:observation.sweepAt,asOf:observation.observedAt};
  if(!observation.resolutionAt){
    return result('EARLY WATCH',reverseDir,
      'Снят '+side+' · ожидаем возврат и 5m подтверждение',common);
  }
  if(observation.onEvent==='ACCEPTANCE'){
    return result('EARLY WATCH',observation.direction,
      'ACCEPTANCE: продолжение требует цели за пределами ON диапазона; это не ранний вход',common);
  }
  if(observation.onEvent!=='RECLAIM'||observation.direction!==reverseDir)return no;
  const reclaimAt=observation.resolutionAt;
  const ctx={...common,reclaimAt};
  const age=now-reclaimAt;
  if(age<0||age>MAX_AGE)return result('EXPIRED',reverseDir,
    'Ранний ON-сетап устарел; нужен новый sweep / reclaim',ctx);
  const candles=bars.filter(b=>b.timestamp+FIVE<=now)
    .sort((a,b)=>a.timestamp-b.timestamp);
  const sweepIndex=candles.findIndex(b=>b.timestamp+FIVE===observation.sweepAt);
  const reclaimIndex=candles.findIndex(b=>b.timestamp+FIVE===reclaimAt);
  if(sweepIndex<20||reclaimIndex<sweepIndex)return result('NONE','NEUTRAL',
    'Недостаточно закрытых свечей до ON sweep');
  const before=candles.slice(sweepIndex-20,sweepIndex);
  const avg=before.reduce((sum,b)=>sum+b.volume,0)/before.length;
  const swept=candles[sweepIndex];
  const ratio=avg>0?swept.volume/avg:0;
  const atr=atr14(candles.slice(0,reclaimIndex+1));
  if(!atr||!Number.isFinite(atr))return result('EARLY WATCH',reverseDir,
    'ATR5m недоступен · риск ещё нельзя оценить',ctx);
  const latest=candles.at(-1)!;
  const after=candles.slice(reclaimIndex+1);
  const invalid=after.some(b=>side==='ONL'?
    b.close<observation.onl!||b.low<swept.low:
    b.close>observation.onh!||b.high>swept.high);
  if(invalid)return result('EARLY SKIP',reverseDir,
    'Возврат отменён: цена снова нарушила ON-уровень или экстремум снятия',ctx);
  if(ratio<VOL_MULT)return result('EARLY WATCH',reverseDir,
    'Возврат без аномального объёма на sweep: '+ratio.toFixed(2)+'× (порог 1,8×)',
    {...ctx,volumeRatio:ratio});
  const directional=(b:Candle,prev:Candle)=>side==='ONL'?
    b.close>b.open&&b.close>prev.close&&b.close>observation.onl!:
    b.close<b.open&&b.close<prev.close&&b.close<observation.onh!;
  const reaction=after.find((b,i)=>{
    const closed=b.timestamp+FIVE;
    return closed<=reclaimAt+15*60000&&
      directional(b,i===0?candles[reclaimIndex]:after[i-1]);
  });
  if(!reaction)return result('EARLY WATCH',reverseDir,
    'Sweep и reclaim есть; ждём отдельную закрытую 5m свечу реакции',{
      ...ctx,volumeRatio:ratio});
  const reactionAt=reaction.timestamp+FIVE;
  const evidence={...ctx,reactionAt,volumeRatio:ratio};
  if(now-reactionAt>SIGNAL_AGE||age>MAX_AGE)
    return result('EXPIRED',reverseDir,
      '5m реакция старше 10 минут, ранний вход уже неактуален',evidence);
  // Entry is a 5m close observed NOW (not a real order execution).
  const entry=latest.close;
  const stop=side==='ONL'?
    Math.min(...candles.slice(sweepIndex).map(b=>b.low))-atr*ATR_BUFFER:
    Math.max(...candles.slice(sweepIndex).map(b=>b.high))+atr*ATR_BUFFER;
  const target=side==='ONL'?observation.onh:observation.onl;
  const risk=side==='ONL'?entry-stop:stop-entry;
  const reward=side==='ONL'?target-entry:entry-target;
  const rr=risk>0?reward/risk:undefined;
  const plan={...evidence,indicativeEntry:entry,structuralSl:stop,target,
    rr,riskPct:risk/entry*100,targetPct:reward/entry*100};
  if(!Number.isFinite(risk)||risk<=0||!Number.isFinite(reward)||reward<=0||
    rr===undefined||rr<RR_MIN)
    return result('EARLY SKIP',reverseDir,
      'Недостаточно потенциала до противоположной FROZEN ON: R:R < 1:2',plan);
  if(Math.abs(entry-reaction.close)>atr*.75)
    return result('EXPIRED',reverseDir,
      'Цена ушла дальше 0,75 ATR после реакции · не догоняем движение',plan);
  return result('EARLY CANDIDATE',reverseDir,
    '5m ON sweep → reclaim → реакция + объём; ждём 1m trigger на графике',{
      ...plan});
}
