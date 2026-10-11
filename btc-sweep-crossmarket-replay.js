/* BTC sweep replay vs ETH/SOL — observational only; no causal or trade signal inference. */
(function(root){
'use strict';
const STEP=300,MIN=60,HORIZONS=[5,15,30,60];
function norm(arr,seconds,asOf){
  if(!Array.isArray(arr))return [];
  return arr.filter(b=>Number.isFinite(Number(b.time))&&
    Number(b.time)+seconds<=asOf)
    .map(b=>({time:Number(b.time),close:Number(b.close)}))
    .filter(b=>Number.isFinite(b.close)&&b.close>0)
    .sort((a,b)=>a.time-b.time);
}
function exactCloseAt(rows,closedAt,seconds){
  return rows.find(b=>b.time+seconds===closedAt)?.close??null;
}
function fiveMinutePrior(rows,time){
  let best=null;
  for(const b of rows){
    if(b.time+STEP<=time)best=b;
    else break;
  }
  return best&&time-(best.time+STEP)<STEP?best.close:null;
}
function response(eventAt,one,eth,sol,asOf){
  if(!Number.isInteger(eventAt)||eventAt>asOf||eventAt<asOf-5*3600)
    return null;
  const b1=norm(one,MIN,asOf),e5=norm(eth,STEP,asOf),s5=norm(sol,STEP,asOf);
  // The starting BTC close is exactly at the event candle CLOSE, not any future quote.
  const btcBase=exactCloseAt(b1,eventAt,MIN);
  const eBase=fiveMinutePrior(e5,eventAt),sBase=fiveMinutePrior(s5,eventAt);
  if(!btcBase)return null;
  function pct(v,base){return v===null||base===null?null:Math.round((v/base-1)*10000)/100}
  const future=HORIZONS.map(minutes=>{
    const t=eventAt+minutes*MIN;
    const pending=t>asOf;
    const btc=pending?null:exactCloseAt(b1,t,MIN);
    // Align macro crypto comparison to a completed 5m close ≤ target.
    const e=pending?null:fiveMinutePrior(e5,t);
    const s=pending?null:fiveMinutePrior(s5,t);
    return {minute:minutes,pending,
      btc:pct(btc,btcBase),eth:pct(e,eBase),sol:pct(s,sBase)};
  });
  return {at:eventAt,btcPrice:btcBase,ethBase:eBase,solBase:sBase,
    horizons:future,historyStart:b1[0]?.time??null};
}
function replay(events,one,eth,sol,asOf){
  const relevant=(events||[]).filter(e=>e.type==='SWEEP'&&
    e.key==='YL'&&Number.isInteger(e.at))
    .sort((a,b)=>b.at-a.at);
  const unique=new Set(),results=[];
  for(const e of relevant){
    const key=e.key+'|'+e.at;
    if(unique.has(key))continue;
    unique.add(key);
    const r=response(e.at,one,eth,sol,asOf);
    if(r)results.push({...r,level:e.key,depthPct:e.depthPct??null});
    if(results.length===4)break;
  }
  return results;
}
root.ASCEND_BTC_SWEEP_REPLAY=Object.freeze({response,replay});
})(typeof window!=='undefined'?window:globalThis);