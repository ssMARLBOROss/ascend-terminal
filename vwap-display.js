/* ASCEND VWAP Display V1: UTC daily VWAP, OHLCV approximation from CLOSED 5m MEXC candles only.
   Read-only presentation; does not modify legacy trading Core or order routing. */
(function(root){
  'use strict';
  const STEP=300,DAY=86400;
  const timeframes={'1m':60,'5m':300,'10m':600,'15m':900,'30m':1800,'1h':3600,'4h':14400};
  const valid=n=>Number.isFinite(Number(n));
  function daily(rows,asOf){
    if(!Array.isArray(rows)||!Number.isFinite(asOf)||asOf<=0)return null;
    const start=Math.floor(asOf/DAY)*DAY;
    const history=rows.filter(b=>valid(b.time)&&Number(b.time)>=start&&
      Number(b.time)+STEP<=asOf).sort((a,b)=>Number(a.time)-Number(b.time));
    if(!history.length||Number(history[0].time)!==start)return null;
    let cumulativePV=0,cumulativeVol=0;
    const points=[];
    for(let i=0;i<history.length;i++){
      const b=history[i],time=Number(b.time);
      // Never interpolate an absent bar or fill it using future 5m data.
      if(time!==start+i*STEP)return null;
      const high=Number(b.high),low=Number(b.low),close=Number(b.close),volume=Number(b.volume);
      if(![high,low,close,volume].every(Number.isFinite)||
         low<=0||high<low||close<low||close>high||volume<0)return null;
      const typical=(high+low+close)/3;
      cumulativePV+=typical*volume;
      cumulativeVol+=volume;
      if(cumulativeVol>0){
        points.push({closeAt:time+STEP,value:cumulativePV/cumulativeVol});
      }
    }
    if(!points.length)return null;
    return {dayStart:start,closeAt:points.at(-1).closeAt,
      value:points.at(-1).value,volume:cumulativeVol,points,source:'5m OHLCV (HLC3)'};
  }
  function project(dailySnapshot,chartBars,timeframe){
    const seconds=timeframes[timeframe];
    if(!dailySnapshot||!seconds||!Array.isArray(chartBars))return [];
    const bars=chartBars.filter(b=>valid(b.time)).sort((a,b)=>Number(a.time)-Number(b.time));
    const result=[],points=dailySnapshot.points;
    let current,idx=0;
    for(const b of bars){
      const time=Number(b.time),end=time+seconds;
      if(time<dailySnapshot.dayStart)continue;
      while(idx<points.length&&points[idx].closeAt<=end){
        current=points[idx].value;idx++;
      }
      // The value used by each historic bar existed at or before its close.
      if(current!==undefined&&Number.isFinite(current))
        result.push({time,value:current});
    }
    return result;
  }
  function relationship(price,dailySnapshot){
    const value=dailySnapshot?.value;
    if(!Number.isFinite(Number(price))||!Number.isFinite(value)||value<=0)return null;
    const distance=(Number(price)/value-1)*100;
    return {value,distancePct:distance,
      position:distance>0?'ABOVE':distance<0?'BELOW':'AT'};
  }
  root.ASCEND_DAILY_VWAP=Object.freeze({daily,project,relationship});
})(typeof window!=='undefined'?window:globalThis);
