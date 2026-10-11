/* ASCEND V2 setup decision: the only actionable research decision for UI/manual shadow.
   Fail closed on missing/stale/mismatched evidence and on price drift from 1m micro-BOS.
   NO orders or Telegram messages. Legacy calculations remain context and veto, never grant READY. */
(function(root){
  'use strict';
  const finite=v=>typeof v==='number'&&Number.isFinite(v);
  const STAGES=['context','sweep','choch','mss','retest','micro','risk'];
  const MAX_PRICE_DRIFT_R=.25;
  function resolve(input={}){
    const {report,legacy,symbol,asOf,now,price}=input;
    const blocked=(status,reason)=>({status,ready:false,reason,
      symbol:symbol||null,side:report?.side||null,asOf,plan:null,
      steps:Array.isArray(report?.steps)?report.steps:[]});
    if(!symbol||!finite(asOf)||!finite(now)||!finite(price)||price<=0)
      return blocked('NO DATA','Нет актуальной закрытой цены 1m или времени');
    if(!report||report.symbol!==symbol||report.asOf!==asOf)
      return blocked('WAIT','Нет V2 именно для этой монеты и закрытой минуты');
    if(now<asOf-2||now-asOf>180)
      return blocked('WAIT','Данные подтверждения устарели');
    if(report.status==='INVALIDATED')return blocked('INVALIDATED',report.reason||'Структура нарушена');
    if(report.ready!==true||report.status!=='CONFIRMED')
      return blocked('WAIT',report.reason||'Ожидание V2');
    if(!['LONG','SHORT'].includes(report.side))
      return blocked('WAIT','Нет направления V2');
    if(!Array.isArray(report.steps)||report.steps.length!==STAGES.length||
      report.steps.some((s,i)=>s?.name!==STAGES[i]||s.status!=='CONFIRMED'))
      return blocked('WAIT','Не все 7 подтверждений V2 завершены');
    const times=report.steps.slice(1,6).map(x=>x.at);
    if(times.some(x=>!finite(x))||times.some((x,i)=>i>0&&x<=times[i-1])||
       times.at(-1)>asOf)
      return blocked('WAIT','Порядок или время событий V2 некорректны');
    if(!legacy?.confirmed||legacy.side!==report.side)
      return blocked('WAIT CORE','V2 подтверждён, но базовые фильтры не согласованы');
    const p=report.plan,entry=p?.entry,stop=p?.stop,target=p?.target;
    if(!finite(entry)||!finite(stop)||!finite(target)||!finite(p?.rr))
      return blocked('WAIT','Нет полного структурного плана V2');
    const dir=report.side==='LONG'?1:-1;
    const originalRisk=(entry-stop)*dir;
    const risk=(price-stop)*dir, reward=(target-price)*dir;
    if(originalRisk<=0||risk<=0||reward<=0)
      return blocked('INVALIDATED','Цена исполнения вышла за пределы структурного SL/TP');
    const driftR=Math.abs(price-entry)/originalRisk;
    if(driftR>MAX_PRICE_DRIFT_R)
      return blocked('WAIT PRICE','Цена ушла дальше 0.25R от 1m подтверждения');
    const rr=reward/risk;
    if(rr<2)return blocked('WAIT R:R','С учётом текущей цены R:R ниже 1:2');
    return {status:'ENTRY READY',ready:true,reason:'7 этапов V2 + CORE + актуальная цена',
      symbol,side:report.side,asOf,steps:report.steps,
      plan:{entry:price,triggerEntry:entry,stop,target,rr,driftR,
        microAt:times.at(-1),source:'CONFIRMATION_V2_FROZEN_LIQUIDITY'}};
  }
  root.ASCEND_SETUP_DECISION_V2=Object.freeze({resolve,MAX_PRICE_DRIFT_R,STAGES});
})(typeof window!=='undefined'?window:globalThis);
