/* ASCEND SMC POI Research V1 — closed 5m OHLC only; not an entry engine.
 * Heuristic definitions, NOT proof of institutional orders or future direction.
 * Never modifies the trading core, alerts, paper fills or Risk Engine.
 */
(function(root){
'use strict';
const TYPES=['ifvg','ob','rb','stb','ote'];
const finite=Number.isFinite;
function prepare(raw,asOf){
 if(!Array.isArray(raw)||!finite(asOf))return [];
 const sorted=raw.filter(b=>b&&finite(b.time)&&b.time+300<=asOf&&
  [b.open,b.high,b.low,b.close].every(x=>finite(x)&&x>0)&&
  b.low<=Math.min(b.open,b.close)&&b.high>=Math.max(b.open,b.close))
  .sort((a,b)=>a.time-b.time);
 const unique=[];for(const b of sorted){if(unique.length&&unique.at(-1).time===b.time)continue;unique.push(b);}
 // Use a contiguous tail only; never bridge exchange or feed gaps.
 let start=unique.length-1;
 while(start>0&&unique[start].time-unique[start-1].time===300)start--;
 return unique.slice(start).slice(-240);
}
function atrAt(b,i){
 if(i<14)return null;
 let tr=0;
 for(let k=i-13;k<=i;k++){
  const x=b[k],p=b[k-1];if(!p)return null;
  tr+=Math.max(x.high-x.low,Math.abs(x.high-p.close),Math.abs(x.low-p.close));
 }
 return tr/14;
}
function zone(type,side,lower,upper,at,extra={}){
 if(![lower,upper,at].every(finite)||lower<=0||upper<=lower)return null;
 return {type,side,lower,upper,formedAt:at,status:'OPEN',sourceTF:'5m',...extra};
}
function checkActive(z,b,from){
 for(let i=from;i<b.length;i++){
  const x=b[i];
  // Zone becomes invalid only after a *closed* candle beyond its outer edge.
  if(z.side==='LONG'?x.close<z.lower:x.close>z.upper){z.status='INVALID';z.invalidAt=x.time+300;break;}
  if(x.high>=z.lower&&x.low<=z.upper){
   z.status='TOUCHED';if(!z.firstTouchAt)z.firstTouchAt=x.time+300;
  }
 }
 return z;
}
function detect(b){
 const zones=[];
 for(let i=17;i<b.length;i++){
  const x=b[i],prev=b[i-1],atr=atrAt(b,i);if(!atr||atr<=0)continue;
  // IFVG: an existing confirmed 3-candle 5m price gap is closed through
  // the opposite edge. NOT merely an overlapping opposite-color gap.
  if(i>=20){
   const f=b[i-2],j=b[i-1],lowerLong=f.high,upperLong=x.low;
   const lowerShort=x.high,upperShort=f.low;
   let base=null;
   if(upperLong>lowerLong&&upperLong-lowerLong>=.25*atr)
    base=zone('fvg-base','LONG',lowerLong,upperLong,x.time+300);
   else if(upperShort>lowerShort&&upperShort-lowerShort>=.25*atr)
    base=zone('fvg-base','SHORT',lowerShort,upperShort,x.time+300);
   if(base)zones.push({...base,originIndex:i});
  }
  // Order block proxy: last opposite candle followed by displacement
  // close beyond the previous 6-bar extreme (with measurable ATR).
  if(i>=20&&Math.abs(x.close-x.open)>=1.0*atr){
   const up=x.close>x.open&&prev.close<prev.open&&
    x.close>Math.max(...b.slice(i-7,i).map(v=>v.high));
   const down=x.close<x.open&&prev.close>prev.open&&
    x.close<Math.min(...b.slice(i-7,i).map(v=>v.low));
   if(up||down){
    const z=zone('ob',up?'LONG':'SHORT',Math.min(prev.open,prev.close),
     Math.max(prev.open,prev.close),x.time+300,{context:'противоположная свеча → displacement'});
    if(z)zones.push({...z,originIndex:i});
   }
  }
  // Rejection block: wick dominates (>2x body) AND swept the previous
  // five-bar extreme; confirmation only on the *next* closed candle.
  if(i>=20&&i+1<b.length){
   const range=x.high-x.low,body=Math.abs(x.close-x.open),upW=x.high-Math.max(x.open,x.close),
     downW=Math.min(x.open,x.close)-x.low,after=b[i+1];
   const lowSweep=x.low<Math.min(...b.slice(i-5,i).map(v=>v.low));
   const hiSweep=x.high>Math.max(...b.slice(i-5,i).map(v=>v.high));
   const long=range>=.7*atr&&body<=range*.30&&downW>=2*Math.max(body,.001*atr)&&
     downW>=upW*1.4&&lowSweep&&after.close>x.high;
   const short=range>=.7*atr&&body<=range*.30&&upW>=2*Math.max(body,.001*atr)&&
     upW>=downW*1.4&&hiSweep&&after.close<x.low;
   if(long||short){
    const z=zone('rb',long?'LONG':'SHORT',long?x.low:Math.max(x.open,x.close),
      long?Math.min(x.open,x.close):x.high,after.time+300,{context:'sweep + rejection + follow-through'});
    if(z)zones.push({...z,originIndex:i+1});
   }
  }
  // STB/BTS: confirmed sweep/reclaim and next-bar impulse; no inference
  // that any particular market maker caused it.
  if(i>=23&&i+1<b.length){
   const after=b[i+1],down=x.low<Math.min(...b.slice(i-10,i).map(v=>v.low))&&
    x.close>b[i-1].low&&after.close>x.high&&after.close-after.open>=.6*atr;
   const up=x.high>Math.max(...b.slice(i-10,i).map(v=>v.high))&&
    x.close<b[i-1].high&&after.close<x.low&&after.open-after.close>=.6*atr;
   if(down||up){
    const z=zone('stb',down?'LONG':'SHORT',down?x.low:Math.max(x.open,x.close),
       down?Math.min(x.open,x.close):x.high,after.time+300,
       {context:down?'STB · low sweep/reclaim':'BTS · high sweep/reclaim'});
    if(z)zones.push({...z,originIndex:i+1});
   }
  }
 }
 // An old gap becomes an inverse gap only on a *later* close through it.
 const base=zones.filter(z=>z.type==='fvg-base');
 for(const f of base){
  for(let k=f.originIndex+1;k<b.length;k++){
   const flipped=f.side==='LONG'?b[k].close<f.lower:b[k].close>f.upper;
   if(flipped){
    const z=zone('ifvg',f.side==='LONG'?'SHORT':'LONG',f.lower,f.upper,b[k].time+300,
       {context:'5m gap → close through far edge'});
    if(z)zones.push({...z,originIndex:k});
    break;
   }
  }
 }
 // OTE is the most recent completed extreme-to-extreme leg in a 48-bar
 // causal window; it is a reference zone, not a predictive signal.
 if(b.length>=48){
  const h=b.slice(-48),hi=Math.max(...h.map(x=>x.high)),lo=Math.min(...h.map(x=>x.low));
  const highIndex=h.findLastIndex(x=>x.high===hi),lowIndex=h.findLastIndex(x=>x.low===lo);
  const a=atrAt(b,b.length-1);
  if(a&&hi-lo>=2*a&&highIndex!==lowIndex){
   const long=lowIndex<highIndex,leg=hi-lo;
   const lower=long?hi-.79*leg:lo+.62*leg;
   const upper=long?hi-.62*leg:lo+.79*leg;
   const i=b.length-48+Math.max(highIndex,lowIndex);
   const z=zone('ote',long?'LONG':'SHORT',lower,upper,b[i].time+300,
       {context:'последняя волна 48×5m · Fibonacci 0.62–0.79'});
   if(z)zones.push({...z,originIndex:i});
  }
 }
 const now=b.at(-1)?.time+300,price=b.at(-1)?.close;
 const active=zones.filter(z=>z.type!=='fvg-base'&&
  now-z.formedAt<=96*300&&now>=z.formedAt)
  .map(z=>checkActive(z,b,z.originIndex+1))
  .filter(z=>z.status!=='INVALID');
 // Retain only the latest candidate per type+side, ranked near current price.
 const uniq=new Map();
 for(const z of active){const key=z.type+'_'+z.side;const before=uniq.get(key);
  if(!before||z.formedAt>before.formedAt)uniq.set(key,z);
 }
 return [...uniq.values()].map(z=>({...z,distancePct:100*
   (price<z.lower?z.lower-price:price>z.upper?price-z.upper:0)/price}))
  .sort((a,b)=>a.distancePct-b.distancePct||b.formedAt-a.formedAt);
}
function scan(raw,asOf){
 const candles=prepare(raw,asOf);
 if(candles.length<48)return {status:'NO DATA',reason:'недостаточно непрерывной истории 5m',
  asOf,candles:candles.length,zones:[],counts:{}};
 const zones=detect(candles),counts={};
 TYPES.forEach(k=>counts[k]=zones.filter(z=>z.type===k).length);
 return {status:'RESEARCH',asOf,candles:candles.length,zones,counts};
}
root.ASCEND_SMC_POI_RESEARCH_V1=Object.freeze({scan,prepare,atrAt,TYPES});
})(typeof window!=='undefined'?window:globalThis);
