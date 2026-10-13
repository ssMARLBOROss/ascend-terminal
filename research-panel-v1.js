/* Research panel: independent of the ASCEND ENTRY READY and order path. */
(function(root){
  'use strict';
  const $=id=>document.getElementById(id);
  let loadedAt=0,loadedSym='',lastData=null,busy=false;
  let qualityData=null,qualityAt=0,qualityBusy=false;
  const number=(x,d=4)=>typeof x==='number'&&Number.isFinite(x)?x.toFixed(d):'—';
  function paint(){
    if(typeof state==='undefined'||document.body.dataset.view!=='market')return;
    const box=$('ascResearchFvg');
    if(!box)return;
    const q=typeof qaRows==='function'?qaRows(state.tf['1m']||[],'1m'):[];
    const asOf=q.at(-1)?.time+60;
    const engine=root.ASCEND_FVG_RESEARCH_V1;
    const report=engine&&Number.isFinite(asOf)?
      engine.observe(qaAggregate(q,60,180),asOf):null;
    if(!report||report.status==='NO DATA'){
      box.textContent='FVG · NO DATA · недостаточно закрытых 3m свечей';
    }else{
      const v=report.nearestActive,dir=v?.side||'—';
      box.textContent='FVG · '+report.small+' SMALL / '+report.large+' LARGE'+
        (v?' · '+dir+' '+v.cls+' · '+number(v.lower)+'–'+number(v.upper)+
          ' · '+v.status+' · fill '+number(v.fillFraction*100,1)+'%':
          ' · активных зон нет')+' · RESEARCH ONLY';
    }
    const h=$('ascResearchHistory');
    if(h){
      const done=(state.paperTrades||[]).filter(x=>x.status==='CLOSED'&&
        x.level_source==='V2_NEXT_FROZEN_LIQUIDITY');
      const pnl=done.reduce((a,x)=>a+(Number(x.realized)||0)-(Number(x.entry_fee)||0),0);
      const wins=done.filter(x=>(Number(x.realized)||0)-(Number(x.entry_fee)||0)>0).length;
      h.textContent='RESEARCH 100 · '+Math.min(done.length,100)+'/100 закрытых V2 SHADOW сделок'+
        (done.length?' · WR '+number(100*wins/done.length,1)+'% · P&L '+number(pnl,3)+' USDT':' · WR Н/Д')+
        ' · '+(done.length<100?'ВЫБОРКА МЕНЬШЕ 100 · результат предварительный':'ЦЕЛЬ 100 ДОСТИГНУТА · нужна независимая проверка')+
        ' · server SETUP пока NO DATA · исполнения не проверены';
    }
    const sweep=typeof latestConfirmationV2!=='undefined'?
      latestConfirmationV2?.steps?.find(x=>x.name==='sweep'&&x.status==='CONFIRMED'):null;
    if(report&&Number.isFinite(sweep?.at)){
      const after=engine.scan(qaAggregate(q,60,180),asOf).filter(z=>z.formedAt>sweep.at);
      box.textContent+=' · ПОСЛЕ SWEEP '+after.length+' / active '+after.filter(z=>z.status!=='FILLED').length;
    }
    const quality=$('ascResearchIntegrity');
    if(quality){
      const d=qualityData;
      if(!d||d.symbol!==state.symbol||Date.now()-qualityAt>=90000){
        quality.textContent='DATA HEALTH · NO DATA · ожидание проверки источника';
      }else if(d.status!=='READ_ONLY_AUDIT'){
        quality.textContent='DATA HEALTH · NO DATA · '+(d.reason||'проверка недоступна');
      }else{
        const candle=d.candles_1m||{},m=candle.mexc||{},b=candle.bybit||{},
              feeds=d.participation||{};
        quality.textContent='DATA HEALTH · MEXC 1m '+(m.status||'NO DATA')+
          ' '+(m.observed??0)+'/'+(m.expected??60)+' · пропусков '+(m.missing??'—')+
          ' · возраст '+(m.age_after_close_sec??'—')+'с'+
          ' · Bybit '+(b.status||'NO DATA')+' '+(b.observed??0)+'/'+(b.expected??60)+
          ' · CVD '+(feeds.cvd?.status||'NO DATA')+
          ' · OI '+(feeds.oi?.status||'NO DATA')+
          ' · BOOK '+(feeds.book?.status||'NO DATA')+
          ' · LIQ '+(feeds.liquidations?.status||'NO DATA')+
          ' · только контроль, не фильтр входа';
      }
    }
    const status=$('ascResearchParticipation');
    if(status){
      const d=lastData,valid=d&&d.symbol===state.symbol.replace('_','')&&
        Date.now()-loadedAt<90000;
      if(!valid)status.textContent='MARKET PARTICIPATION · NO DATA / ожидание сервера';
      else{
        const venue=d.venues||{},cvd=d.cvd,oi=d.delta_oi,book=d.order_book,liq=d.liquidations;
        status.textContent='CVD '+(cvd?.status||'NO DATA')+
          ' · ΔOI '+(oi?.change_pct==null?'NO DATA':number(oi.change_pct,2)+'%')+
          ' · BOOK '+(book?.source||'NO DATA')+'/'+(book?.status||'NO DATA')+
          ' · LIQ '+(liq?.source||'NO DATA')+'/'+(liq?.status||'NO DATA')+
          ' · '+(d.status||'NO DATA');
      }
    }
  }
  async function fetchOne(){
    if(typeof state==='undefined'||document.body.dataset.view!=='market'||busy)return;
    const symbol=String(state.symbol||'');
    if(!/^[A-Z0-9]+_USDT$/.test(symbol))return;
    busy=true;
    try{
      const res=await fetch('/api/v2/research/market-participation?symbol='+encodeURIComponent(symbol),
        {headers:{Accept:'application/json'},cache:'no-store'});
      if(!res.ok)throw Error(String(res.status));
      const d=await res.json();
      if(state.symbol!==symbol)return;
      lastData=d;loadedSym=symbol;loadedAt=Date.now();
    }catch(_){lastData=null;loadedAt=0}
    finally{busy=false;paint()}
  }
  async function fetchQuality(){
    if(typeof state==='undefined'||document.body.dataset.view!=='market'||qualityBusy)return;
    const symbol=String(state.symbol||'');
    if(!/^[A-Z0-9]+_USDT$/.test(symbol))return;
    qualityBusy=true;
    try{
      const res=await fetch('/api/v2/research/data-quality?symbol='+encodeURIComponent(symbol)+'&minutes=60',
        {headers:{Accept:'application/json'},cache:'no-store'});
      if(!res.ok)throw Error(String(res.status));
      const d=await res.json();
      if(state.symbol!==symbol)return;
      qualityData=d;qualityAt=Date.now();
    }catch(_){qualityData=null;qualityAt=0}
    finally{qualityBusy=false;paint()}
  }
  function start(){
    setInterval(paint,8000);
    setInterval(fetchOne,30000);
    setInterval(fetchQuality,30000);
    setTimeout(fetchOne,1300);
    setTimeout(fetchQuality,1700);
    paint();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
  root.ASCEND_RESEARCH_UI_V1=Object.freeze({paint,refresh:fetchOne,refreshQuality:fetchQuality});
})(typeof window!=='undefined'?window:globalThis);
