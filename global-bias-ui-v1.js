/* ASCEND GLOBAL TREND V1 UI. Observation only, never modifies Core / orders. */
(function(root){
  'use strict';
  const engine=root.ASCEND_GLOBAL_TREND_V1;
  if(!engine)return;
  const SYMBOLS=['BTC_USDT','ETH_USDT','SOL_USDT'];
  const BRANCH='GLOBAL PROXY V1 · RESEARCH';
  let data={},loadedAt=0,fetching=false,controller=null,lastSymbol='';
  const by=id=>document.getElementById(id);
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const tone=s=>s==='BULLISH'||s==='ALIGNED'?'up':s==='BEARISH'||s==='CONFLICT'?'down':s==='SHIFTING'||s==='CORRECTION'?'warn':'neutral';
  const sign=s=>s==='BULLISH'?'↑':s==='BEARISH'?'↓':s==='CORRECTION'?'↘':s==='SHIFTING'?'↔':'–';
  function mount(){
    const shell=by('chartShell'),chart=shell?.closest('.chart-card');
    if(!shell||!chart||by('ascGlobalBiasV1'))return false;
    const style=document.createElement('style');style.textContent=
      '#ascGlobalBiasV1{position:absolute;top:9px;right:62px;z-index:24;width:226px;max-width:calc(100% - 85px);padding:9px 10px;border:1px solid #31516b;border-radius:9px;background:rgba(3,12,25,.94);box-shadow:0 12px 27px #0009;pointer-events:none;color:#e4f3ff;font:11px system-ui,sans-serif}'+
      '#ascGlobalBiasV1 .ascgb-title{display:flex;justify-content:space-between;font-size:10px;font-weight:850;letter-spacing:.07em;color:#c7e6ef;margin-bottom:6px}'+
      '#ascGlobalBiasV1 .ascgb-row{display:flex;gap:8px;justify-content:space-between;align-items:center;padding:5px 0;border-top:1px solid #1b3447}'+
      '#ascGlobalBiasV1 .ascgb-row span:first-child{color:#aac3d5;white-space:nowrap}'+
      '#ascGlobalBiasV1 .ascgb-row b{font-size:10px;text-align:right}'+
      '#ascGlobalBiasV1 .up{color:#47e2ac}#ascGlobalBiasV1 .down{color:#ff7188}#ascGlobalBiasV1 .warn{color:#ffd067}#ascGlobalBiasV1 .neutral{color:#9eb7c9}'+
      '#ascGlobalBiasV1 .ascgb-note{font-size:9px;color:#acc0cc;line-height:1.35;margin-top:6px}'+
      '#ascGlobalBannerV1{display:flex;flex-wrap:wrap;gap:9px;align-items:center;padding:8px 10px;border:1px solid #254963;border-radius:7px;background:#071522;margin-bottom:7px;color:#d8e8f2;font-size:11px}'+
      '#ascGlobalBannerV1 b{color:#e1ecff}#ascGlobalBannerV1 strong{color:#ffd067}#ascGlobalBannerV1 em{font-style:normal;color:#8ca5b7;font-size:10px}'+
      '@media(max-width:820px){#ascGlobalBiasV1{top:6px;right:44px;width:180px;padding:7px;font-size:10px}#ascGlobalBiasV1 .ascgb-row{padding:3px 0}#ascGlobalBiasV1 .ascgb-note{font-size:8px}#ascGlobalBannerV1{font-size:10px}}';
    document.head.appendChild(style);
    const box=document.createElement('aside');
    box.id='ascGlobalBiasV1';box.setAttribute('aria-label','Контекст всего рынка и выбранной монеты');box.textContent='MARKET BIAS · загружаем данные';
    shell.appendChild(box);
    const banner=document.createElement('div');banner.id='ascGlobalBannerV1';banner.setAttribute('role','status');
    banner.textContent=BRANCH+' · Подключаем BTC, ETH, SOL';
    chart.insertBefore(banner,chart.querySelector('.chart-top')||chart.firstChild);
    return true;
  }
  async function fetchLeaders(){
    if(fetching||document.hidden||document.body.dataset.view!=='market')return;
    fetching=true;const ac=new AbortController();controller=ac;
    const results=await Promise.allSettled(SYMBOLS.flatMap(symbol=>
      ['1h','30m'].map(async timeframe=>{
        const response=await fetch('/api/v2/klines?symbol='+encodeURIComponent(symbol)+
          '&timeframe='+timeframe+'&limit=200',{cache:'no-store',signal:ac.signal});
        if(!response.ok)throw Error('HTTP '+response.status);
        const j=await response.json();
        if(j.symbol!==symbol||!Array.isArray(j.candles))throw Error('Неверный источник');
        return {symbol,timeframe,bars:j.candles};
      })));
    if(!ac.signal.aborted){
      // Atomic refresh: failed requests become NO_DATA, not old/stale prices.
      const next={};for(const symbol of SYMBOLS)next[symbol]={};
      for(const item of results)if(item.status==='fulfilled'){
        const val=item.value;next[val.symbol][val.timeframe]=val.bars;
      }
      data=next;loadedAt=Date.now();render();
    }
    if(controller===ac)controller=null;
    fetching=false;
  }
  function coinFrames(){
    if(typeof state==='undefined'||!state.tf)return {};
    const t=state.tf;
    let bars30=t['30m']||[];
    if(!bars30.length&&typeof qaAggregate==='function'&&Array.isArray(t['15m']))
      bars30=qaAggregate(t['15m'],900,1800);
    return {'30m':bars30,'15m':t['15m']||[],'5m':t['5m']||[]};
  }
  function render(){
    if(!mount())return;
    const box=by('ascGlobalBiasV1'),banner=by('ascGlobalBannerV1');
    const market=typeof state!=='undefined'&&state.breadth?state.breadth:null;
    const now=Date.now()/1000;
    // No assumption that a single-venue market feed represents world spot prices.
    const context=engine.evaluate({asOf:now,leaders:data,breadth:market,coin:coinFrames(),spot:null});
    const m=context.market,c=context.coin,a=context.alignment;
    const symbol=typeof state!=='undefined'?String(state.symbol||'').replace('_','/'):'—';
    const freshness=loadedAt?Math.floor((Date.now()-loadedAt)/1000):null;
    const fresh=loadedAt>0&&freshness<=300;
    const usable=fresh&&m.state!=='NO_DATA';
    const marketText=usable?m.state:'NO DATA';
    const coinText=c.status==='READY'?c.label:'NO DATA';
    const alignText=usable?a.state:'NO DATA';
    const score=usable&&Number.isFinite(m.score)?((m.score>0?'+':'')+m.score.toFixed(0)):'—';
    box.innerHTML='<div class="ascgb-title"><span>🌐 MARKET BIAS</span><span>V1</span></div>'+
      '<div class="ascgb-row"><span>🌐 GLOBAL</span><b class="'+tone(marketText)+'">'+sign(marketText)+' '+marketText+'</b></div>'+
      '<div class="ascgb-row"><span>🪙 '+esc(symbol)+'</span><b class="'+tone(coinText)+'">'+sign(coinText)+' '+esc(coinText)+'</b></div>'+
      '<div class="ascgb-row"><span>ALIGNMENT</span><b class="'+tone(alignText)+'">'+esc(alignText)+'</b></div>'+
      '<div class="ascgb-note">MEXC FUTURES + RADAR · PROXY, НЕ МЕЖБИРЖЕВОЙ ИНДЕКС<br>'+
      '30m / 1h · счёт '+score+' · покрытие '+Math.round(m.coverage*100)+'%'+
      (fresh?'':' · НЕТ СВЕЖЕГО СНИМКА')+'</div>';
    const story=!usable?'Нет подтверждённых свежих данных BTC / ETH / SOL.':
      alignText==='ALIGNED'?'Глобальный контекст и структура монеты совпадают.':
      alignText==='CONFLICT'?'Монета движется против общего направления.':
      alignText==='SHIFTING'?'Рынок или монета в переходной фазе; ждём структуру.':
      'Рынок в балансе или подтверждения недостаточны.';
    banner.innerHTML='<b>MARKET STATE</b><strong>'+esc(marketText)+
      (usable?' · '+score:'')+'</strong><span>'+esc(symbol)+' · '+esc(coinText)+'</span>'+
      '<span>ALIGNMENT · '+esc(alignText)+'</span><em>'+esc(story)+' · Не сигнал входа.</em>';
    // Expose an immutable read-only snapshot to facilitate diagnostics and future tests.
    root.ASCEND_GLOBAL_BIAS_LAST=Object.freeze({market:m,coin:c,alignment:a,loadedAt});
  }
  function start(){
    if(!mount()){setTimeout(start,1200);return}
    render();fetchLeaders();
    setInterval(()=>{if(!document.hidden&&document.body.dataset.view==='market'){
      if(Date.now()-loadedAt>100000)fetchLeaders();else render();
    }},12000);
    document.addEventListener('visibilitychange',()=>{if(document.hidden&&controller)controller.abort();else if(!document.hidden)fetchLeaders()});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})(window);