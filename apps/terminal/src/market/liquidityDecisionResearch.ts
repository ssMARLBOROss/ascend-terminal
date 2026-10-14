import type {Candle} from '@ascend/contracts';
import type {PreviousDayLevels} from './usePreviousDayLevels';
import type {StructureReport,StructureDirection,StructureStep} from './ascendStructureResearch';

const M=60000,H=3600000,D=86400000;
export type LevelState='FROZEN'|'LIVE';
export type LiquidityLevel={
  id:'YH'|'YL'|'ONH'|'ONL'|'RTHH'|'RTHL'|'IBH'|'IBL';
  price:number;side:'UPPER'|'LOWER';state:LevelState;availableFrom:number;
  description:string;
};
export type LiquidityWall={
  id:'BSL'|'SSL';anchor:LiquidityLevel;low:number;high:number;
  distancePct:number;atr5m?:number;
};
export type MarketLiquidity={levels:LiquidityLevel[];bsl?:LiquidityWall;ssl?:LiquidityWall;
  atr5m?:number;asOf:number;reason?:string};
export type TFState='OK'|'WAIT'|'NODATA'|'BLOCKED';
export type TFCheck={tf:'30m'|'15m'|'10m'|'5m'|'3m'|'1m';label:string;
  state:TFState;direction?:StructureDirection;at?:number;why:string};
export type DecisionStatus='WAIT'|'SKIP'|'ENTRY READY';
export type ResearchDecision={
  symbol:string;asOf:number;status:DecisionStatus;
  phase:StructureReport['phase'];direction?:StructureDirection;
  checks:TFCheck[];reasons:string[];entry?:number;sl?:number;tp?:number;
  rr?:number;stopDistancePct?:number;targetDistancePct?:number;
  targetLevel?:string;isResearch:true;
};
export type DecisionRecord={
  id:string;symbol:string;at:number;status:DecisionStatus;
  phase:string;direction?:StructureDirection;entry?:number;sl?:number;tp?:number;
  rr?:number;reason:string;
};

// Conservative fixed-timeframe aggregation: partial/irregular higher timeframe
// bars are excluded. The source is a complete, sorted CLOSED 1m research feed.
export function aggregateClosed(bars:Candle[],minutes:number):Candle[]{
  if(!Number.isInteger(minutes)||minutes<1)return [];
  const duration=minutes*M,groups=new Map<number,Candle[]>();
  for(const b of bars){
    const bucket=Math.floor(b.timestamp/duration)*duration;
    const rows=groups.get(bucket)??[];rows.push(b);groups.set(bucket,rows);
  }
  const output:Candle[]=[];
  for(const [timestamp,raw] of [...groups].sort((a,b)=>a[0]-b[0])){
    const rows=raw.sort((a,b)=>a.timestamp-b.timestamp);
    if(rows.length!==minutes||rows.some((b,i)=>b.timestamp!==timestamp+i*M))continue;
    output.push({timestamp,open:rows[0].open,high:Math.max(...rows.map(x=>x.high)),
      low:Math.min(...rows.map(x=>x.low)),close:rows[rows.length-1].close,
      volume:rows.reduce((v,x)=>v+x.volume,0)});
  }
  return output;
}
const nyClock=new Intl.DateTimeFormat('en-US',{
  timeZone:'America/New_York',hour:'2-digit',minute:'2-digit',
  year:'numeric',month:'2-digit',day:'2-digit',hourCycle:'h23'
});
function newYorkParts(at:number){
  const p=Object.fromEntries(nyClock.formatToParts(new Date(at))
    .filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
  return {day:p.year+'-'+p.month+'-'+p.day,
    minute:Number(p.hour)*60+Number(p.minute)};
}
function hasContinuousMinutes(bars:Candle[]):boolean{
  return bars.every((b,i)=>i===0||b.timestamp===bars[i-1].timestamp+M);
}
function makeSessionRange(bars:Candle[],asOf:number,from:number,to:number,
  freezeAt:number,day:string):{high:number;low:number;state:LevelState;availableFrom:number}|undefined{
  const found=bars.filter(b=>{
    const ny=newYorkParts(b.timestamp);
    return ny.day===day&&ny.minute>=from&&ny.minute<to;
  });
  if(!found.length||!hasContinuousMinutes(found))return undefined;
  if(newYorkParts(found[0].timestamp).minute!==from)return undefined;
  const last=found[found.length-1],lastMinute=newYorkParts(last.timestamp).minute;
  const isFrozen=lastMinute>=freezeAt-1;
  return {high:Math.max(...found.map(x=>x.high)),low:Math.min(...found.map(x=>x.low)),
    state:isFrozen?'FROZEN':'LIVE',availableFrom:isFrozen?last.timestamp+M:asOf};
}
function atr5(bars:Candle[]):number|undefined{
  const five=aggregateClosed(bars,5);
  if(five.length<15)return undefined;
  const recent=five.slice(-15),tr:number[]=[];
  for(let i=1;i<recent.length;i++){
    const c=recent[i],prev=recent[i-1].close;
    tr.push(Math.max(c.high-c.low,Math.abs(c.high-prev),Math.abs(c.low-prev)));
  }
  return tr.reduce((a,b)=>a+b,0)/tr.length;
}

/** RTH/IB refer ONLY to the US stock cash session (America/New_York, DST-aware).
 * For crypto they are explicitly comparison benchmarks, not exchange closes.
 * LIVE ranges never count as FROZEN liquidity targets.
 */
export function buildMarketLiquidity(args:{
  symbol:string;bars:Candle[];asOf:number;previousDay?:PreviousDayLevels;
  onh?:number;onl?:number;
}):MarketLiquidity{
  const {symbol,asOf,previousDay,onh,onl}=args;
  const dayStart=Math.floor(asOf/D)*D;
  const bars=args.bars.filter(b=>b.timestamp>=dayStart&&b.timestamp+M<=asOf)
    .sort((a,b)=>a.timestamp-b.timestamp);
  const levels:LiquidityLevel[]=[];
  const push=(id:LiquidityLevel['id'],price:number,side:LiquidityLevel['side'],
    state:LevelState,availableFrom:number,description:string)=>{
    if(Number.isFinite(price)&&price>0)
      levels.push({id,price,side,state,availableFrom,description});
  };
  if(previousDay?.symbol===symbol&&previousDay.dayStartUtc+D===dayStart){
    push('YH',previousDay.high,'UPPER','FROZEN',dayStart,'Максимум предыдущих UTC-суток');
    push('YL',previousDay.low,'LOWER','FROZEN',dayStart,'Минимум предыдущих UTC-суток');
  }
  if(asOf>=dayStart+6*H){
    if(onh!==undefined)push('ONH',onh,'UPPER','FROZEN',dayStart+6*H,'Overnight 00:00–06:00 UTC');
    if(onl!==undefined)push('ONL',onl,'LOWER','FROZEN',dayStart+6*H,'Overnight 00:00–06:00 UTC');
  }
  // 09:30–16:00 NY local cash reference, IB first 60 minutes (09:30–10:30).
  const todayNy=newYorkParts(asOf-1).day;
  const rth=makeSessionRange(bars,asOf,570,960,960,todayNy);
  const ib=makeSessionRange(bars,asOf,570,630,630,todayNy);
  if(rth){
    push('RTHH',rth.high,'UPPER',rth.state,rth.availableFrom,'NY cash RTH High · 09:30–16:00 ET');
    push('RTHL',rth.low,'LOWER',rth.state,rth.availableFrom,'NY cash RTH Low · 09:30–16:00 ET');
  }
  if(ib){
    push('IBH',ib.high,'UPPER',ib.state,ib.availableFrom,'NY cash Initial Balance High · 09:30–10:30 ET');
    push('IBL',ib.low,'LOWER',ib.state,ib.availableFrom,'NY cash Initial Balance Low · 09:30–10:30 ET');
  }
  const last=bars.at(-1);
  const atr=atr5(bars);
  if(!last)return {levels,asOf,reason:'Нет закрытых 1m свечей'};
  const frozen=levels.filter(x=>x.state==='FROZEN');
  const width=atr!==undefined?atr*.30:undefined;
  const upper=frozen.filter(x=>x.side==='UPPER'&&x.price>last.close)
    .sort((a,b)=>a.price-b.price)[0];
  const lower=frozen.filter(x=>x.side==='LOWER'&&x.price<last.close)
    .sort((a,b)=>b.price-a.price)[0];
  const wall=(id:'BSL'|'SSL',anchor:LiquidityLevel):LiquidityWall=>{
    const w=width??0;
    return {id,anchor,
      low:id==='BSL'?anchor.price:anchor.price-w,
      high:id==='BSL'?anchor.price+w:anchor.price,
      distancePct:Math.abs(anchor.price/last.close-1)*100,atr5m:atr};
  };
  return {levels,bsl:upper?wall('BSL',upper):undefined,
    ssl:lower?wall('SSL',lower):undefined,atr5m:atr,asOf};
}
function structureBias(bars:Candle[]):{direction?:StructureDirection;at?:number;why:string}{
  if(bars.length<3)return {why:'Нужны минимум три полные свечи TF'};
  const [a,b,c]=bars.slice(-3);
  const at=c.timestamp+(c.timestamp-b.timestamp);
  if(c.high>b.high&&b.high>a.high&&c.low>b.low&&b.low>a.low&&c.close>b.close)
    return {direction:'LONG',at,why:'HH/HL подтверждены закрытыми свечами'};
  if(c.high<b.high&&b.high<a.high&&c.low<b.low&&b.low<a.low&&c.close<b.close)
    return {direction:'SHORT',at,why:'LH/LL подтверждены закрытыми свечами'};
  return {at,why:'Нет последовательной структуры HH/HL или LH/LL'};
}
function stepCheck(tf:TFCheck['tf'],label:string,step:StructureStep):TFCheck{
  return {tf,label,state:step.status,direction:undefined,at:step.at,why:step.detail};
}
/** No look-ahead, no order routing. This is a second conservative RESEARCH gate
 * on top of the existing Structure Engine, which retains its own thresholds.
 */
export function buildDecisionResearch(args:{
  symbol:string;bars:Candle[];report?:StructureReport;liquidity:MarketLiquidity;
  now:number;freshAt?:number
}):ResearchDecision{
  const {symbol,bars,report,liquidity,now,freshAt}=args;
  const asOf=report?.asOf??0;
  const checks:TFCheck[]=[];
  const direction=report?.direction;
  const recentBars=bars.filter(x=>x.timestamp+M<=asOf);
  const checkHTF=(tf:'30m'|'15m',minutes:number):TFCheck=>{
    const data=aggregateClosed(recentBars,minutes);
    const picked=tf==='15m'?data.filter(x=>{
      const hour=new Date(x.timestamp).getUTCHours();
      // Require three completed 15m candles after latest active UTC session open.
      const active=[{from:0,to:8},{from:7,to:16},{from:13,to:22}]
        .filter(s=>{const nowH=new Date(asOf-1).getUTCHours();
          return nowH>=s.from&&nowH<s.to});
      const start=active.length?Math.max(...active.map(s=>s.from)):-1;
      return start>=0&&hour>=start;
    }):data;
    const bias=structureBias(picked);
    const status:TFState=!bias.at?'NODATA':
      !bias.direction?'WAIT':direction&&bias.direction!==direction?'BLOCKED':'OK';
    return {tf,label:tf==='30m'?'Старший контекст 30m':'Направление активной сессии 15m',
      state:status,direction:bias.direction,at:bias.at,why:bias.why};
  };
  checks.push(checkHTF('30m',30),checkHTF('15m',15));
  if(report){
    checks.push(stepCheck('10m','CHOCH / переход',report.steps.choch),
      stepCheck('5m','MSS / BOS',report.steps.bos),
      stepCheck('3m','Retest',report.steps.retest),
      stepCheck('1m','Micro-BOS',report.steps.micro));
  }else{
    for(const [tf,label] of [['10m','CHOCH'],['5m','MSS'],['3m','Retest'],['1m','Micro-BOS']] as const)
      checks.push({tf,label,state:'NODATA',why:'Нет достоверного отчёта Structure Engine'});
  }
  const reasons:string[]=[];
  if(!report||report.symbol!==symbol||!asOf||!freshAt||
    now-freshAt>130000||now-asOf>180000||asOf>now+2000)
    reasons.push('Неполные или устаревшие подтверждения Structure Engine');
  if(!direction)reasons.push('Не определено направление после sweep/reclaim');
  for(const step of checks){
    if(step.state!=='OK')reasons.push(step.tf+': '+step.why);
  }
  if(report?.steps.session.status!=='OK')reasons.push(report?.steps.session.detail??'Сессия не подтверждена');
  if(report?.steps.entry.status!=='OK')reasons.push(report?.steps.entry.detail??'Нет подтверждённого базового плана');
  let entry=report?.entry,sl=report?.sl,tp: number|undefined,rr:number|undefined;
  let targetLevel:string|undefined;
  if(direction&&entry!==undefined&&sl!==undefined&&
    (direction==='LONG'?sl<entry:sl>entry)){
    const known=liquidity.levels.filter(x=>x.state==='FROZEN'&&x.availableFrom<=asOf&&
      (direction==='LONG'?x.price>entry:x.price<entry))
      .sort((a,b)=>direction==='LONG'?a.price-b.price:b.price-a.price);
    if(known.length){tp=known[0].price;targetLevel=known[0].id;
      rr=Math.abs(tp-entry)/Math.abs(entry-sl);
      if(rr<2)reasons.push('R:R '+rr.toFixed(2)+' < 2.00 до ближайшей FROZEN ликвидности');
    }else reasons.push('Нет следующей известной FROZEN цели ликвидности');
  }else{
    entry=undefined;sl=undefined;
    reasons.push('Невозможно рассчитать структурный SL');
  }
  if(report?.phase!=='ENTRY READY')reasons.push('Базовый Structure Engine ещё не подтвердил ENTRY READY');
  const unique=[...new Set(reasons)];
  const blocked=checks.some(x=>x.state==='BLOCKED')||
    rr!==undefined&&rr<2;
  const status:DecisionStatus=unique.length===0?'ENTRY READY':blocked?'SKIP':'WAIT';
  return {symbol,asOf,status,phase:report?.phase??'WATCH',direction,
    checks,reasons:unique,entry,sl,tp,rr,targetLevel,
    stopDistancePct:entry&&sl?Math.abs(entry-sl)/entry*100:undefined,
    targetDistancePct:entry&&tp?Math.abs(entry-tp)/entry*100:undefined,isResearch:true};
}
export function appendDecisionRecord(records:DecisionRecord[],decision:ResearchDecision):DecisionRecord[]{
  if(!decision.asOf)return records;
  const last=records.at(-1);
  // Only state transitions. Each price tick must NOT become a new trade.
  const signature=decision.status+'|'+decision.phase+'|'+(decision.direction??'—')+
    '|'+decision.reasons[0];
  if(last&&last.symbol===decision.symbol&&last.reason===signature)return records;
  const item:DecisionRecord={id:decision.symbol+':'+decision.asOf+':'+decision.status,
    symbol:decision.symbol,at:decision.asOf,status:decision.status,
    phase:decision.phase,direction:decision.direction,entry:decision.entry,
    sl:decision.sl,tp:decision.tp,rr:decision.rr,reason:signature};
  return [...records,item].slice(-100);
}
