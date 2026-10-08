import type {Candle} from '@ascend/contracts';

export const FVG_TF_MS={ '1m':60000,'3m':180000,'5m':300000,
  '15m':900000,'30m':1800000 } as const;
export type FvgTf=keyof typeof FVG_TF_MS;
export type FvgDirection='bull'|'bear';
export type FvgState='NEW'|'ACTIVE'|'TESTING'|'PARTIAL'|'FILLED'|'INVALID';
export type FillMode='wick'|'close';
export type FvgEventType='CREATED'|'ACTIVE'|'APPROACH'|'RETEST'|'PARTIAL'|
  'FILL_25'|'FILL_50'|'FILL_75'|'FILLED'|'EXIT'|'INVALID';
export type FvgEvent={id:string;zoneId:string;at:number;barStart:number;type:FvgEventType;
  fillPct:number;detail?:string};
export type FvgContextLevel={id:string;price:number;availableFrom:number;status:'FROZEN'|'LIVE'};
export type FvgContext={session:string;levels:{id:string;distancePct:number;status:'FROZEN'|'LIVE'}[];
  volumeRatio:number|null;vwap:'UNAVAILABLE';structure:'UNAVAILABLE';core:'NOT_CONNECTED'};
export type FvgRecord={
  id:string;symbol:string;exchange:'BYBIT';timeframe:FvgTf;
  side:FvgDirection;low:number;high:number;midpoint:number;
  formedAt:number;formedIndex:number;size:number;gapPercent:number;
  atr:number|null;atrMultiple:number|null;sizeClass:'SMALL'|'MEDIUM'|'LARGE'|'VERY_LARGE'|'ATR_UNAVAILABLE';
  status:FvgState;maxFillPct:number;currentFillPct:number;
  firstTouchAt?:number;filledAt?:number;filledIndex?:number;
  visits:number;timeInsideMs:number;exitDirection?:'UP'|'DOWN';
  milestones:Partial<Record<25|50|75|100,number>>;
  events:FvgEvent[];context:FvgContext;remainingLow:number;remainingHigh:number;
};
export type EngineSettings={atrLength:number;fillMode:FillMode;minGapPercent:number};

const clamp=(n:number)=>Math.max(0,Math.min(100,n));
const valid=(c:Candle)=>Number.isFinite(c.timestamp)&&
  [c.open,c.close,c.low,c.high,c.volume].every(Number.isFinite)&&
  c.low>0&&c.high>=c.low&&c.high>=c.open&&c.high>=c.close&&
  c.low<=c.open&&c.low<=c.close&&c.volume>=0;
const sizeClass=(m:number|null):FvgRecord['sizeClass']=>m===null?'ATR_UNAVAILABLE':
  m<.25?'SMALL':m<.50?'MEDIUM':m<=1?'LARGE':'VERY_LARGE';
const sessionFor=(at:number)=>{
  const hour=new Date(at).getUTCHours();
  const active=[hour<8?'ASIA':'',hour>=7&&hour<16?'LONDON':'',
    hour>=13&&hour<22?'NEW_YORK':''].filter(Boolean);
  return active.length?active.join(' + '):'OUTSIDE_WINDOWS';
};
export function computeAtr(bars:Candle[],index:number,length=14):number|null{
  if(!Number.isInteger(length)||length<2||index<length-1)return null;
  // Wilder-smoothed ATR with no historical look-ahead, initialized at the first
  // fully available length bars. Discontinuous candles break the ATR sequence.
  let atr=0;
  for(let i=0;i<=index;i++){
    const b=bars[i];
    if(!valid(b))return null;
    if(i>0&&b.timestamp<=bars[i-1].timestamp)return null;
    const prev=i>0?bars[i-1].close:b.close;
    const tr=Math.max(b.high-b.low,Math.abs(b.high-prev),Math.abs(b.low-prev));
    if(i<length)atr+=tr;
    else atr=(atr*(length-1)+tr)/length;
  }
  return atr>0?(index>=length-1?(index===length-1?atr/length:atr):null):null;
}
function emit(zone:FvgRecord,type:FvgEventType,at:number,barStart:number,detail?:string){
  const id=zone.id+':'+type+':'+barStart;
  if(zone.events.some(e=>e.id===id))return;
  zone.events.push({id,zoneId:zone.id,type,at,barStart,
    fillPct:zone.maxFillPct,detail});
}
/** Stable OHLC observation time = END of closed candle, never the detection wall clock. */
export function computeFvgContext(
  candles:Candle[],symbol:string,tf:FvgTf,settings:EngineSettings,
  levels:FvgContextLevel[]=[],now=Date.now()
):FvgRecord[]{
  const interval=FVG_TF_MS[tf];
  if(!interval)return [];
  const bars=[...candles].sort((a,b)=>a.timestamp-b.timestamp)
    .filter((x,i,arr)=>i===0||x.timestamp!==arr[i-1].timestamp);
  const output:FvgRecord[]=[];
  const window=Math.max(2,Math.round(settings.atrLength));
  const atrSeries:(number|null)[]=[];
  let running=0,chain=0;
  const volSeries:number[]=[];
  const previousVolume=(index:number)=>{
    const pre=volSeries.slice(Math.max(0,index-20),index);
    if(pre.length<5)return null;
    const mean=pre.reduce((s,v)=>s+v,0)/pre.length;
    return mean>0?bars[index].volume/mean:null;
  };
  for(let i=0;i<bars.length;i++){
    const current=bars[i],at=current.timestamp+interval;
    if(at>now)break;
    if(!valid(current))continue;
    const consecutive=i===0||current.timestamp-bars[i-1].timestamp===interval;
    if(!consecutive){chain=0;running=0}
    const prev=i>0&&consecutive?bars[i-1].close:current.close;
    const tr=Math.max(current.high-current.low,
      Math.abs(current.high-prev),Math.abs(current.low-prev));
    chain++;
    if(chain<window)running+=tr;
    else if(chain===window)running=(running+tr)/window;
    else running=(running*(window-1)+tr)/window;
    const atr=chain>=window?running:null;
    atrSeries[i]=atr;

    for(const z of output){
      if(z.status==='FILLED'||z.status==='INVALID'||at<=z.formedAt)continue;
      const measure=z.side==='bull'?
        (settings.fillMode==='wick'?current.low:current.close):
        (settings.fillMode==='wick'?current.high:current.close);
      const inside=z.side==='bull'
        ?measure<=z.high&&measure>=z.low
        :measure>=z.low&&measure<=z.high;
      const penetration=clamp((z.side==='bull'?(z.high-measure):(measure-z.low))/z.size*100);
      const isNowInside=inside&&penetration>0&&penetration<100;
      const wasInside=z.status==='TESTING';
      if(isNowInside){
        if(z.firstTouchAt===undefined)z.firstTouchAt=at;
        if(!wasInside){
          z.visits++;
          emit(z,'RETEST',at,current.timestamp);
        }
        z.status='TESTING';
        z.timeInsideMs+=interval;
      }else if(wasInside){
        z.status='PARTIAL';
        z.exitDirection=current.close>=z.midpoint?'UP':'DOWN';
        emit(z,'EXIT',at,current.timestamp,z.exitDirection);
      }else if(z.status==='NEW'){
        z.status='ACTIVE';emit(z,'ACTIVE',at,current.timestamp);
      }
      if(penetration>0&&!isNowInside&&z.firstTouchAt===undefined){
        z.firstTouchAt=at;z.visits++;
        emit(z,'RETEST',at,current.timestamp,'Entire interval crossed in one closed bar');
      }
      if(penetration>z.maxFillPct){
        z.maxFillPct=penetration;
        for(const milestone of [25,50,75,100] as const){
          if(penetration>=milestone&&!z.milestones[milestone]){
            z.milestones[milestone]=at;
            emit(z,milestone===100?'FILLED':('FILL_'+milestone) as FvgEventType,
              at,current.timestamp);
          }
        }
        if(z.maxFillPct<100&&z.status==='ACTIVE'){
          z.status='PARTIAL';
          emit(z,'PARTIAL',at,current.timestamp);
        }
      }
      z.currentFillPct=penetration;
      z.remainingLow=z.side==='bull'
        ?z.low:z.low+z.size*z.maxFillPct/100;
      z.remainingHigh=z.side==='bull'
        ?z.high-z.size*z.maxFillPct/100:z.high;
      if(penetration>=100){
        z.status='FILLED';z.filledAt=at;z.filledIndex=i;
      }
    }

    if(i<2){volSeries[i]=current.volume;continue}
    const first=bars[i-2],middle=bars[i-1];
    if(!valid(first)||!valid(middle)||
      middle.timestamp-first.timestamp!==interval||
      current.timestamp-middle.timestamp!==interval){
      volSeries[i]=current.volume;continue;
    }
    let side:FvgDirection,low:number,high:number;
    if(current.low>first.high){side='bull';low=first.high;high=current.low}
    else if(current.high<first.low){side='bear';low=current.high;high=first.low}
    else {volSeries[i]=current.volume;continue}
    const size=high-low,midpoint=(low+high)/2,gapPercent=size/midpoint*100;
    if(gapPercent<settings.minGapPercent){volSeries[i]=current.volume;continue}
    const multiple=atr&&atr>0?size/atr:null;
    const contextLevels=levels.filter(l=>l.availableFrom<=at&&l.price>0)
      .map(l=>({id:l.id,distancePct:Math.abs(midpoint/l.price-1)*100,status:l.status}))
      .filter(l=>l.distancePct<=1.5).sort((a,b)=>a.distancePct-b.distancePct);
    const id='BYBIT:'+symbol+':'+tf+':'+String(at)+':'+side;
    const zone:FvgRecord={id,symbol,exchange:'BYBIT',timeframe:tf,side,low,high,midpoint,
      formedAt:at,formedIndex:i,size,gapPercent,atr,atrMultiple:multiple,
      sizeClass:sizeClass(multiple),status:'NEW',maxFillPct:0,currentFillPct:0,
      visits:0,timeInsideMs:0,milestones:{},events:[],
      remainingLow:low,remainingHigh:high,
      context:{session:sessionFor(at),levels:contextLevels,volumeRatio:previousVolume(i),
        vwap:'UNAVAILABLE',structure:'UNAVAILABLE',core:'NOT_CONNECTED'}};
    emit(zone,'CREATED',at,current.timestamp);
    output.push(zone);
    volSeries[i]=current.volume;
  }
  return output;
}
export function distanceToFvg(zone:FvgRecord,price:number){
  if(!Number.isFinite(price)||price<=0)return null;
  return price>=zone.low&&price<=zone.high?0:
    Math.abs((price<zone.low?zone.low:zone.high)-price)/price*100;
}
export function summariseFvg(records:FvgRecord[]){
  return records.reduce((summary,z)=>{
    const key=z.sizeClass;const group=summary[key];
    group.total++;if(z.firstTouchAt!==undefined)group.retested++;
    if(z.status==='FILLED')group.filled++;
    return summary;
  },{SMALL:{total:0,retested:0,filled:0},
    MEDIUM:{total:0,retested:0,filled:0},
    LARGE:{total:0,retested:0,filled:0},
    VERY_LARGE:{total:0,retested:0,filled:0},
    ATR_UNAVAILABLE:{total:0,retested:0,filled:0}});
}
