import type {Candle} from '@ascend/contracts';
import {aggregateClosed} from './liquidityDecisionResearch';
import {observeRadarTicker,type RadarTicker} from './radarEngine';
import {analyzeEarlyOnSetup,type EarlyOnResearch} from './earlyOnResearch';

/** Same ONH/ONL EARLY research as the radar, but for the active chart symbol.
 * No invented 24h ticker statistics, no REST backfills, no automatic orders.
 * Every 5m input bar must come from the closed, contiguous 1m CORE feed.
 */
export function focusEarlyOnResearch(symbol:string,closed1m:Candle[],
  asOf:number,freshAt?:number,now=Date.now()):EarlyOnResearch{
  const empty:EarlyOnResearch={status:'NONE',direction:'NEUTRAL',isResearch:true,
    reason:'Ждём полную историю замороженных ONH/ONL и закрытых свечей 5m'};
  if(!asOf||!freshAt||now-freshAt>130000||now-asOf>180000||
    asOf>now+2000||closed1m.length<360)return empty;
  const dayStart=Math.floor((asOf-1)/86400000)*86400000;
  const bars=closed1m.filter(c=>c.timestamp>=dayStart&&c.timestamp+60000<=asOf)
    .sort((a,b)=>a.timestamp-b.timestamp);
  // Guard against missing candles: aggregator must NEVER bridge a feed gap.
  if(bars.length===0||bars[0].timestamp!==dayStart||
    bars.some((b,i)=>b.timestamp!==dayStart+i*60000))return empty;
  const five=aggregateClosed(bars,5);
  if(five.length<72)return empty;
  const last=five.at(-1)!;
  const ticker:RadarTicker={symbol,price:last.close,change24h:0,turnover24h:0};
  const observation=observeRadarTicker(ticker,five,asOf);
  const candidate=analyzeEarlyOnSetup(observation,five,asOf);
  return {...candidate};
}
