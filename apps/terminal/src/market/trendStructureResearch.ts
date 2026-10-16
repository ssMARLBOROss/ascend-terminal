import type {Candle} from '@ascend/contracts';
import type {StructureDirection} from './ascendStructureResearch';
import {aggregateClosed} from './liquidityDecisionResearch';
import type {FullTimeframe} from './fullTimeframes';

export const TREND_TFS=[
  ['30m',30],['15m',15],['10m',10],['5m',5],['3m',3],['1m',1]
] as const;
export type TrendTf=FullTimeframe;
export type TrendState='LONG'|'SHORT'|'BALANCE'|'TRANSITION'|'NO DATA';
export type SwingHigh='HH'|'LH'|'EQH'|'—';
export type SwingLow='HL'|'LL'|'EQL'|'—';
export type SwingPoint={price:number;formedAt:number;confirmedAt:number};
export type TrendStructureRow={
  tf:TrendTf;minutes:number;trend:TrendState;high:SwingHigh;low:SwingLow;
  at?:number;lastClose?:number;recentHigh?:SwingPoint;recentLow?:SwingPoint;
  reason:string;bars:number;
};
export type TrendAlignment='LONG'|'SHORT'|'CONFLICT'|'WAIT';
export type TrendStructureSnapshot={
  symbol:string;asOf:number;rows:TrendStructureRow[];alignment:TrendAlignment;
  setupDirection?:StructureDirection;setupConflict:boolean;
};

/** Confirm pivots with 2 closed candles on either side.
 * The swing becomes KNOWN only at the close of the second right candle.
 * No partial higher-timeframe candles or future high/low readings.
 */
function findSwings(bars:Candle[],step:number){
  const highs:SwingPoint[]=[],lows:SwingPoint[]=[];
  for(let i=2;i+2<bars.length;i++){
    const b=bars[i],before=bars.slice(i-2,i),after=bars.slice(i+1,i+3);
    const confirmedAt=bars[i+2].timestamp+step;
    if([...before,...after].every(c=>c.high<b.high)){
      highs.push({price:b.high,formedAt:b.timestamp,confirmedAt});
    }
    if([...before,...after].every(c=>c.low>b.low)){
      lows.push({price:b.low,formedAt:b.timestamp,confirmedAt});
    }
  }
  return {highs,lows};
}

export function trendFromClosedBars(
  tf:TrendTf,minutes:number,bars:Candle[],asOf:number
):TrendStructureRow{
  const step=minutes*60000;
  const closed=[...bars].filter(b=>b.timestamp+step<=asOf&&
    Number.isFinite(b.open)&&Number.isFinite(b.close)&&
    Number.isFinite(b.high)&&Number.isFinite(b.low)&&b.low>0&&
    b.high>=b.low).sort((a,b)=>a.timestamp-b.timestamp);
  const empty:TrendStructureRow={
    tf,minutes,trend:'NO DATA',high:'—',low:'—',bars:closed.length,
    reason:'Мало закрытых свечей для двух подтверждённых свинг-экстремумов'
  };
  if(closed.length<9)return empty;
  const {highs,lows}=findSwings(closed,step);
  if(highs.length<2||lows.length<2)return empty;
  const lastHigh=highs.at(-1)!,prevHigh=highs.at(-2)!,
    lastLow=lows.at(-1)!,prevLow=lows.at(-2)!;
  const epsilon=Math.max(1e-12,Math.abs(lastHigh.price)*1e-8);
  const high:SwingHigh=lastHigh.price>prevHigh.price+epsilon?'HH':
    lastHigh.price<prevHigh.price-epsilon?'LH':'EQH';
  const low:SwingLow=lastLow.price>prevLow.price+epsilon?'HL':
    lastLow.price<prevLow.price-epsilon?'LL':'EQL';
  const last=closed.at(-1)!;
  const base:TrendState=high==='HH'&&low==='HL'?'LONG':
    high==='LH'&&low==='LL'?'SHORT':
    high==='LH'&&low==='HL'?'BALANCE':'TRANSITION';
  const broken=base==='LONG'&&last.close<lastLow.price||
    base==='SHORT'&&last.close>lastHigh.price;
  const trend=broken?'TRANSITION':base;
  const reason=broken?'Закрытие нарушило последний подтверждённый структурный экстремум':
    trend==='LONG'?'Последние подтверждённые HH + HL':
    trend==='SHORT'?'Последние подтверждённые LH + LL':
    trend==='BALANCE'?'Сжатие диапазона: LH + HL':
    'Противоречивая структура экстремумов; тренд не подтверждён';
  return {tf,minutes,trend,high,low,
    at:Math.max(lastHigh.confirmedAt,lastLow.confirmedAt),lastClose:last.close,
    recentHigh:lastHigh,recentLow:lastLow,reason,bars:closed.length};
}

export function buildTrendStructure(args:{
  symbol:string;closed1m:Candle[];asOf:number;freshAt?:number;now:number;
  setupDirection?:StructureDirection
}):TrendStructureSnapshot{
  const {symbol,asOf,now,freshAt,setupDirection}=args;
  const stale=!asOf||!freshAt||now-freshAt>130000||
    now-asOf>180000||asOf>now+2000;
  const usable=stale?[]:args.closed1m.filter(x=>x.timestamp+60000<=asOf);
  const rows:TrendStructureRow[]=TREND_TFS.map(([tf,minutes])=>{
    const candles=aggregateClosed(usable,minutes);
    return trendFromClosedBars(tf,minutes,candles,asOf);
  });
  const first=rows[0],second=rows[1];
  const alignment:TrendAlignment=
    first.trend==='LONG'&&second.trend==='LONG'?'LONG':
    first.trend==='SHORT'&&second.trend==='SHORT'?'SHORT':
    first.trend==='LONG'&&second.trend==='SHORT'||
    first.trend==='SHORT'&&second.trend==='LONG'?'CONFLICT':'WAIT';
  const setupConflict=(alignment==='LONG'&&setupDirection==='SHORT')||
    (alignment==='SHORT'&&setupDirection==='LONG');
  return {symbol,asOf,rows,alignment,setupDirection,setupConflict};
}
