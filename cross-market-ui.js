/* Cross-market UI V1: throttled only while Market and Macro card are visible. */
(function(root){
'use strict';
const symbols=['BTC_USDT','ETH_USDT','SOL_USDT'];
let cached={},history={},updatedAt=0,busy=false,controller=null,previousBreadthKey='';
const get=id=>document.getElementById(id);
function show(id,value,tone=''){
  const el=get(id);if(el){el.textContent=value;el.className=tone;}
}
function signed(n){return (n>0?'+':'')+Number(n).toFixed(0)}
function tone(n){return n>8?'long':n< -8?'short':'neutral'}
function eligible(){
  const card=document.querySelector('[data-pressure-card="macro"]');
  return card&&!card.classList.contains('collapsed')&&
    !document.hidden&&document.body.dataset.view==='market';
}
function status(){
  if(!root.ASCEND_CROSS_MARKET)return;
  const current=Date.now();
  const freshness=updatedAt>0&&current-updatedAt<180000;
  const input=freshness?cached:{};
  const context=root.ASCEND_CROSS_MARKET.aggregate(input,
    typeof state!=='undefined'?state.breadth:null);
  const complete=context.score!==null&&context.score!==undefined;
  show('pMacroScore',complete?
    (context.conflict?'CONFLICT · ':'')+signed(context.score)+' '+context.direction:
    'CRYPTO · WAIT',!complete?'nodata':context.conflict?'risk':tone(context.score));
  for(const [symbol,id] of [['BTC_USDT','pMacroBTC'],['ETH_USDT','pMacroETH'],['SOL_USDT','pMacroSOL']]){
    const item=context.leaders[symbol];
    if(!item||item.status!=='READY'){show(id,'NO DATA · '+(item?.reason||'ожидаем 5m'),'nodata');continue;}
    show(id,item.shape+' · '+signed(item.score)+' · VWAP '+
      (item.above>0?'+':'')+item.above.toFixed(2)+'% · Δ1h '+
      (item.impulse===null?'—':(item.impulse>0?'+':'')+item.impulse.toFixed(2)+'%'),
      tone(item.score));
  }
  const b=context.breadth;
  show('pMacroBreadth',b.status==='READY'?
    'L '+b.long+' · S '+b.short+' · N '+b.neutral+
    ' / '+b.total+' · '+signed(b.pressure)+'%':
    'NO DATA · '+b.reason,b.status==='READY'?tone(b.pressure):'nodata');
  show('pMacroAgreement',complete?(context.conflict?'MARKET CONFLICT':
    context.direction+' · '+context.detail):
    'WAIT · нет трёх свежих лидеров',complete?(context.conflict?'risk':tone(context.score)):'nodata');
  show('pMacroTime',complete?new Date(context.asOf*1000).toISOString().slice(5,16).replace('T',' ')+' UTC':'—',complete?'':'nodata');
  const note=get('pMacroExplanation');
  if(note)note.textContent=complete?
    'CRYPTO CONTEXT (не макро): BTC 45%, ETH 35%, SOL 20%. '+
    (b.status==='READY'?'Breadth радара добавлен с весом 20%. ':
      'Breadth не подтверждён — оценка только BTC/ETH/SOL. ')+
    '5m HH/HL, дневной VWAP UTC, Δ1h и объём. Эвристика, НЕ ENTRY_READY.':
    'Подключаем BTC, ETH, SOL из MEXC 5m только при открытой карточке. Отсутствие данных блокирует оценку, не торговлю.';
}
async function refresh(force=false){
  if(!root.ASCEND_CROSS_MARKET||!eligible()||busy)return;
  if(!force&&updatedAt&&Date.now()-updatedAt<110000){status();return;}
  busy=true;
  const ac=new AbortController();controller=ac;
  const next={},nextHistory={};
  try{
    const req=await Promise.allSettled(symbols.map(async symbol=>{
      if(typeof state!=='undefined'&&symbol===state.symbol&&
        Array.isArray(state.tf['5m'])&&state.tf['5m'].length>=18)
        return state.tf['5m'];
      const res=await fetch('/api/v2/klines?symbol='+encodeURIComponent(symbol)+
        '&timeframe=5m&limit=320',{signal:ac.signal,cache:'no-store'});
      if(!res.ok)throw Error('HTTP '+res.status);
      const json=await res.json();
      if(json.symbol!==symbol||!Array.isArray(json.candles))
        throw Error('Неверный контракт MEXC');
      return json.candles;
    }));
    if(ac.signal.aborted)return;
    const now=Date.now()/1000;
    req.forEach((r,i)=>{
      const symbol=symbols[i];
      if(r.status==='fulfilled')nextHistory[symbol]=r.value;
      next[symbol]=r.status==='fulfilled'?
        root.ASCEND_CROSS_MARKET.leader(symbol,r.value,now):
        {symbol,status:'NODATA',reason:'API MEXC недоступен'};
    });
    cached=next;history=nextHistory;updatedAt=Date.now();
    status();
  }catch(err){
    if(!ac.signal.aborted)console.warn('Cross-Market data:',err);
  }finally{
    if(controller===ac)controller=null;
    busy=false;
  }
}
function start(){
  const card=document.querySelector('[data-pressure-card="macro"]');
  if(!card)return;
  card.querySelector('.pressure-head')?.addEventListener('click',()=>{
    // Original card handler is installed earlier; this executes afterwards.
    if(eligible())refresh();
    else if(controller)controller.abort();
  });
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden){if(controller)controller.abort();}
    else refresh();
  });
  // Only one low-frequency timer; no WebSocket, no chart redraw.
  setInterval(()=>{if(eligible())refresh();},120000);
  setTimeout(refresh,2200);
}
root.ASCEND_CROSS_MARKET_UI=Object.freeze({status,refresh,
  getHistory:()=>Date.now()-updatedAt<180000?history:{}});
start();
})(typeof window!=='undefined'?window:globalThis);