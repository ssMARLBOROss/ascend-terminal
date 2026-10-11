/* ASCEND Session High / Low V1
 * Uses only existing closed MEXC 5m/15m OHLCV; never fabricates missing candles.
 * Session windows must be passed in from the existing terminal SESSION_DEFS.
 * All values are observations, not trade or liquidity sweep confirmations.
 */
(function(root){
  'use strict';
  const STEP5=300,STEP15=900,DAY=86400;
  const NAMES={sydney:'СИДНЕЙ',asia:'АЗИЯ',london:'ЛОНДОН',ny:'НЬЮ-ЙОРК'};
  const COLORS={
    sydney:'#9c94ef',asia:'#56a9ee',london:'#f2ca72',ny:'#58ddac'
  };
  function clean(rows,step,asOf){
    if(!Array.isArray(rows))return [];
    const out=[],seen=new Set();
    for(const r of rows){
      const t=Number(r?.time),h=Number(r?.high),l=Number(r?.low),
        c=Number(r?.close);
      if(![t,h,l,c].every(Number.isFinite)||t<0||t%step!==0||
        l<=0||h<l||c<l||c>h||t+step>asOf||seen.has(t))continue;
      seen.add(t);out.push({time:t,high:h,low:l});
    }
    return out.sort((a,b)=>a.time-b.time);
  }
  function computeWindow(win,bars5,bars15,asOf){
    const start=Number(win?.start),end=Number(win?.end);
    if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||
      end-start>DAY||start>asOf)return null;
    const cutoff=Math.min(end,asOf);
    const closed=end<=asOf;
    for(const [step,bars] of [[STEP5,bars5],[STEP15,bars15]]){
      if(start%step!==0||end%step!==0)continue;
      const usedEnd=Math.floor(cutoff/step)*step;
      const count=(usedEnd-start)/step;
      if(count<1||!Number.isInteger(count))continue;
      // Strict start coverage and full continuity until last COMPLETED candle.
      const group=bars.filter(x=>x.time>=start&&x.time<usedEnd);
      if(group.length!==count||group.some((x,i)=>x.time!==start+i*step))
        continue;
      let high=-Infinity,low=Infinity,highAt=null,lowAt=null;
      for(const b of group){
        if(b.high>high){high=b.high;highAt=b.time+step;}
        if(b.low<low){low=b.low;lowAt=b.time+step;}
      }
      if(!Number.isFinite(high)||!Number.isFinite(low))continue;
      return {high,low,highAt,lowAt,start,end,
        observedUntil:usedEnd,status:closed?'FROZEN':'LIVE',
        timeframe:step===STEP5?'5m':'15m',complete:closed,
        coveragePct:Math.round(Math.min(1,(usedEnd-start)/(end-start))*10000)/100};
    }
    return null;
  }
  function build({windows,bars5,bars15,asOf,price}){
    if(!Array.isArray(windows)||!Number.isFinite(asOf))
      return {asOf,rows:[],reason:'NO DATA'};
    const five=clean(bars5,STEP5,asOf),fifteen=clean(bars15,STEP15,asOf);
    const rows=windows.slice(0,8).map(win=>{
      const key=win.key,cycle=win.cycle;
      const observation=computeWindow(win,five,fifteen,asOf);
      const pct=(v)=>Number.isFinite(price)&&price>0&&Number.isFinite(v)?
        (price/v-1)*100:null;
      return {key,cycle,name:NAMES[key]||key,
        color:COLORS[key]||'#a3bdd0',start:win.start,end:win.end,
        ...(observation||{}),
        status:observation?.status||'NO DATA',
        fromPriceToHighPct:pct(observation?.high),
        fromPriceToLowPct:pct(observation?.low),
        reason:observation?null:'Нет непрерывной закрытой истории от начала сессии'};
    });
    return {asOf,rows,
      usable:rows.filter(x=>x.status==='LIVE'||x.status==='FROZEN').length};
  }
  root.ASCEND_SESSION_HL=Object.freeze({clean,computeWindow,build,NAMES,COLORS});
})(typeof window!=='undefined'?window:globalThis);