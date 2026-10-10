import {mkdir,writeFile} from 'node:fs/promises';
const OUT='research/results/mexc-yl-20261010';
await mkdir(OUT,{recursive:true});
const signals=[
{symbol:'ONDO_USDT',sweep:'2026-10-08T17:26:00Z',reclaim:'2026-10-08T18:16:00Z',alert:'2026-10-08T19:30:00Z',yl:0.4563,atAlert:0.4911,sweepLow:0.4391},
{symbol:'ALGO_USDT',sweep:'2026-10-08T17:21:00Z',reclaim:'2026-10-08T17:57:00Z',alert:'2026-10-08T20:14:00Z',yl:0.11513,atAlert:0.12043,sweepLow:0.11491},
{symbol:'QNT_USDT',sweep:'2026-10-08T17:50:00Z',reclaim:'2026-10-08T22:27:00Z',alert:'2026-10-08T23:13:00Z',yl:235.57,atAlert:237.58,sweepLow:220.69},
{symbol:'DOT_USDT',sweep:'2026-10-08T17:49:00Z',reclaim:'2026-10-08T21:47:00Z',alert:'2026-10-08T23:15:00Z',yl:1.0837,atAlert:1.1043,sweepLow:1.0087},
{symbol:'FARTCOIN_USDT',sweep:'2026-10-08T17:26:00Z',reclaim:'2026-10-08T22:59:00Z',alert:'2026-10-08T23:24:00Z',yl:0.15661,atAlert:0.15786,sweepLow:0.14265},
{symbol:'ZRO_USDT',sweep:'2026-10-09T19:57:00Z',reclaim:'2026-10-09T21:36:00Z',alert:'2026-10-09T22:31:00Z',yl:1.9207,atAlert:1.9465,sweepLow:1.8851}
];
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function api(path,query){
const qs=new URLSearchParams(query),errors=[];
for(const host of ['https://api.mexc.com','https://contract.mexc.com']){
 for(let trial=0;trial<3;trial++){
  try{
   const controller=new AbortController();
   const timeout=setTimeout(()=>controller.abort(),15000);
   let response;
   try{response=await fetch(host+path+'?'+qs,{signal:controller.signal,headers:{Accept:'application/json','User-Agent':'ASCEND-Research/1.0'}})}
   finally{clearTimeout(timeout)}
   const raw=await response.text();
   if(!response.ok)throw Error('HTTP '+response.status+' '+raw.slice(0,100));
   const json=JSON.parse(raw);
   if(json.success!==true||!json.data)throw Error('MEXC '+String(json.code)+' '+String(json.message));
   return json.data;
  }catch(err){errors.push(host+' '+String(err));await sleep(650*(trial+1))}
 }
}
throw Error(errors.join(' | ').slice(0,1700));
}
async function candles(symbol,start,end){
const result=new Map(),stride=1000*60;
for(let cursor=start;cursor<end;cursor+=stride){
 const upto=Math.min(cursor+stride,end);
 const data=await api('/api/v1/contract/kline/'+symbol,{interval:'Min1',start:String(cursor),end:String(upto-60)});
 const fields=['time','open','high','low','close','vol'];
 if(fields.some(x=>!Array.isArray(data[x])||data[x].length!==data.time.length))throw Error('Invalid candle arrays');
 for(let i=0;i<data.time.length;i++){
  const t=Number(data.time[i]);
  if(t<cursor||t>=upto)continue;
  const row=fields.map(x=>Number(data[x][i]));
  if(row.some(x=>!Number.isFinite(x))||row[3]<=0||row[2]<row[3])throw Error('Invalid candle '+t);
  result.set(t,row);
 }
 await sleep(190);
}
const sorted=[...result.values()].sort((a,b)=>a[0]-b[0]),expected=(end-start)/60,gaps=[];
for(let t=start;t<end;t+=60)if(!result.has(t))gaps.push(t);
return {candles:sorted,expected,actual:sorted.length,gaps:gaps.slice(0,30),gapCount:gaps.length};
}
const report={requestedAt:new Date().toISOString(),source:'MEXC Futures public API',interval:'Min1',timezone:'UTC',signals:[],errors:[]};
for(const s of signals){
try{
 const eventDay=Math.floor(Date.parse(s.sweep)/86400000)*86400;
 const start=eventDay,end=eventDay+39*3600;
 const snap=await candles(s.symbol,start,end);
 const prior=await api('/api/v1/contract/kline/'+s.symbol,{interval:'Day1',
   start:String(start-2*86400),end:String(start+86400)});
 const daily=[];
 if(Array.isArray(prior.time))for(let i=0;i<prior.time.length;i++)daily.push({
  time:Number(prior.time[i]),open:Number(prior.open[i]),high:Number(prior.high[i]),
  low:Number(prior.low[i]),close:Number(prior.close[i])});
 const out={signal:s,start,end,...snap,day1:daily};
 await writeFile(OUT+'/'+s.symbol+'.json',JSON.stringify(out));
 report.signals.push({symbol:s.symbol,expected:snap.expected,actual:snap.actual,
   gaps:snap.gapCount,sourceDay1:daily.length,file:OUT+'/'+s.symbol+'.json'});
}catch(e){report.errors.push({symbol:s.symbol,reason:String(e).slice(0,2600)})}
await sleep(300);
}
await writeFile(OUT+'/status.json',JSON.stringify(report,null,2));
console.log('MEXC RESEARCH RESULT',JSON.stringify(report,null,2));
