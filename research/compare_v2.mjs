// ASCEND V2 comparative research -- reproducible offline, NO TRADING.
// Uses unchanged confirmation-engine-v2.js and choch-10m.js from this repository.
// Data are Binance USD-M futures, NOT MEXC. Previous UTC-day YH/YL are the only
// causal frozen liquidity levels reconstructed. This is NOT the full live UI CORE.
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';

const root=new URL('../',import.meta.url).pathname;
const scope={};
for(const f of ['confirmation-engine-v2.js','choch-10m.js','structure-evidence.js']){
  vm.runInNewContext(fs.readFileSync(root+f,'utf8'),scope,{filename:f});
}
const V2=scope.ASCEND_CONFIRMATION_V2,CH=scope.ASCEND_CHOCH_10M,ST=scope.ASCEND_STRUCTURE_EVIDENCE;
const MIN=60,IN=Date.parse('2026-10-07T00:00:00Z')/1000,
  OOS=Date.parse('2026-10-09T00:00:00Z')/1000,
  END=Date.parse('2026-10-11T00:00:00Z')/1000;
const CONFIG=Object.freeze({
  split:{warmup:'2026-10-06',in_sample:['2026-10-07','2026-10-09'],
    out_of_sample:['2026-10-09','2026-10-11']},
  feePerSide:0.0006,slippagePerSide:0.0003,maxBarsInPosition:720,
  minRR:2,volumeMultiple:1.2,FVGminATR:0.25,FVGmaxATR:1,
  oiWindowSec:900,cvdWindowMin:15,fvgTF:180
});
const stamp=x=>new Date(x*1000).toISOString();
const digest=s=>crypto.createHash('sha256').update(s).digest('hex');
const aggr=(one,tf)=>{
  const out=[];let g=[];
  for(const b of one){
    const start=Math.floor(b.time/tf)*tf;
    if(g.length&&Math.floor(g[0].time/tf)*tf!==start){
      if(g.length===tf/60&&g.every((c,i)=>c.time===g[0].time+i*60)&&g[0].time===Math.floor(g[0].time/tf)*tf)
        out.push({time:g[0].time,open:g[0].open,high:Math.max(...g.map(v=>v.high)),
          low:Math.min(...g.map(v=>v.low)),close:g.at(-1).close,
          volume:g.reduce((x,v)=>x+v.volume,0)});
      g=[];
    }
    g.push(b);
  }
  if(g.length===tf/60&&g[0].time%tf===0&&g.every((c,i)=>c.time===g[0].time+i*60))
    out.push({time:g[0].time,open:g[0].open,high:Math.max(...g.map(v=>v.high)),
      low:Math.min(...g.map(v=>v.low)),close:g.at(-1).close,
      volume:g.reduce((x,v)=>x+v.volume,0)});
  return out;
};
const takeClosed=(arr,step,asOf,limit=300)=>{
  let hi=arr.length,lo=0;
  while(lo<hi){const m=(lo+hi)>>1;if(arr[m].time+step<=asOf)lo=m+1;else hi=m;}
  return arr.slice(Math.max(0,lo-limit),lo);
};
const findAtOrBefore=(a,ts)=>{
  let lo=0,hi=a.length;
  while(lo<hi){const m=(lo+hi)>>1;if(a[m].time<=ts)lo=m+1;else hi=m;}
  return lo? a[lo-1]:null;
};
function prepared(file){
  const raw=fs.readFileSync(file,'utf8'),obj=JSON.parse(raw);
  if(obj.venue!=='BINANCE_USDM_FUTURES'||obj.candles.length!==7200)
    throw Error('invalid real dataset '+file);
  const one=obj.candles.map(x=>({time:x[0]/1000,open:x[1],high:x[2],
    low:x[3],close:x[4],volume:x[5],takerBuy:x[6]}));
  for(let i=1;i<one.length;i++)if(one[i].time-one[i-1].time!==60)
    throw Error('Kline gap '+obj.symbol+' '+i);
  for(const x of one){
    if(!(x.low>0&&x.low<=Math.min(x.open,x.close)&&
      x.high>=Math.max(x.open,x.close)&&x.takerBuy>=0&&x.takerBuy<=x.volume))
      throw Error('Invalid OHLCV '+obj.symbol+' '+x.time);
  }
  const oi=obj.oi.map(x=>({time:x[0]/1000+300,oi:x[1]}))
    .filter(x=>Number.isFinite(x.oi)&&x.oi>0)
    .sort((a,b)=>a.time-b.time);
  const five=aggr(one,300),fifteen=aggr(one,900),
    three=aggr(one,180),ten=aggr(one,600),thirty=aggr(one,1800);
  const days=new Map();
  for(const b of one){
    const start=Math.floor(b.time/86400)*86400;
    if(!days.has(start))days.set(start,{hi:b.high,lo:b.low});
    const d=days.get(start);d.hi=Math.max(d.hi,b.high);d.lo=Math.min(d.lo,b.low);
  }
  return {symbol:obj.symbol,one,oi,five,fifteen,three,ten,thirty,days,sha256:digest(raw)};
}
function frozenDay(p,asOf){
  const day=Math.floor(asOf/86400)*86400;
  const prev=p.days.get(day-86400);
  if(!prev||day<=p.one[0].time)return null;
  return {all:{uppers:[{key:'YH',side:'upper',level:prev.hi,freezeAt:day}],
    lowers:[{key:'YL',side:'lower',level:prev.lo,freezeAt:day}]}};
}
function oiDelta(p,asOf){
  const b=findAtOrBefore(p.oi,asOf),a=findAtOrBefore(p.oi,asOf-CONFIG.oiWindowSec);
  if(!b||!a||b.time-a.time>1800||b.time>asOf||a.time>asOf-CONFIG.oiWindowSec)return null;
  return (b.oi/a.oi)-1;
}
function cvdDelta(bars){
  if(bars.length<CONFIG.cvdWindowMin)return null;
  const w=bars.slice(-CONFIG.cvdWindowMin);
  if(!w.every(x=>Number.isFinite(x.takerBuy)&&x.takerBuy<=x.volume))return null;
  return w.reduce((s,b)=>s+2*b.takerBuy-b.volume,0);
}
function atr3(history,at){
  const prior=history.filter(x=>x.time+180<=at);
  if(prior.length<15)return null;
  const w=prior.slice(-15),tr=[];
  for(let i=1;i<w.length;i++)tr.push(Math.max(w[i].high-w[i].low,
    Math.abs(w[i].high-w[i-1].close),Math.abs(w[i].low-w[i-1].close)));
  return tr.reduce((a,b)=>a+b,0)/tr.length;
}
function fvgAfterChoch(p,report,asOf){
  const ch=report.steps.find(x=>x.name==='choch'),re=report.steps.find(x=>x.name==='retest');
  if(!ch?.at||!re?.at)return {qualifies:false,reason:'no_stage'};
  const touchAt=re.at-360; // 3m swing wing=2: confirmation 6m after the retest candle close
  const bars=p.three.filter(x=>x.time+180<=touchAt&&x.time+180>ch.at-180);
  const retestBar=p.three.find(x=>x.time+180===touchAt);
  if(!retestBar)return {qualifies:false,reason:'no_retest_bar'};
  const dir=report.side;
  for(let j=2;j<bars.length;j++){
    const a=bars[j-2],c=bars[j],knownAt=c.time+180;
    if(knownAt>touchAt||knownAt<=ch.at)continue;
    const low=dir==='LONG'?a.high:c.high;
    const high=dir==='LONG'?c.low:a.low;
    if(!(high>low))continue;
    const atr=atr3(p.three,knownAt);
    if(!atr)continue;
    const ratio=(high-low)/atr;
    if(ratio<CONFIG.FVGminATR||ratio>CONFIG.FVGmaxATR)continue;
    if(retestBar.high>=low&&retestBar.low<=high&&touchAt>knownAt)
      return {qualifies:true,at:knownAt,range:[low,high],atrRatio:ratio};
  }
  return {qualifies:false,reason:'no_causal_fvg_retest'};
}
function scenarioTrades(p,signals,type,windowStart,windowEnd){
  const trades=[];let blocked=0,overlap=0,censored=0,holdingUntil=windowStart;
  const minTime=p.one[0].time;
  for(const sig of signals){
    if(sig.asOf<windowStart||sig.asOf>=windowEnd)continue;
    if(type==='V2_FVG'&&!sig.fvg.qualifies){blocked++;continue;}
    if(type==='V2_CVD_OI'&&!sig.flow.qualifies){blocked++;continue;}
    if(type==='V2_BOOK_LIQ')continue;
    if(sig.asOf<holdingUntil){overlap++;continue;}
    const i=Math.round((sig.asOf-minTime)/60); // next 1m candle starts exactly at close of trigger
    const entryBar=p.one[i];
    if(!entryBar||entryBar.time!==sig.asOf||entryBar.time>=windowEnd){censored++;continue;}
    const dir=sig.side==='LONG'?1:-1;
    const entry=entryBar.open*(1+dir*CONFIG.slippagePerSide);
    const stop=sig.plan.stop,target=sig.plan.target,risk=(entry-stop)*dir,
      reward=(target-entry)*dir;
    if(!(risk>0&&reward/risk>=CONFIG.minRR)){blocked++;continue;}
    const endIndex=Math.min(p.one.length-1,i+CONFIG.maxBarsInPosition-1,
      Math.floor((windowEnd-minTime)/60)-1);
    let exitBar=p.one[endIndex],fill=exitBar.close,label='TIME_EXIT';
    for(let k=i;k<=endIndex;k++){
      const b=p.one[k];
      const sl=dir===1?b.low<=stop:b.high>=stop;
      const tp=dir===1?b.high>=target:b.low<=target;
      // Worst case if both limits touched in same 1m candle: STOP first.
      if(sl||tp){label=sl?'SL':'TP';fill=sl?stop:target;exitBar=b;break;}
    }
    const exit=fill*(1-dir*CONFIG.slippagePerSide);
    const gross=dir*(exit-entry);
    const fees=CONFIG.feePerSide*(entry+exit);
    const netR=(gross-fees)/risk;
    const trade={symbol:p.symbol,side:sig.side,signal_at:stamp(sig.asOf),
      entered_at:stamp(entryBar.time),exited_at:stamp(exitBar.time+60),entry,
      stop,target,exit,exit_reason:label,rr_at_fill:reward/risk,net_R:netR,
      fee_price_units:fees,slippage_pct_each:CONFIG.slippagePerSide*100,
      source_micro_at:stamp(sig.microAt),fvg:sig.fvg,flow:sig.flow};
    trades.push(trade);holdingUntil=exitBar.time+60;
  }
  return {trades,blocked,overlap,censored};
}
function metrics(trades){
  if(!trades.length)return {trades:0,wins:0,losses:0,win_rate:null,net_R:0,
    mean_R:null,profit_factor:null,max_drawdown_R:null,avg_hold_minutes:null,
    time_exits:0,unresolved:0};
  const wins=trades.filter(x=>x.net_R>0).length;
  let equity=0,peak=0,maxDD=0;
  for(const t of trades){equity+=t.net_R;peak=Math.max(peak,equity);maxDD=Math.max(maxDD,peak-equity);}
  const pos=trades.filter(x=>x.net_R>0).reduce((s,x)=>s+x.net_R,0);
  const neg=trades.filter(x=>x.net_R<0).reduce((s,x)=>s-x.net_R,0);
  return {trades:trades.length,wins,losses:trades.length-wins,
    win_rate:wins/trades.length,net_R:equity,mean_R:equity/trades.length,
    profit_factor:neg?pos/neg:null,max_drawdown_R:maxDD,
    avg_hold_minutes:trades.reduce((s,t)=>s+
      (Date.parse(t.exited_at)-Date.parse(t.entered_at))/60000,0)/trades.length,
    time_exits:trades.filter(t=>t.exit_reason==='TIME_EXIT').length,unresolved:0};
}
function scan(p){
  let chochCache=[],lastTenClose=0;
  const signals=[],stages={},asOfStart=Math.max(IN,p.one[0].time+24*3600);
  let reports=0,sweeps=0,preconditions=0,seenMicro=new Set(),lastDay=0;
  for(let asOf=asOfStart;asOf<END;asOf+=60){
    const levels=frozenDay(p,asOf);
    if(!levels)continue;
    const one=takeClosed(p.one,60,asOf,260);
    const five=takeClosed(p.five,300,asOf,400);
    const fifteen=takeClosed(p.fifteen,900,asOf,220);
    if(one.length<220||five.length<120||fifteen.length<60)continue;
    const ten=takeClosed(p.ten,600,asOf,300);
    if(ten.length&&ten.at(-1).time+600!==lastTenClose){
      lastTenClose=ten.at(-1).time+600;
      const res=CH.scan(ten,asOf);
      if(res.events)for(const ev of res.events)if(!chochCache.some(x=>x.at===ev.at&&x.dir===ev.dir))chochCache.push(ev);
      chochCache=chochCache.filter(x=>x.at>=asOf-21600);
    }
    // Do not call high-cost engine unless a frozen daily level was swept
    // during the last 3h and a causal 10m CHOCH followed it.
    const ses=V2.sweeps(one,levels,{},asOf).filter(x=>asOf-x.at<=10800);
    if(ses.length)sweeps++;
    if(!ses.some(x=>chochCache.some(c=>c.dir===x.dir&&c.at>x.at&&asOf>=c.at&&c.at-x.at<=10800)))continue;
    preconditions++;
    const t30=ST.snapshot(takeClosed(p.thirty,1800,asOf,120),1800,asOf).trend;
    const t15=ST.snapshot(fifteen,900,asOf).trend;
    const report=V2.analyze({symbol:p.symbol.replace('USDT','_USDT'),asOf,now:asOf,
      one,five,fifteen,levels,levelMeta:{YH:{freezeAt:Math.floor(asOf/86400)*86400},
        YL:{freezeAt:Math.floor(asOf/86400)*86400}},
      chochEvents:chochCache.filter(x=>x.at<=asOf),context:{t15,t30},
      feedStatuses:['LIVE','LIVE','LIVE']});
    reports++;
    const confirmed=report.steps.filter(x=>x.status==='CONFIRMED');
    for(const s of confirmed)stages[s.name]=(stages[s.name]||0)+1;
    if(!report.ready||report.status!=='CONFIRMED'||!report.plan)continue;
    const microAt=report.steps.find(x=>x.name==='micro')?.at;
    const key=report.side+':'+microAt+':'+Math.floor(asOf/86400);
    if(!microAt||seenMicro.has(key))continue;
    seenMicro.add(key);
    const cvd=cvdDelta(one),deltaOI=oiDelta(p,asOf),dir=report.side==='LONG'?1:-1;
    const flow={cvd15:cvd,oi15pct:deltaOI===null?null:deltaOI*100,
      qualifies:cvd!==null&&deltaOI!==null&&dir*cvd>0&&deltaOI>0};
    const fvg=fvgAfterChoch(p,report,asOf);
    signals.push({symbol:p.symbol,side:report.side,asOf,microAt,
      plan:report.plan,steps:report.steps.map(x=>({name:x.name,at:x.at,
        status:x.status})),fvg,flow});
  }
  return {signals,diagnostics:{minutes_scanned:(END-asOfStart)/60,
    sweep_windows:sweeps,choch_after_sweep_windows:preconditions,
    engine_evaluations:reports,stage_confirmations:stages,unique_ready:signals.length}};
}
const symbols=['BTCUSDT','ETHUSDT','SOLUSDT'];
const all=[];
for(const symbol of symbols){
  const p=prepared(root+'research/data/binance_'+symbol+'_20261006_20261010.json');
  const v=scan(p),per={symbol,sha256:p.sha256,data:{one:p.one.length,oi:p.oi.length,
    five:p.five.length,fifteen:p.fifteen.length},diagnostics:v.diagnostics};
  const scenarios={};
  for(const [label,start,end] of [['IN_SAMPLE',IN,OOS],['OOS',OOS,END]]){
    scenarios[label]={};
    for(const mode of ['BASE_V2','V2_FVG','V2_CVD_OI','V2_BOOK_LIQ']){
      if(mode==='V2_BOOK_LIQ'){
        scenarios[label][mode]={availability:'NO_DATA',
          reason:'Missing historical synchronized order-book and actual liquidation feeds',
          trades:null,statistics:null};
        continue;
      }
      const {trades,blocked,overlap,censored}=scenarioTrades(p,v.signals,mode,start,end);
      scenarios[label][mode]={availability:'TESTABLE',signal_count:v.signals.filter(x=>
        x.asOf>=start&&x.asOf<end).length,blocked_by_filter_or_RR:blocked,
        blocked_by_overlap:overlap,censored,statistics:metrics(trades),trades};
    }
  }
  per.scenarios=scenarios;all.push(per);
  console.log('SYMBOL '+symbol+' diagnostics '+JSON.stringify(per.diagnostics));
}
const summary={status:'RESEARCH_ONLY',engine:'ASCEND Confirmation Engine V2 unchanged',
  scope:'BINANCE USD-M FUTURES (NOT MEXC), previous UTC-day high/low only; UI legacy RSI/VWAP Core not replayed',
  config:CONFIG,samples:all,results:{}};
for(const segment of ['IN_SAMPLE','OOS']){
  summary.results[segment]={};
  for(const mode of ['BASE_V2','V2_FVG','V2_CVD_OI','V2_BOOK_LIQ']){
    if(mode==='V2_BOOK_LIQ'){summary.results[segment][mode]={availability:'NO_DATA'};continue;}
    const allTrades=all.flatMap(x=>x.scenarios[segment][mode].trades);
    summary.results[segment][mode]={availability:'TESTABLE',
      candidate_signals:all.reduce((s,x)=>s+x.scenarios[segment][mode].signal_count,0),
      blocked:all.reduce((s,x)=>s+x.scenarios[segment][mode].blocked_by_filter_or_RR,0),
      ...metrics(allTrades)};
  }
}
const output=root+'research/comparative_v2_results_20261012.json';
fs.writeFileSync(output,JSON.stringify(summary,null,2)+'\n','utf8');
console.log('SUMMARY '+JSON.stringify(summary.results));
console.log('RESULT_FILE '+output);
