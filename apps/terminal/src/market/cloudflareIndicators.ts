import type {Candle} from '@ascend/contracts';

/** Display-only indicators ported from the ASCEND Cloudflare market view.
 * Never grant entry permission; only fully closed candles are used.
 */
export const TF_MILLISECONDS:Record<string,number>={
  '1m':60000,'3m':180000,'5m':300000,'10m':600000,'15m':900000,
  '30m':1800000,'1H':3600000,'4H':14400000,'1D':86400000
};

export function closedMarketCandles(candles:Candle[],timeframe:string,asOf=Date.now()):Candle[]{
  const step=TF_MILLISECONDS[timeframe];
  if(!step)return [];
  return candles.filter(c=>Number.isFinite(c.timestamp)&&
    Number.isFinite(c.close)&&c.close>0&&c.timestamp+step<=asOf);
}

export function smaAt(candles:Candle[],length:number):number|undefined{
  if(candles.length<length||length<1)return undefined;
  const tail=candles.slice(-length);
  if(tail.some(c=>!Number.isFinite(c.close)))return undefined;
  return tail.reduce((sum,c)=>sum+c.close,0)/length;
}

export type RsiPoint={time:number;value:number};
export function rsi14(candles:Candle[],length=14):RsiPoint[]{
  if(candles.length<=length)return [];
  let gain=0,loss=0;
  for(let i=1;i<=length;i++){
    const d=candles[i].close-candles[i-1].close;
    if(d>0)gain+=d;else loss-=d;
  }
  gain/=length;loss/=length;
  const value=()=>loss===0?(gain===0?50:100):100-100/(1+gain/loss);
  const out:RsiPoint[]=[{time:candles[length].timestamp,value:value()}];
  for(let i=length+1;i<candles.length;i++){
    const d=candles[i].close-candles[i-1].close;
    gain=(gain*(length-1)+Math.max(d,0))/length;
    loss=(loss*(length-1)+Math.max(-d,0))/length;
    out.push({time:candles[i].timestamp,value:value()});
  }
  return out;
}

export type RsiZone='RC30'|'RC70'|'NEUTRAL';
export function rsiZone(rsi:number|undefined):RsiZone{
  if(rsi===undefined||!Number.isFinite(rsi))return 'NEUTRAL';
  return rsi<=30?'RC30':rsi>=70?'RC70':'NEUTRAL';
}

export function volumeRatio(candles:Candle[],lookback=20):number|undefined{
  if(candles.length<lookback+1)return undefined;
  const baseline=candles.slice(-lookback-1,-1);
  const mean=baseline.reduce((sum,c)=>sum+c.volume,0)/lookback;
  return mean>0?candles.at(-1)!.volume/mean:undefined;
}
