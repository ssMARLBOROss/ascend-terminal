/* ASCEND FVG Research V1: closed 3m candles only; NEVER an entry gate. */
(function(root){
  'use strict';
  const N=Number.isFinite;
  function atrAt(bars,i,length=14){
    if(i<length)return null;
    let sum=0;
    for(let k=i-length+1;k<=i;k++){
      const b=bars[k],prev=bars[k-1];
      if(!b||!prev)return null;
      sum+=Math.max(b.high-b.low,Math.abs(b.high-prev.close),Math.abs(b.low-prev.close));
    }
    return sum/length;
  }
  function scan(bars,asOf,{minATR=.25,maxATR=1,limit=80}={}){
    if(!Array.isArray(bars)||!N(asOf))return [];
    // Exclude the currently forming candle even if the caller included it.
    const history=bars.filter(b=>b&&N(b.time)&&b.time+180<=asOf&&
      [b.open,b.high,b.low,b.close].every(x=>N(x)&&x>0)&&
      b.low<=Math.min(b.open,b.close)&&b.high>=Math.max(b.open,b.close))
      .sort((a,b)=>a.time-b.time);
    const result=[];
    for(let i=16;i<history.length;i++){
      const a=history[i-2],b=history[i-1],c=history[i],atr=atrAt(history,i);
      if(!atr||a.time+180!==b.time||b.time+180!==c.time)continue;
      const bull=c.low>a.high,bear=c.high<a.low;
      if(!bull&&!bear)continue;
      const lower=bull?a.high:c.high,upper=bull?c.low:a.low;
      const sizeATR=(upper-lower)/atr;
      const cls=sizeATR>=minATR&&sizeATR<.5?'SMALL':
        sizeATR>=.5&&sizeATR<=maxATR?'LARGE':'OTHER';
      const zone={side:bull?'LONG':'SHORT',lower,upper,sizeATR,cls,
        formedAt:c.time+180,sourceTF:'3m',status:'OPEN',firstTouchAt:null,
        fillFraction:0,lastTouchAt:null};
      // Only future fully closed candles may mitigate the zone.
      for(let j=i+1;j<history.length;j++){
        const next=history[j];
        if(next.time!==history[j-1].time+180)break; // incomplete session
        if(next.high<lower||next.low>upper)continue;
        const at=next.time+180;
        if(zone.firstTouchAt===null)zone.firstTouchAt=at;
        zone.lastTouchAt=at;
        const part=bull?(upper-next.low)/(upper-lower):
          (next.high-lower)/(upper-lower);
        zone.fillFraction=Math.min(1,Math.max(zone.fillFraction,part));
      }
      zone.status=zone.fillFraction>=1?'FILLED':
        zone.fillFraction>0?'PARTIAL':'OPEN';
      result.push(zone);
    }
    return result.slice(-limit);
  }
  function observe(bars,asOf,side=null){
    const all=scan(bars,asOf);const matching=side?all.filter(x=>x.side===side):all;
    const active=matching.filter(x=>x.status!=='FILLED');
    return {status:all.length?'RESEARCH':'NO DATA',asOf,
      total:all.length,small:all.filter(x=>x.cls==='SMALL').length,
      large:all.filter(x=>x.cls==='LARGE').length,
      latest:matching.at(-1)||null,nearestActive:active.at(-1)||null};
  }
  root.ASCEND_FVG_RESEARCH_V1=Object.freeze({scan,observe,atrAt});
})(typeof window!=='undefined'?window:globalThis);
