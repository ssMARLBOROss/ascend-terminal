/* ASCEND verified daily FRED macro panel and limited BTC sweep replay. */
(function(root){
'use strict';
const ID={
 SP500:'pMacroSP500',NASDAQCOM:'pMacroNASDAQ',DGS10:'pMacroUST10',
 DGS2:'pMacroUST2',DTWEXBGS:'pMacroBroadUSD',
 DCOILWTICO:'pMacroWTI',DXY:'pMacroDXY',XAUUSD:'pMacroGold',GOLD_GC:'pMacroGoldFutures'
};
const toText=(id,text,cls)=>{
 const el=document.getElementById(id);
 if(el){el.textContent=text;el.className=cls||''}
};
let cached=null,updated=0,busy=false,ac=null;
function visible(){
 const card=document.querySelector('[data-pressure-card="macro"]');
 return card&&!card.classList.contains('collapsed')&&!document.hidden&&
   document.body.dataset.view==='market';
}
function printSeries(series){
 if(!series||series.status!=='READY')
   return {text:'NO DATA · '+String(series?.reason||'не подключено').slice(0,85),tone:'nodata'};
 const val=Number(series.value);
 if(!Number.isFinite(val))return {text:'NO DATA · неверное значение',tone:'nodata'};
 const delta=Number(series.change),unit=series.change_unit==='bp'?'bp':'%';
 const number=val.toLocaleString('ru-RU',{maximumFractionDigits:4});
 const change=(delta>0?'+':'')+delta.toFixed(unit==='bp'?1:2)+unit;
 const source=String(series.source||'').includes('Yahoo')?
   String(series.provider_ticker||'?')+' · Yahoo research':'FRED daily';
 return {text:number+' · '+change+' · '+series.observation_date+' · '+source,
   tone:delta>0?'long':delta<0?'short':'neutral'};
}
function render(){
 if(!visible())return;
 const old=updated&&Date.now()-updated>60*60*1000;
 const market=old?null:cached?.markets;
 for(const [key,id] of Object.entries(ID)){
  const row=printSeries(market?.[key]);
  toText(id,row.text,row.tone);
 }
 const ready=market?Object.values(market).filter(x=>x.status==='READY').length:0;
 toText('pMacroFREDStatus',ready?
   'MACRO DAILY · '+ready+'/'+String(cached.total||9)+' рядов · '+new Date(cached.retrieved_utc).toISOString().slice(11,16)+' UTC':
   'MACRO NO DATA · проверь Railway API',ready?'neutral':'nodata');
 const warning=document.getElementById('pMacroFREDNote');
 if(warning)warning.textContent=
   'Источники: FRED daily (официальные ряды) и Yahoo Finance chart (неофициальный исследовательский). '+
   'Данные не intraday и не торговый сигнал. GC=F и CL=F — фьючерсы, НЕ spot. '+
   'XAU/USD spot не подключён. UST в bp. Дата наблюдения не равна времени публикации.';
 renderReplay();
}
function renderReplay(){
 if(!visible())return;
 const host=document.getElementById('pMacroSweepReplay');if(!host)return;
 host.replaceChildren();
 const paragraph=(text)=>{const div=document.createElement('div');div.className='macro-replay-row';
   div.textContent=text;host.appendChild(div)};
 if(typeof state==='undefined'||state.symbol!=='BTC_USDT'){
   paragraph('Выбери BTC/USDT, чтобы сравнить его YL SWEEP с реакцией ETH/SOL.');
   return;
 }
 const report=typeof latestStructureEvidence==='undefined'?null:latestStructureEvidence;
 if(!root.ASCEND_BTC_SWEEP_REPLAY||!report||report.status!=='READY'){
   paragraph('Нет подтверждённых событий 1m BTC или история устарела.');return;
 }
 const history=root.ASCEND_CROSS_MARKET_UI?.getHistory?.()||{};
 const one=state.tf['1m']||[];
 const asOf=Number(report.asOf);
 const events=report.perLevel?.flatMap(x=>x.events)||report.recent;
 const replay=root.ASCEND_BTC_SWEEP_REPLAY.replay(events,one,
   history['ETH_USDT']||[],history['SOL_USDT']||[],asOf);
 if(!replay.length){paragraph('За доступные ~4 часа истории 1m BTC нет подтверждённых YL SWEEP.');return;}
 for(const e of replay){
  const time=new Date(e.at*1000).toISOString().slice(11,16)+' UTC';
  const depth=Number.isFinite(e.depthPct)?' · глубина '+e.depthPct.toFixed(2)+'%':'';
  paragraph('YL SWEEP '+time+depth+' · BTC @ '+e.btcPrice);
  for(const b of e.horizons){
   const fmt=n=>n===null?'—':(n>0?'+':'')+n.toFixed(2)+'%';
   paragraph('+'+b.minute+'m · BTC '+fmt(b.btc)+
      ' | ETH '+fmt(b.eth)+' | SOL '+fmt(b.sol)+
      (b.pending?' · ожидание закрытия':''));
  }
 }
 paragraph('Это наблюдаемые движения после события, не прибыль и не причинность. '+
   'Исторического breadth на момент SWEEP нет; дневные данные FRED не привязываются к минуте события.');
}
async function refresh(force=false){
 if(!visible()||busy)return;
 if(!force&&updated&&Date.now()-updated<25*60*1000){render();return;}
 busy=true;const controller=new AbortController();ac=controller;
 try{
  const response=await fetch('/api/v2/macro/daily',{
    signal:controller.signal,cache:'no-store',
    headers:{Accept:'application/json'}
  });
  if(!response.ok)throw Error('HTTP '+response.status);
  const data=await response.json();
  if(!data||typeof data!=='object'||!data.markets||typeof data.markets!=='object')
    throw Error('Invalid macro provider payload');
  if(controller.signal.aborted)return;
  cached=data;updated=Date.now();render();
 }catch(err){
  if(!controller.signal.aborted){
   cached=null;updated=Date.now();render();
   const note=document.getElementById('pMacroFREDNote');
   if(note)note.textContent='Данные FRED не получены ('+String(err).slice(0,75)+
     '). Не подменяем прошлой котировкой. Повторная попытка после паузы.';
  }
 }finally{
  if(ac===controller)ac=null;
  busy=false;
 }
}
function start(){
 const card=document.querySelector('[data-pressure-card="macro"]');
 if(!card)return;
 card.querySelector('.pressure-head')?.addEventListener('click',()=>{
   if(visible())refresh();else if(ac)ac.abort();
 });
 document.addEventListener('visibilitychange',()=>{
   if(document.hidden){if(ac)ac.abort();}
   else if(visible())refresh();
 });
 setInterval(()=>{if(visible())refresh();},5*60*1000);
 setTimeout(()=>refresh(),3000);
}
root.ASCEND_FRED_MACRO_UI=Object.freeze({refresh,render,renderReplay});
start();
})(typeof window!=='undefined'?window:globalThis);