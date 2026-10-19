import type {Candle} from '@ascend/contracts';
import {deriveTimeframe,fullyClosed} from './fullTimeframes';
import {trendFromClosedBars,type TrendState,type TrendStructureRow} from './trendStructureResearch';

/** 4/5/6 agreement = count of 6 fixed TF with confirmed SAME direction.
 * A directional agreement is an observational candidate, NEVER a CORE entry.
 */
export const RADAR_AGREEMENT_TFS=[
  ['5m',5],['10m',10],['15m',15],['30m',30],['1H',60],['4H',240]
] as const;
export type RadarAgreementTF=(typeof RADAR_AGREEMENT_TFS)[number][0];
export type RadarAgreement={
 status:'READY'|'NO_DATA';
 count:number;direction:'LONG'|'SHORT'|'NEUTRAL';
 rows:Pick<TrendStructureRow,'tf'|'trend'|'high'|'low'|'reason'>[];
 matched:RadarAgreementTF[];
 asOf:number;
 reason:string;
 isTradingSignal:false;
};
/** Validate chronological continuity and reject open candles, absent native bars and stale data. */
function strictClosed(input:Candle[]|undefined,minutes:number,asOf:number):Candle[]{
 if(!input?.length||!Number.isFinite(asOf))return [];
 const step=minutes*60000;
 const rows=fullyClosed(input,minutes,asOf)
  .filter(b=>b&&Number.isInteger(b.timestamp)&&b.timestamp%step===0&&
   [b.open,b.high,b.low,b.close,b.volume].every(Number.isFinite)&&
   b.low>0&&b.high>=b.low&&b.open>=b.low&&b.open<=b.high&&
   b.close>=b.low&&b.close<=b.high&&b.volume>=0)
  .sort((a,b)=>a.timestamp-b.timestamp);
 if(!rows.length)return [];
 // No future data. A source that has stopped updating is not a valid live radar.
 if(asOf-(rows.at(-1)!.timestamp+step)>2*step+60000)return [];
 let start=0;
 for(let i=1;i<rows.length;i++)if(rows[i].timestamp-rows[i-1].timestamp!==step)start=i;
 return rows.slice(start);
}
export function calculateRadarAgreement(args:{
 bars5?:Candle[];bars15?:Candle[];bars60?:Candle[];bars240?:Candle[];
 asOf:number;
}):RadarAgreement{
 const {asOf}=args;
 const neutral=(reason:string,rows:RadarAgreement['rows']=[]):RadarAgreement=>({
  status:'NO_DATA',count:0,direction:'NEUTRAL',rows,matched:[],
  asOf,reason,isTradingSignal:false
 });
 if(!Number.isFinite(asOf))return neutral('Нет времени оценки');
 const five=strictClosed(args.bars5,5,asOf);
 const fifteen=strictClosed(args.bars15,15,asOf);
 const hour=strictClosed(args.bars60,60,asOf);
 const four=strictClosed(args.bars240,240,asOf);
 const samples=[
  five,strictClosed(deriveTimeframe(five,5,10),10,asOf),
  fifteen,strictClosed(deriveTimeframe(fifteen,15,30),30,asOf),
  hour,four
 ];
 const rows=RADAR_AGREEMENT_TFS.map(([tf,minutes],i)=>{
  const bars=samples[i];
  if(bars.length<20)return {tf,trend:'NO DATA' as TrendState,
   high:'—' as const,low:'—' as const,
   reason:'Недостаточно непрерывных закрытых свечей'};
  return trendFromClosedBars(tf,minutes,bars,asOf);
 });
 if(rows.some(r=>r.trend==='NO DATA'))return neutral(
  'Не все 6 периодов имеют подтверждённую свежую структуру',rows);
 const longs=rows.filter(r=>r.trend==='LONG').length;
 const shorts=rows.filter(r=>r.trend==='SHORT').length;
 const direction=longs>=4?'LONG':shorts>=4?'SHORT':'NEUTRAL';
 const count=Math.max(longs,shorts);
 const matched:RadarAgreementTF[]=direction==='NEUTRAL'?[]:
  rows.filter(r=>r.trend===direction).map(r=>r.tf as RadarAgreementTF);
 return {status:'READY',count,direction,rows,matched,asOf,
  reason:direction==='NEUTRAL'?'Меньше 4 совпадающих направлений':
    count+' из 6 периодов подтверждают '+(direction==='LONG'?'рост':'падение')+
    ' · вход по торговому ядру проверяется отдельно',
  isTradingSignal:false};
}
