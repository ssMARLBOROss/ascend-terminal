import type {Candle} from '@ascend/contracts';

export type ChartViewMode='TIGHT'|'FULL';
export type LogicalRange={from:number;to:number};
export type PriceWindow={minValue:number;maxValue:number};

/**
 * One viewport per resolution, not "fit all history" on every data tick.
 * FULL is explicitly user-selected; nothing about this changes OHLC data.
 */
export const TIGHT_FOCUS_BARS:Record<string,number>={
  '1m':180,'3m':155,'5m':145,'15m':115,'30m':100,
  '1H':90,'4H':80,'1D':90
};
export function initialChartRange(
  timeframe:string,length:number,mode:ChartViewMode
):LogicalRange|null{
  if(length<2)return null;
  if(mode==='FULL')return {from:Math.max(0,length-320),to:length+5};
  const count=TIGHT_FOCUS_BARS[timeframe]??115;
  return {from:Math.max(0,length-count),to:length+5};
}
/**
 * A tightly scaled main price axis computed from WICKS of only visible bars.
 * Off-screen price lines, FVG, VWAP and session levels keep their true values,
 * but cannot force current candles into a tiny horizontal strip.
 *
 * Input logical range comes from lightweight-charts and is local to
 * the currently selected data array. In historical pan mode this function
 * must use the scrolled-to bars, NOT the latest bars.
 */
export function tightCandlestickRange(
  candles:Candle[],logical:LogicalRange|null,fallbackCount=115
):PriceWindow|null{
  if(!candles.length)return null;
  const n=candles.length;
  const from=logical?Math.max(0,Math.floor(logical.from)-1):
    Math.max(0,n-fallbackCount);
  const to=logical?Math.min(n-1,Math.ceil(logical.to)+1):n-1;
  if(from>=n||to<0||from>to)return null;
  let low=Infinity,high=-Infinity,lastClose=NaN,valid=0;
  for(let i=from;i<=to;i++){
    const candle=candles[i];
    if(!candle||!Number.isFinite(candle.low)||!Number.isFinite(candle.high)||
      candle.low<=0||candle.high<candle.low)continue;
    low=Math.min(low,candle.low);
    high=Math.max(high,candle.high);
    lastClose=candle.close;
    valid++;
  }
  if(!valid||!Number.isFinite(low)||!Number.isFinite(high))return null;
  const center=(low+high)/2;
  const minSpread=Math.max(Math.abs(center)*.0006,1e-9);
  const spread=Math.max(high-low,minSpread);
  const mid=lastClose>0?Math.max(low,Math.min(high,lastClose)):center;
  // Retain actual candle extrema; use slight extra price padding.
  const minValue=Math.max(1e-12,Math.min(low,mid-spread*.5)-spread*.035);
  const maxValue=Math.max(high,mid+spread*.5)+spread*.055;
  return {minValue,maxValue};
}
