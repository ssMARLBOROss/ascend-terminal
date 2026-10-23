/* ASCEND Historical Replay V1 — strict read-only research.  No broker operations. */
(function(root){
'use strict';
const D=86400,STEP=60,MAX_HISTORY=28*3600;
const valid=x=>Number.isFinite(x),fmt=t=>new Date(t*1000).toISOString();
function contiguous(raw,step,asOf){
 const rows=(Array.isArray(raw)?raw:[]).filter(b=>valid(Number(b?.time)) &&
   Number(b.time)%step===0 && Number(b.time)+step<=asOf &&
   ['open','high','low','close'].every(k=>valid(Number(b[k]))&&Number(b[k])>0))
   .map(b=>({time:Number(b.time),open:Number(b.open),high:Number(b.high),
     low:Number(b.low),close:Number(b.close),volume:Number(b.volume)}))
   .filter(b=>b.low<=Math.min(b.open,b.close)&&b.high>=Math.max(b.open,b.close)&&
     valid(b.volume)&&b.volume>=0).sort((a,b)=>a.time-b.time);
 const unique=[];for(const b of rows)if(!unique.length||b.time!==unique.at(-1).time)unique.push(b);
 let from=0;for(let i=1;i<unique.length;i++)if(unique[i].time!==unique[i-1].time+step)from=i;
 return unique.slice(from);
}
function completedRange(bars,start,end,step){
 const x=bars.filter(b=>b.time>=start&&b.time<end);
 if(x.length!==(end-start)/step||x[0]?.time!==start||x.at(-1)?.time!==end-step||
 x.some((b,i)=>b.time!==start+i*step))return null;
 return {high:Math.max(...x.map(z=>z.high)),low:Math.min(...x.map(z=>z.low))};
}
function frozenLevels(five,asOf){
 const day=Math.floor((asOf-1)/D)*D,levels={all:{uppers:[],lowers:[]}},levelMeta={};
 const candidates=[
  {prefix:'Y',start:day-D,end:day,high:'YH',low:'YL'},
  {prefix:'ON',start:day,end:day+6*3600,high:'ONH',low:'ONL'},
  {prefix:'RTH',start:asOf>=day+22*3600?day+13*3600:day-D+13*3600,
   end:asOf>=day+22*3600?day+22*3600:day-D+22*3600,high:'RTH_H',low:'RTH_L'},
  {prefix:'IB',start:day+13*3600,end:day+14*3600,high:'IBH',low:'IBL'}
 ];
 for(const g of candidates){
  if(asOf<g.end)continue;
  const ranges=completedRange(five,g.start,g.end,300);if(!ranges)continue;
  for(const [key,side,price] of [[g.high,'upper',ranges.high],[g.low,'lower',ranges.low]]){
   const item={key,side,level:price,freezeAt:g.end};
   levels.all[side==='upper'?'uppers':'lowers'].push(item);
   levelMeta[key]={freezeAt:g.end,origin:g.start,source:'MEXC_5M_CLOSED'};
  }
 }
 return {levels,levelMeta,ready:levels.all.uppers.length+levels.all.lowers.length,
   asOf,partial:levels.all.uppers.length+levels.all.lowers.length<8};
}
function dataHealth(raw,asOf){
 const checks=[['1m',60,40],['5m',300,40],['15m',900,21]];
 const prepared={},feed=[];
 for(const [tf,step,needed] of checks){
  const bars=contiguous(raw[tf],step,asOf);
  const maxStaleness=step+3;const fresh=bars.length&&asOf-(bars.at(-1).time+step)<maxStaleness;
  prepared[tf]=bars;feed.push(bars.length>=needed&&fresh?'LIVE':'NO DATA');
 }
 return {prepared,feed,complete:feed.every(s=>s==='LIVE')};
}
function assess(raw,asOf,symbol='BTC_USDT'){
 const engine=root.ASCEND_CONFIRMATION_V2,chochEngine=root.ASCEND_CHOCH_10M,
   struct=root.ASCEND_STRUCTURE_EVIDENCE;
 if(!engine||!chochEngine||!struct)return{status:'NO DATA',reason:'Не загружены ASCEND V2 / CHOCH / Structure Evidence'};
 const {prepared,feed,complete}=dataHealth(raw,asOf);
 const frozen=frozenLevels(raw['5m']||[],asOf);
 if(!complete)return{status:'NO DATA',reason:'Не хватает непрерывных закрытых свечей',feed,asOf,
  frozen,counts:Object.fromEntries(Object.entries(prepared).map(([k,v])=>[k,v.length]))};
 const fifteen=prepared['15m'],five=prepared['5m'],one=prepared['1m'];
 const ten=engine.combine(five,300,600,asOf);
 const thirty=engine.combine(fifteen,900,1800,asOf);
 const context={
  t15:struct.snapshot(fifteen,900,asOf).trend,
  t30:struct.snapshot(thirty,1800,asOf).trend
 };
 const choch=chochEngine.scan(ten,asOf);
 const report=engine.analyze({asOf,now:asOf,symbol,one,five,fifteen,
    chochEvents:choch.events,context,levels:frozen.levels,
    levelMeta:frozen.levelMeta,feedStatuses:feed});
 // Legacy historical BASE CORE confirmation is unavailable: never fabricate ENTER.
 const flag=report?.ready?'CANDIDATE':report?.status==='INVALIDATED'?'SKIP':
  report?.status==='NO DATA'?'NO DATA':'WAIT';
 return {status:flag,reason:report?.reason||'',asOf,symbol,context,choch,frozen,report,feed,
   steps:report?.steps||[],plan:report?.plan||null,
   entryReady:false,coreValidation:'NOT_REPLAYED',researchOnly:true};
}
function outcome(raw,side,plan,at,opts={}){
 const feePct=Number(opts.feePct??.12),slippagePct=Number(opts.slippagePct??.02);
 const horizon=Number(opts.horizonMin??240)*60;
 if(!['LONG','SHORT'].includes(side)||!plan||![plan.stop,plan.target].every(valid))return{status:'NO DATA'};
 const direction=side==='LONG'?1:-1;
 const all=(raw['1m']||[]).filter(x=>x.time>=at&&x.time<at+horizon).sort((a,b)=>a.time-b.time);
 if(!all.length||all[0].time!==at)return{status:'NO DATA',reason:'Нет свечи исполнения после сигнала'};
 const entry=Number(all[0].open)*(1+direction*slippagePct/100);
 const risk=direction*(entry-plan.stop),reward=direction*(plan.target-entry);
 if(risk<=0||reward<=0)return{status:'SKIP',reason:'Цена после триггера вышла за структурный стоп/цель'};
 const rrGross=reward/risk,rrNet=(reward-entry*feePct/100)/risk;
 if(rrNet<2)return{status:'SKIP',reason:'R:R с комиссией ниже 1:2',entry,stop:plan.stop,
  target:plan.target,rrGross,rrNet};
 let previousEnd=at;
 for(const bar of all){
  if(bar.time!==previousEnd)return{status:'NO DATA',reason:'Пропуск свечи — результат не установлен',entry,rrNet};
  previousEnd+=60;
  const sl=direction===1?bar.low<=plan.stop:bar.high>=plan.stop;
  const tp=direction===1?bar.high>=plan.target:bar.low<=plan.target;
  if(sl||tp){
   // Same candle touch of both levels: pessimistic stop-first convention.
   const exit=sl?plan.stop:plan.target;
   const pct=direction*(exit-entry)/entry*100-feePct-slippagePct;
   return {status:sl?'SL':'TP',entry,stop:plan.stop,target:plan.target,
    exit,exitAt:bar.time+60,feePct,slippagePct,netPct:pct,netR:(direction*(exit-entry)-entry*(feePct+slippagePct)/100)/risk,
    rrNet,simultaneous:sl&&tp,assumption:sl&&tp?'SL_FIRST':'OHLC_TOUCH'};
  }
 }
 return{status:all.length*60>=horizon?'TIMEOUT':'OPEN / NO DATA',
  entry,stop:plan.stop,target:plan.target,rrNet,asOf:previousEnd,
  reason:'После сигнала нет наблюдённого касания SL/TP; будущее не известно'};
}
root.ASCEND_MARKET_REPLAY_V1=Object.freeze({contiguous,completedRange,frozenLevels,dataHealth,assess,outcome,fmt});
})(typeof window!=='undefined'?window:globalThis);
