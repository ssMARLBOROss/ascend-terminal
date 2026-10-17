import type {Candle} from '@ascend/contracts';

export type StructureEventType='HH'|'HL'|'LH'|'LL'|'BOS ↑'|'BOS ↓'|'CHoCH ↑'|'CHoCH ↓';
export type StructureChartEvent={
  id:string;type:StructureEventType;price:number;formedAt:number;confirmedAt:number;
  reference?:number;deltaPercent?:number;direction:'UP'|'DOWN';
  reason:string;timeframe:string;
};
const MINUTES:Record<string,number>={
  '1m':1,'3m':3,'5m':5,'10m':10,'15m':15,'30m':30,'45m':45,
  '1H':60,'2H':120,'4H':240,'6H':360,'12H':720,'1D':1440
};
export const structureEventDescription=(type:StructureEventType)=>{
  if(type==='HH')return 'Более высокий максимум';
  if(type==='HL')return 'Более высокий минимум';
  if(type==='LH')return 'Более низкий максимум';
  if(type==='LL')return 'Более низкий минимум';
  if(type.startsWith('CHoCH'))return 'Смена характера движения';
  return 'Пробой рыночной структуры';
};
/**
 * Read-only chart annotations from CLOSED Bybit candles.
 * A pivot at i can only be confirmed at close(i + 2). Never backdate its
 * detection to the pivot candle. Chart labels are NOT entry confirmations.
 */
export function computeStructureChartEvents(candles:Candle[],timeframe:string,asOf:number):StructureChartEvent[]{
  const ms=(MINUTES[timeframe]??5)*60000;
  const bars=candles.filter(c=>Number.isFinite(c.timestamp)&&c.timestamp+ms<=asOf&&
    Number.isFinite(c.open)&&Number.isFinite(c.high)&&Number.isFinite(c.low)&&
    Number.isFinite(c.close)&&c.high>=c.low&&c.low>0)
    .sort((a,b)=>a.timestamp-b.timestamp);
  if(bars.length<7)return [];
  const out:StructureChartEvent[]=[];
  let high:{price:number;at:number}|undefined,low:{price:number;at:number}|undefined;
  let highLabel:'HH'|'LH'|undefined,lowLabel:'HL'|'LL'|undefined;
  let trend:'UP'|'DOWN'|'NONE'='NONE';
  const broken=new Set<string>();
  const epsilon=(p:number)=>Math.max(1e-12,Math.abs(p)*1e-8);
  for(let j=4;j<bars.length;j++){
    const i=j-2,b=bars[i];
    const before=bars.slice(i-2,i),after=bars.slice(i+1,i+3);
    // Evaluate the pivot ONLY when both future/right bars are closed.
    if([...before,...after].every(c=>c.high<b.high)){
      const ref=high?.price;
      const label=ref===undefined?undefined:b.high>ref+epsilon(ref)?'HH':
        b.high<ref-epsilon(ref)?'LH':undefined;
      high={price:b.high,at:b.timestamp};
      if(label){
        highLabel=label;
        out.push({id:label+'-'+b.timestamp,type:label,price:b.high,
          formedAt:b.timestamp,confirmedAt:bars[j].timestamp+ms,reference:ref,
          deltaPercent:ref?100*(b.high/ref-1):undefined,direction:label==='HH'?'UP':'DOWN',
          timeframe,reason:'Экстремум подтверждён двумя закрытыми свечами справа.'});
      }
    }
    if([...before,...after].every(c=>c.low>b.low)){
      const ref=low?.price;
      const label=ref===undefined?undefined:b.low>ref+epsilon(ref)?'HL':
        b.low<ref-epsilon(ref)?'LL':undefined;
      low={price:b.low,at:b.timestamp};
      if(label){
        lowLabel=label;
        out.push({id:label+'-'+b.timestamp,type:label,price:b.low,
          formedAt:b.timestamp,confirmedAt:bars[j].timestamp+ms,reference:ref,
          deltaPercent:ref?100*(b.low/ref-1):undefined,direction:label==='HL'?'UP':'DOWN',
          timeframe,reason:'Экстремум подтверждён двумя закрытыми свечами справа.'});
      }
    }
    if(highLabel==='HH'&&lowLabel==='HL')trend='UP';
    if(highLabel==='LH'&&lowLabel==='LL')trend='DOWN';
    const curr=bars[j],prev=bars[j-1];
    const crossingUp=high&&high.at<curr.timestamp&&prev.close<=high.price&&curr.close>high.price;
    const crossingDown=low&&low.at<curr.timestamp&&prev.close>=low.price&&curr.close<low.price;
    if(crossingUp&&high&&!broken.has('UP-'+high.at)){
      const isChange=trend==='DOWN';
      out.push({id:'BREAK-UP-'+curr.timestamp,type:isChange?'CHoCH ↑':'BOS ↑',
        price:curr.close,formedAt:curr.timestamp,confirmedAt:curr.timestamp+ms,
        reference:high.price,deltaPercent:100*(curr.close/high.price-1),
        direction:'UP',timeframe,reason:'Закрытие свечи выше заранее подтверждённого максимума.'});
      broken.add('UP-'+high.at);trend='UP';
    }
    if(crossingDown&&low&&!broken.has('DOWN-'+low.at)){
      const isChange=trend==='UP';
      out.push({id:'BREAK-DOWN-'+curr.timestamp,type:isChange?'CHoCH ↓':'BOS ↓',
        price:curr.close,formedAt:curr.timestamp,confirmedAt:curr.timestamp+ms,
        reference:low.price,deltaPercent:100*(curr.close/low.price-1),
        direction:'DOWN',timeframe,reason:'Закрытие свечи ниже заранее подтверждённого минимума.'});
      broken.add('DOWN-'+low.at);trend='DOWN';
    }
  }
  return out.sort((a,b)=>a.confirmedAt-b.confirmedAt||a.formedAt-b.formedAt).slice(-100);
}
