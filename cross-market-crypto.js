/* ASCEND Cross-Market Crypto Context V1; read-only research, no signal gating. */
(function(root){
'use strict';
const DAY=86400,STEP=300;
const MAJORS=['BTC_USDT','ETH_USDT','SOL_USDT'];
const weights={BTC_USDT:.45,ETH_USDT:.35,SOL_USDT:.20};
const sign=n=>n>0?1:n<0?-1:0;
function barsClosed(source,asOf){
  if(!Number.isFinite(asOf)||!Array.isArray(source))return [];
  const bars=source.filter(x=>Number.isFinite(Number(x.time))&&
     Number(x.time)+STEP<=asOf)
     .map(x=>({time:Number(x.time),open:Number(x.open),high:Number(x.high),
        low:Number(x.low),close:Number(x.close),volume:Number(x.volume)}))
     .filter(x=>[x.time,x.open,x.high,x.low,x.close,x.volume].every(Number.isFinite)&&
       x.low>0&&x.high>=x.low&&x.open>=x.low&&x.open<=x.high&&
       x.close>=x.low&&x.close<=x.high&&x.volume>=0)
     .sort((a,b)=>a.time-b.time);
  const dedup=[];
  for(const b of bars)if(!dedup.length||b.time>dedup.at(-1).time)dedup.push(b);
  let start=0;
  for(let i=1;i<dedup.length;i++)
    if(dedup[i].time-dedup[i-1].time!==STEP)start=i;
  return dedup.slice(start);
}
function pivots(bars){
  const hi=[],lo=[];
  for(let i=2;i<bars.length-2;i++){
    const c=bars[i],near=bars.slice(i-2,i).concat(bars.slice(i+1,i+3));
    if(near.every(b=>b.high<c.high))hi.push({p:c.high,at:bars[i+2].time+STEP});
    if(near.every(b=>b.low>c.low))lo.push({p:c.low,at:bars[i+2].time+STEP});
  }
  return {hi,lo};
}
function leader(symbol,source,now){
  const asOf=Math.floor(now/STEP)*STEP;
  const rows=barsClosed(source,asOf);
  const latest=rows.at(-1);
  if(!latest||asOf-latest.time-STEP>2*STEP||rows.length<18)
    return {symbol,status:'NODATA',reason:'История 5m неполная или устарела'};
  const today=Math.floor(latest.time/DAY)*DAY;
  const day=rows.filter(x=>x.time>=today);
  if(!day.length||day[0].time!==today||
    day.some((b,i)=>b.time!==today+i*STEP))
    return {symbol,status:'NODATA',reason:'Нет непрерывной истории с 00:00 UTC'};
  let totalPV=0,totalVol=0;
  for(const b of day){const typical=(b.high+b.low+b.close)/3;
    totalPV+=typical*b.volume;totalVol+=b.volume;}
  if(totalVol<=0)return {symbol,status:'NODATA',reason:'Отсутствует дневной объём'};
  const vwap=totalPV/totalVol;
  const price=latest.close,above=(price/vwap-1)*100;
  const impulse=rows.length>=13?(price/rows.at(-13).close-1)*100:null;
  const tail=rows.slice(-20),meanVol=tail.length===20?
    tail.reduce((s,b)=>s+b.volume,0)/20:0;
  const volx=meanVol>0?latest.volume/meanVol:null;
  const p=pivots(rows);
  const highs=p.hi.slice(-2),lows=p.lo.slice(-2);
  const shape=highs.length===2&&lows.length===2?
    (highs[1].p>highs[0].p&&lows[1].p>lows[0].p?'HH/HL':
    highs[1].p<highs[0].p&&lows[1].p<lows[0].p?'LH/LL':'MIXED'):
    'UNCONFIRMED';
  const trend=shape==='HH/HL'?'LONG':shape==='LH/LL'?'SHORT':'NEUTRAL';
  const momentum=impulse===null?0:Math.abs(impulse)<.10?0:sign(impulse);
  const vwapSide=Math.abs(above)<.05?0:sign(above);
  const volumeSupport=volx!==null&&volx>=1.8?momentum:0;
  const score=(trend==='LONG'?40:trend==='SHORT'?-40:0)+
    vwapSide*25+momentum*20+volumeSupport*15;
  return {symbol,status:'READY',price,vwap,above,impulse,volx,trend,shape,
    score,asOf:latest.time+STEP,source:'MEXC futures 5m OHLCV'};
}
function breadthScore(raw){
  if(!raw||raw.source==='fallback'||raw.running===false)
    return {status:'NODATA',reason:'Radar breadth не подтверждён'};
  const long=Number(raw.long),short=Number(raw.short),neutral=Number(raw.neutral),
    available=Number(raw.available);
  if(![long,short,neutral,available].every(Number.isFinite)||
    Math.min(long,short,neutral)<0||available<=0||
    long+short+neutral!==available)
    return {status:'NODATA',reason:'Не совпадает выборка breadth'};
  const pressure=(long-short)/available*100;
  return {status:'READY',long,short,neutral,total:available,pressure,
    source:'ASCEND reversal radar snapshot',cycle:raw.cycle??null};
}
function aggregate(leaders,rawBreadth){
  const valid=MAJORS.map(n=>leaders[n]).filter(x=>x?.status==='READY');
  const breadth=breadthScore(rawBreadth);
  if(valid.length!==3)
    return {status:'PARTIAL',leaders,breadth,score:null,conflict:false,
      detail:'Для Cross-Market нужны свежие BTC · ETH · SOL (5m)'};
  const majors=valid.reduce((sum,row)=>sum+row.score*weights[row.symbol],0);
  const withBreadth=breadth.status==='READY'?
    Math.round(majors*.8+breadth.pressure*.2):Math.round(majors);
  const directions=valid.map(x=>x.score>8?'LONG':x.score< -8?'SHORT':'NEUTRAL');
  const longs=directions.filter(x=>x==='LONG').length,
    shorts=directions.filter(x=>x==='SHORT').length;
  const divergent=longs>0&&shorts>0;
  const contradicts=breadth.status==='READY'&&
    Math.abs(breadth.pressure)>=20&&Math.abs(majors)>=20&&
    sign(breadth.pressure)!==sign(majors);
  const conflict=divergent||contradicts;
  const score=Math.min(100,Math.max(-100,withBreadth));
  const direction=score>15?'LONG':score< -15?'SHORT':'NEUTRAL';
  return {status:breadth.status==='READY'?'READY':'PARTIAL',leaders,breadth,
    score,direction,conflict,
    detail:conflict?'MARKET CONFLICT':
      'Crypto context · '+(breadth.status==='READY'?'BTC/ETH/SOL + radar breadth':'BTC/ETH/SOL only'),
    weights,asOf:Math.min(...valid.map(x=>x.asOf))};
}
root.ASCEND_CROSS_MARKET=Object.freeze({leader,aggregate,breadthScore,barsClosed});
})(typeof window!=='undefined'?window:globalThis);