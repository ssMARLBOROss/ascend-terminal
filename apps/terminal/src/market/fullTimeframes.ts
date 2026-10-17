import type {Candle} from '@ascend/contracts';

export const MINUTE_MS=60000;
export const TF_FULL=[
  ['1m',1],['3m',3],['5m',5],['10m',10],
  ['15m',15],['30m',30],['45m',45],
  ['1H',60],['2H',120],['4H',240],['6H',360],['12H',720],['1D',1440]
] as const;
export type FullTimeframe=(typeof TF_FULL)[number][0];
export const DERIVED_BASE={'10m':'5m','45m':'15m'} as const;

/** Given closed or live source candles, reconstruct a target timeframe.
 * A historical bucket MUST have every source bar, uniformly timestamped;
 * only the newest bucket may have an in-progress candle. The target candle
 * is not considered CLOSED by indicators until its own end timestamp.
 */
export function deriveTimeframe(
  candles:Candle[],sourceMinutes:number,targetMinutes:number
):Candle[]{
  if(!Number.isInteger(sourceMinutes)||!Number.isInteger(targetMinutes)||
    sourceMinutes<1||targetMinutes<sourceMinutes||
    targetMinutes%sourceMinutes!==0)return [];
  const sourceMs=sourceMinutes*MINUTE_MS,targetMs=targetMinutes*MINUTE_MS,
    needed=targetMinutes/sourceMinutes;
  const sorted=[...candles].sort((a,b)=>a.timestamp-b.timestamp);
  const groups=new Map<number,Candle[]>();
  for(const bar of sorted){
    if(!Number.isFinite(bar.timestamp)||!Number.isFinite(bar.close)||
      !Number.isFinite(bar.open)||!Number.isFinite(bar.high)||
      !Number.isFinite(bar.low)||!Number.isFinite(bar.volume)||bar.volume<0)continue;
    const bucket=Math.floor(bar.timestamp/targetMs)*targetMs;
    const array=groups.get(bucket)??[];
    array.push(bar);groups.set(bucket,array);
  }
  const keys=[...groups.keys()].sort((a,b)=>a-b);
  const result:Candle[]=[];
  for(let k=0;k<keys.length;k++){
    const timestamp=keys[k],rows=groups.get(timestamp)!;
    // Earliest bucket may start mid-period due to truncated REST history.
    if(rows[0].timestamp!==timestamp||rows.length>needed||
      rows.some((b,i)=>b.timestamp!==timestamp+i*sourceMs))continue;
    if(rows.length!==needed&&k!==keys.length-1)continue;
    result.push({
      timestamp,open:rows[0].open,
      high:Math.max(...rows.map(x=>x.high)),
      low:Math.min(...rows.map(x=>x.low)),
      close:rows.at(-1)!.close,
      volume:rows.reduce((sum,x)=>sum+x.volume,0)
    });
  }
  return result;
}

export function fullyClosed(bars:Candle[],minutes:number,asOf:number):Candle[]{
  return bars.filter(bar=>bar.timestamp+minutes*MINUTE_MS<=asOf);
}
