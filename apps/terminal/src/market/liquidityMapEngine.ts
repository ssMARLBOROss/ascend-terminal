import type {Candle} from '@ascend/contracts';
import type {PreviousDayLevels} from './usePreviousDayLevels';

const MINUTE=60000,HOUR=3600000,DAY=86400000;
const FIFTEEN=15*MINUTE;
const FIVE=5*MINUTE;
export type LiquidityKey='YH'|'YL'|'ONH'|'ONL'|'RTH_H'|'RTH_L'|'IBH'|'IBL';
export type LiquiditySide='BSL'|'SSL';
export type LiquidityState='LIVE'|'FROZEN'|'SWEEP'|'RECLAIM'|'ACCEPTANCE';
export type LiquidityEventType='SWEEP'|'RECLAIM'|'ACCEPTANCE';
export type LiquidityEvent={
  key:LiquidityKey;type:LiquidityEventType;at:number;price:number;
  depthPrice?:number;depthPct?:number;
};
export type LiquidityLevel={
  key:LiquidityKey;side:LiquiditySide;price:number;state:LiquidityState;
  zoneLow:number;zoneHigh:number;distancePct:number;
  freezeAt:number;frozen:boolean;
  sweepAt?:number;reclaimAt?:number;acceptanceAt?:number;
  sweepExtreme?:number;depthPrice?:number;depthPct?:number;
};
export type LiquidityMap={
  symbol:string;asOf:number;dayStartUtc:number;
  price:number;atr:number;atrTime:number;
  levels:LiquidityLevel[];upper?:LiquidityLevel;lower?:LiquidityLevel;
  events:LiquidityEvent[];rthOpenUtc:number;rthCloseUtc:number;
  ibCloseUtc:number;overnightCloseUtc:number;
};
type Candidate={key:LiquidityKey;side:LiquiditySide;price:number;freezeAt:number};

/** New York RTH: 09:30–16:00 America/New_York; DST-aware for each UTC day. */
export function nyCashWindow(dayStartUtc:number){
  const atNoon=dayStartUtc+12*HOUR;
  const pieces=new Intl.DateTimeFormat('en-US',{
    timeZone:'America/New_York',hour:'2-digit',hourCycle:'h23'
  }).formatToParts(new Date(atNoon));
  const nyHour=Number(pieces.find(x=>x.type==='hour')?.value);
  if(!Number.isFinite(nyHour))throw Error('NY time zone unavailable');
  const offsetHours=12-nyHour;
  const rthOpenUtc=dayStartUtc+(offsetHours+9.5)*HOUR;
  return {rthOpenUtc,rthCloseUtc:dayStartUtc+(offsetHours+16)*HOUR,
    ibCloseUtc:rthOpenUtc+HOUR};
}
function lastCompleteAtr5m(bars:Candle[],asOf:number):{value:number;at:number}|undefined{
  const groups:Candle[][]=[];
  const by=new Map<number,Candle[]>();
  for(const b of bars){
    if(b.timestamp+MINUTE>asOf)break;
    const at=Math.floor(b.timestamp/FIVE)*FIVE;
    if(!by.has(at))by.set(at,[]);
    by.get(at)!.push(b);
  }
  for(const [at,group] of [...by.entries()].sort((a,b)=>a[0]-b[0])){
    if(group.length!==5||group.some((b,i)=>b.timestamp!==at+i*MINUTE))continue;
    groups.push(group);
  }
  const complete=groups.map(g=>({
    at:g[0].timestamp,open:g[0].open,high:Math.max(...g.map(c=>c.high)),
    low:Math.min(...g.map(c=>c.low)),close:g[4].close
  }));
  const recent=complete.slice(-14);
  if(recent.length!==14||recent.some((b,i)=>i>0&&b.at-recent[i-1].at!==FIVE))
    return undefined;
  const tr=recent.map((b,i)=>{
    const prev=i===0?b.open:recent[i-1].close;
    return Math.max(b.high-b.low,Math.abs(b.high-prev),Math.abs(b.low-prev));
  });
  return {value:tr.reduce((a,b)=>a+b,0)/14,at:recent.at(-1)!.at+FIVE};
}
function extreme(bars:Candle[],start:number,end:number,side:LiquiditySide){
  const selected=bars.filter(b=>b.timestamp>=start&&b.timestamp<end);
  return selected.length?(side==='BSL'?
    Math.max(...selected.map(b=>b.high)):Math.min(...selected.map(b=>b.low))):undefined;
}
function processEvents(candidate:Candidate,bars:Candle[]){
  let state:LiquidityState='FROZEN';
  let sweepAt:number|undefined,reclaimAt:number|undefined,acceptanceAt:number|undefined;
  let sweepExtreme:number|undefined,depthPrice:number|undefined,depthPct:number|undefined;
  let priorClose:number|undefined;
  let consecutiveOutside=0;
  const events:LiquidityEvent[]=[];
  for(const b of bars){
    if(b.timestamp+MINUTE<=candidate.freezeAt)continue;
    const upper=candidate.side==='BSL',level=candidate.price;
    const beyond=upper?b.high>level:b.low<level;
    const crossed=upper?(priorClose===undefined||priorClose<=level):
      (priorClose===undefined||priorClose>=level);
    const at=b.timestamp+MINUTE;
    if(beyond&&crossed){
      state='SWEEP';sweepAt=at;reclaimAt=undefined;acceptanceAt=undefined;
      sweepExtreme=upper?b.high:b.low;
      consecutiveOutside=0;
      const depth=Math.abs(sweepExtreme-level);
      depthPrice=depth;depthPct=depth/level*100;
      events.push({key:candidate.key,type:'SWEEP',at,price:level,
        depthPrice:depth,depthPct:depthPct});
    }
    if(sweepAt!==undefined){
      const wick=upper?b.high:b.low;
      if(upper?wick>sweepExtreme!:wick<sweepExtreme!){
        sweepExtreme=wick;
        depthPrice=Math.abs(wick-level);depthPct=depthPrice/level*100;
      }
      const outside=upper?b.close>level:b.close<level;
      if(outside){
        consecutiveOutside++;
        if(consecutiveOutside>=2&&acceptanceAt===undefined){
          acceptanceAt=at;state='ACCEPTANCE';
          events.push({key:candidate.key,type:'ACCEPTANCE',at,price:level});
        }
      }else{
        consecutiveOutside=0;
        if(state!=='RECLAIM'){
          reclaimAt=at;state='RECLAIM';
          events.push({key:candidate.key,type:'RECLAIM',at,price:level});
        }
      }
    }
    priorClose=b.close;
  }
  // Record the FINAL depth for the latest sweep, not merely the first wick.
  const latestSweep=[...events].reverse().find(x=>x.type==='SWEEP');
  if(latestSweep){latestSweep.depthPrice=depthPrice;latestSweep.depthPct=depthPct}
  return {state,sweepAt,reclaimAt,acceptanceAt,sweepExtreme,depthPrice,depthPct,events};
}

/** Strict closed-1m research snapshot. No inferred order-book or stop quantities. */
export function computeLiquidityMap(input:{
  symbol:string;bars:Candle[];asOf:number;previousDay?:PreviousDayLevels;
  atrFactor?:number
}):LiquidityMap|undefined{
  const {symbol,asOf,previousDay}=input;
  const dayStartUtc=Math.floor(asOf/DAY)*DAY;
  const bars=input.bars.filter(c=>c.timestamp>=dayStartUtc&&c.timestamp+MINUTE<=asOf);
  if(bars.length<14||bars.some((b,i)=>b.timestamp!==dayStartUtc+i*MINUTE||
    ![b.open,b.high,b.low,b.close,b.volume].every(Number.isFinite)||
    b.low<=0||b.high<Math.max(b.open,b.close)||b.low>Math.min(b.open,b.close)))return;
  const price=bars.at(-1)!.close;
  const atrResult=lastCompleteAtr5m(bars,asOf);
  if(!atrResult||!(atrResult.value>0))return;
  const atr=atrResult.value;
  const factor=input.atrFactor??.3;
  if(!Number.isFinite(factor)||factor<=0)return;
  const halfWidth=atr*factor/2;
  const {rthOpenUtc,rthCloseUtc,ibCloseUtc}=nyCashWindow(dayStartUtc);
  const overnightCloseUtc=dayStartUtc+6*HOUR;
  const endAt=bars.at(-1)!.timestamp+MINUTE;
  const candidate:Candidate[]=[];
  const add=(key:LiquidityKey,side:LiquiditySide,level:number|undefined,freezeAt:number)=>{
    if(level!==undefined&&Number.isFinite(level)&&level>0)
      candidate.push({key,side,price:level,freezeAt});
  };
  // YH/YL are prior closed UTC calendar day. Never use a still-forming daily bar.
  if(previousDay?.symbol===symbol&&previousDay.dayStartUtc+DAY===dayStartUtc){
    add('YH','BSL',previousDay.high,dayStartUtc);
    add('YL','SSL',previousDay.low,dayStartUtc);
  }
  const ranges=[
    {high:'ONH',low:'ONL',from:dayStartUtc,to:overnightCloseUtc},
    {high:'RTH_H',low:'RTH_L',from:rthOpenUtc,to:rthCloseUtc},
    {high:'IBH',low:'IBL',from:rthOpenUtc,to:ibCloseUtc}
  ] as const;
  for(const r of ranges){
    if(endAt<=r.from)continue;
    const to=Math.min(endAt,r.to);
    add(r.high,'BSL',extreme(bars,r.from,to,'BSL'),r.to);
    add(r.low,'SSL',extreme(bars,r.from,to,'SSL'),r.to);
  }
  const levels:LiquidityLevel[]=[];
  const events:LiquidityEvent[]=[];
  for(const c of candidate){
    const frozen=endAt>=c.freezeAt;
    const outcome=frozen?processEvents(c,bars):undefined;
    if(outcome)events.push(...outcome.events);
    levels.push({key:c.key,side:c.side,price:c.price,
      state:outcome?.state??'LIVE',frozen,freezeAt:c.freezeAt,
      zoneLow:c.price-halfWidth,zoneHigh:c.price+halfWidth,
      distancePct:(price/c.price-1)*100,
      sweepAt:outcome?.sweepAt,reclaimAt:outcome?.reclaimAt,
      acceptanceAt:outcome?.acceptanceAt,sweepExtreme:outcome?.sweepExtreme,
      depthPrice:outcome?.depthPrice,depthPct:outcome?.depthPct});
  }
  const upperLevels=levels.filter(l=>l.side==='BSL');
  const lowerLevels=levels.filter(l=>l.side==='SSL');
  const upper=upperLevels.filter(l=>l.price>=price)
    .sort((a,b)=>a.price-b.price)[0]??
    upperLevels.sort((a,b)=>Math.abs(a.price-price)-Math.abs(b.price-price))[0];
  const lower=lowerLevels.filter(l=>l.price<=price)
    .sort((a,b)=>b.price-a.price)[0]??
    lowerLevels.sort((a,b)=>Math.abs(a.price-price)-Math.abs(b.price-price))[0];
  return {symbol,asOf:endAt,dayStartUtc,price,atr,atrTime:atrResult.at,
    levels,upper,lower,events:events.sort((a,b)=>a.at-b.at)};
}
