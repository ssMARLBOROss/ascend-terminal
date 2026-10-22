/* ASCEND TPO MARKET PROFILE V1 — research only.
 * TPO is count of TIME brackets touching a price bin, not executed volume.
 * No network, order routing, trading signals, or forecast.
 */
(function(root){
'use strict';
const STEP=300,DAY=86400,ALPHABET='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const sessionDefs=[
 {id:'asia',label:'Азия',from:0,to:8,color:'#49b9a9'},
 {id:'frankfurt',label:'Франкфурт',from:6,to:9,color:'#e7b24c'},
 {id:'london',label:'Лондон',from:7,to:16,color:'#629be8'},
 {id:'newyork',label:'Нью-Йорк',from:13,to:22,color:'#d99263'}
];
const finite=x=>typeof x==='number'&&Number.isFinite(x);
function prepare(raw,asOf){
 if(!Array.isArray(raw)||!finite(asOf))return [];
 const out=[],seen=new Set();
 for(const x of raw){
  if(!x||!finite(Number(x.time)))continue;
  const t=Number(x.time);
  if(!finite(t)||t%STEP!==0||t+STEP>asOf||seen.has(t))continue;
  const a={time:t,open:Number(x.open),high:Number(x.high),low:Number(x.low),
   close:Number(x.close),volume:Number(x.volume)||0};
  if(![a.open,a.high,a.low,a.close].every(v=>finite(v)&&v>0)||
   a.low>Math.min(a.open,a.close)||a.high<Math.max(a.open,a.close))continue;
  seen.add(t);out.push(a);
 }
 return out.sort((a,b)=>a.time-b.time);
}
function niceStep(range,requested=48){
 const target=range/Math.max(16,Math.min(100,Number(requested)||48));
 if(!finite(target)||target<=0)return 0;
 const pow=10**Math.floor(Math.log10(target)),ratio=target/pow;
 return (ratio<=1?1:ratio<=2?2:ratio<=5?5:10)*pow;
}
function brackets(bars,start,end,period=30){
 const span=Number(period)*60;
 if(![900,1800,3600].includes(span))return [];
 const n=span/STEP,groups=new Map();
 for(const b of bars){
  if(b.time<start||b.time>=end)continue;
  const k=Math.floor(b.time/span)*span;
  if(!groups.has(k))groups.set(k,[]);
  groups.get(k).push(b);
 }
 const out=[];
 for(const [t,rows] of [...groups.entries()].sort((a,b)=>a[0]-b[0])){
  if(rows.length!==n||rows[0].time!==t||rows.some((x,i)=>x.time!==t+i*STEP))continue;
  out.push({time:t,at:t+span,high:Math.max(...rows.map(x=>x.high)),
   low:Math.min(...rows.map(x=>x.low)),open:rows[0].open,
   close:rows.at(-1).close,letter:ALPHABET[Math.floor((t-start)/span)%ALPHABET.length],
   ordinal:Math.floor((t-start)/span),volume:rows.reduce((n,x)=>n+x.volume,0)});
 }
 return out;
}
function calculate(book,opts={}){
 if(!book?.length)return null;
 const tick=Number(opts.priceStep)||niceStep(Math.max(...book.map(x=>x.high))-
   Math.min(...book.map(x=>x.low)),opts.rows||48);
 if(!finite(tick)||tick<=0)return null;
 const origin=Math.floor(Math.min(...book.map(x=>x.low))/tick)*tick;
 const map=new Map();
 for(const br of book){
  const lo=Math.max(0,Math.floor((br.low-origin)/tick+1e-8));
  const hi=Math.max(lo,Math.floor((br.high-origin)/tick+1e-8));
  for(let idx=lo;idx<=hi&&idx<1000;idx++){
   const current=map.get(idx)||{index:idx,count:0,letters:[],volume:0};
   current.count++;current.letters.push({letter:br.letter,time:br.time});
   map.set(idx,current);
  }
 }
 if(!map.size||map.size>450)return null;
 const ascending=[...map.values()].sort((a,b)=>a.index-b.index);
 const maxCount=Math.max(...ascending.map(x=>x.count));
 const midpoint=(Math.max(...book.map(x=>x.high))+Math.min(...book.map(x=>x.low)))/2;
 const candidates=ascending.filter(z=>z.count===maxCount);
 const pocRow=candidates.sort((a,b)=>Math.abs(origin+(a.index+.5)*tick-midpoint)-
   Math.abs(origin+(b.index+.5)*tick-midpoint)||a.index-b.index)[0];
 const total=ascending.reduce((sum,x)=>sum+x.count,0),ratio=Math.max(.5,Math.min(.9,Number(opts.valuePct||70)/100));
 const byIndex=new Map(ascending.map(x=>[x.index,x]));
 let lowIdx=pocRow.index,highIdx=pocRow.index,included=pocRow.count;
 while(included<total*ratio){
  const lower=byIndex.get(lowIdx-1),upper=byIndex.get(highIdx+1);
  if(!lower&&!upper)break;
  if(upper&&(!lower||upper.count>=lower.count)){included+=upper.count;highIdx++;}
  else {included+=lower.count;lowIdx--;}
 }
 const center=i=>Number((origin+(i+.5)*tick).toPrecision(13));
 const areaLo=center(lowIdx),areaHi=center(highIdx),poc=center(pocRow.index);
 return {
  poc,vah:areaHi,val:areaLo,tick,maxCount,total,coverage:included/total,
  high:Math.max(...book.map(x=>x.high)),low:Math.min(...book.map(x=>x.low)),
  start:book[0].time,end:book.at(-1).at,countBrackets:book.length,
  rows:ascending.slice().reverse().map(z=>({...z,price:center(z.index),value:z.index>=lowIdx&&z.index<=highIdx})),
  periodMin:opts.period||30
 };
}
function study(raw,asOf,options={}){
 const period=[15,30,60].includes(Number(options.period))?Number(options.period):30;
 const prepared=prepare(raw,asOf);
 if(!prepared.length)return {status:'NO_DATA',reason:'Нет закрытых свечей MEXC 5m',sessions:[]};
 const newest=prepared.at(-1).time+STEP;
 const refDay=Math.floor((newest-1)/DAY)*DAY;
 const offset=options.dayOffset===1?1:0,day=refDay-offset*DAY;
 const dayBars=prepared.filter(x=>x.time>=day&&x.time<day+DAY);
 const dayBooks=brackets(prepared,day,day+DAY,period);
 const global=calculate(dayBooks,{rows:options.rows||48,period,valuePct:options.valuePct||70});
 if(!global)return {status:'NO_DATA',reason:'Нет полных TPO-интервалов за выбранный день',
  day,dayOffset:offset,latestCloseAt:newest,candles:dayBars.length,sessions:[]};
 const sessions=sessionDefs.map(def=>{
  const book=dayBooks.filter(b=>{
   const t=(b.time-day)/3600;
   return t>=def.from&&t<def.to;
  });
  const p=calculate(book,{priceStep:global.tick,period,valuePct:options.valuePct||70});
  const completeExpected=(def.to-def.from)*60/period;
  return {...def,profile:p,brackets:book.length,expected:completeExpected,
   complete:book.length===completeExpected};
 });
 const expected=24*60/period,complete=dayBooks.length===expected;
 let npoc=null;
 const before=brackets(prepared,day-DAY,day,period);
 if(before.length===expected){
  const prev=calculate(before,{rows:options.rows||48,period,valuePct:options.valuePct||70});
  if(prev){
   const later=prepared.filter(x=>x.time>=day&&x.time+STEP<=asOf);
   if(later.length&&!later.some(b=>b.low<=prev.poc&&b.high>=prev.poc))
    npoc={price:prev.poc,day:day-DAY,untestedSince:day};
  }
 }
 const lastClose=dayBars.at(-1)?.close??null;
 const location=lastClose===null?'NO_DATA':lastClose>global.vah?'ABOVE_VAH':
   lastClose<global.val?'BELOW_VAL':lastClose>global.poc?'UPPER_VALUE':
   lastClose<global.poc?'LOWER_VALUE':'POC';
 const stale=asOf-newest>15*60;
 return {
  status:complete?'COMPLETE':'PARTIAL',day,dayOffset:offset,latestCloseAt:newest,
  candles:dayBars.length,complete,actualBrackets:dayBooks.length,expectedBrackets:expected,
  book:dayBooks,profile:global,sessions,npoc,lastClose,location,stale,
  source:'MEXC USDT Futures 5m · закрытые свечи',
  note:'TPO показывает число 15/30/60-минутных периодов на уровне. Не Volume Profile и не сигнал.'
 };
}
root.ASCEND_TPO_PROFILE_V1=Object.freeze({prepare,niceStep,brackets,calculate,study,sessionDefs,STEP,DAY});
})(typeof window!=='undefined'?window:globalThis);
