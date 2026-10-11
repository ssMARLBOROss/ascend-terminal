/* ASCEND Capital Flow V1: view-only MEXC samples. Never feeds the trading Core. */
(function(root){
'use strict';
const get=id=>document.getElementById(id);
let activeSymbol='',updatedAt=0,current=null,controller=null,busy=false;
function visible(){
 const card=document.querySelector('[data-pressure-card="capital"]');
 return !!card&&!card.classList.contains('collapsed')&&!document.hidden&&
   document.body.dataset.view==='market';
}
function put(id,message,kind='nodata'){
 const target=get(id);if(!target)return;
 target.textContent=message;target.className=kind;
}
function fmt(x){
 if(!Number.isFinite(Number(x)))return '—';
 const n=Number(x),a=Math.abs(n);
 return (n<0?'-':'')+(a>=1e9?(a/1e9).toFixed(2)+'B':
   a>=1e6?(a/1e6).toFixed(2)+'M':
   a>=1e3?(a/1e3).toFixed(2)+'K':
   a.toLocaleString('en-US',{maximumFractionDigits:3}));
}
function direction(x){return x>0?'long':x<0?'short':'neutral'}
function reset(){
 const pending=['pCapitalSpot','pCapitalFutures','pCapitalSpotRatio',
   'pCapitalTradeDelta','pCapitalOI','pCapitalFunding'];
 for(const id of pending)put(id,'Ожидание MEXC');
 put('pCapitalCVD','NO DATA · нужна непрерывная лента');
 put('pCapitalLiquidations','NO DATA · нет подтверждённого потока');
 put('pCapitalSample','Последние сделки, не полный CVD');
}
function render(){
 if(!visible())return;
 if(!current||current.symbol!==activeSymbol||Date.now()-updatedAt>90000){
   reset();return;
 }
 const spot=current.spot||{},fut=current.futures||{},deals=current.recent_trades||{};
 put('pCapitalSpot',spot.status==='READY'?
   fmt(spot.quote_turnover_24h_usdt)+' USDT · 24ч':'NO DATA · '+(spot.reason||'нет spot котировок'),
   spot.status==='READY'?'neutral':'nodata');
 put('pCapitalFutures',fut.turnover_24h_usdt!==null&&Number.isFinite(fut.turnover_24h_usdt)?
   fmt(fut.turnover_24h_usdt)+' USDT · 24ч':'NO DATA · нет turnover',
   fut.turnover_24h_usdt!==null?'neutral':'nodata');
 put('pCapitalSpotRatio',Number.isFinite(current.futures_to_spot_turnover_ratio)?
   current.futures_to_spot_turnover_ratio.toFixed(2)+'× · Futures / Spot':
   'NO DATA · объёмы несопоставимы',
   Number.isFinite(current.futures_to_spot_turnover_ratio)?'neutral':'nodata');
 if(deals.status==='READY'){
   const delta=Number(deals.sample_delta_contracts);
   put('pCapitalTradeDelta','BUY '+fmt(deals.buy_contracts)+' / SELL '+
     fmt(deals.sell_contracts)+' · Δ '+(delta>0?'+':'')+fmt(delta)+' контр.',direction(delta));
   put('pCapitalSample',deals.trade_count+' последних сделок · '+
     deals.sample_window_sec.toFixed(1)+' сек · MEXC Futures','neutral');
 }else{
   put('pCapitalTradeDelta','NO DATA · '+(deals.reason||'нет сделок'));
   put('pCapitalSample','Выборка сделок недоступна');
 }
 put('pCapitalCVD','NO DATA · нужен непрерывный поток сделок');
 put('pCapitalOI',fut.open_interest_contracts!==null&&
   Number.isFinite(fut.open_interest_contracts)?
   fmt(fut.open_interest_contracts)+' контр. · ΔOI не рассчитан':
   'NO DATA · нет OI',fut.open_interest_contracts!==null?'neutral':'nodata');
 put('pCapitalFunding',fut.funding_pct!==null&&Number.isFinite(fut.funding_pct)?
   (fut.funding_pct>0?'+':'')+fut.funding_pct.toFixed(4)+'% · MEXC':
   'NO DATA · нет funding',fut.funding_pct!==null?direction(fut.funding_pct):'nodata');
 put('pCapitalLiquidations','NO DATA · нет подтверждённого потока');
 const stamp=get('pCapitalObservationTime');
 if(stamp)stamp.textContent='MEXC · '+new Date(current.as_of_ms).toISOString().slice(11,19)+
   ' UTC · выборка не является полной историей потока';
}
async function refresh(force=false){
 if(!visible())return;
 const symbol=typeof state==='undefined'?null:state.symbol;
 if(!symbol)return;
 if(controller&&activeSymbol!==symbol)controller.abort();
 if(busy)return;
 if(!force&&activeSymbol===symbol&&Date.now()-updatedAt<30000){
   render();return;
 }
 activeSymbol=symbol;reset();
 const ac=new AbortController();controller=ac;busy=true;
 try{
   const r=await fetch('/api/v2/capital-flow?symbol='+encodeURIComponent(symbol),
     {signal:ac.signal,cache:'no-store',headers:{Accept:'application/json'}});
   if(!r.ok)throw Error('HTTP '+r.status);
   const data=await r.json();
   if(ac.signal.aborted||data.symbol!==symbol||state.symbol!==symbol)return;
   current=data;updatedAt=Date.now();render();
 }catch(err){
   if(!ac.signal.aborted){
     current=null;updatedAt=Date.now();
     put('pCapitalSample','Данные недоступны · '+String(err).slice(0,55));
   }
 }finally{
   if(controller===ac)controller=null;
   busy=false;
 }
}
function start(){
 const card=document.querySelector('[data-pressure-card="capital"]');
 if(!card)return;
 card.querySelector('.pressure-head')?.addEventListener('click',()=>{
   if(!visible()&&controller)controller.abort();
   else setTimeout(()=>refresh(true),0);
 });
 document.addEventListener('visibilitychange',()=>{
   if(document.hidden&&controller)controller.abort();
   if(!document.hidden)refresh();
 });
 setInterval(()=>{if(visible())refresh();},30000);
 setTimeout(()=>refresh(),1600);
}
root.ASCEND_CAPITAL_FLOW_UI=Object.freeze({refresh,render});
start();
})(typeof window!=='undefined'?window:globalThis);