/* ASCEND Candle QA V1 — verified close times and aligned aggregates.
   Presentation/data-integrity only; no trade setup or ENTRY rule changes. */
(function(root){
  'use strict';
  const SECONDS={ '1m':60,'3m':180,'5m':300,'10m':600,
    '15m':900,'30m':1800,'1h':3600,'4h':14400,'1d':86400 };
  function complete(rows,seconds,asOf=Date.now()/1000){
    if(!Array.isArray(rows)||!Number.isInteger(seconds)||seconds<60||
      !Number.isFinite(asOf))return [];
    const result=[],seen=new Set();
    for(const row of rows){
      const t=Number(row?.time),o=Number(row?.open),h=Number(row?.high),
        l=Number(row?.low),c=Number(row?.close);
      if(![t,o,h,l,c].every(Number.isFinite)||!Number.isInteger(t)||
        t%seconds!==0||t+seconds>asOf||l<=0||h<l||
        o<l||o>h||c<l||c>h||seen.has(t))continue;
      seen.add(t);
      result.push({time:t,open:o,high:h,low:l,close:c,
        volume:Number.isFinite(Number(row.volume))?Number(row.volume):0});
    }
    return result.sort((a,b)=>a.time-b.time);
  }
  function aggregate(rows,sourceSeconds,targetSeconds,asOf=Date.now()/1000){
    if(!Number.isInteger(targetSeconds)||targetSeconds<sourceSeconds||
      targetSeconds%sourceSeconds!==0)return [];
    const source=complete(rows,sourceSeconds,asOf),groups=new Map();
    const count=targetSeconds/sourceSeconds;
    for(const b of source){
      const t=Math.floor(b.time/targetSeconds)*targetSeconds;
      if(!groups.has(t))groups.set(t,[]);
      groups.get(t).push(b);
    }
    const output=[];
    for(const [t,group] of [...groups].sort((a,b)=>a[0]-b[0])){
      if(t+targetSeconds>asOf||group.length!==count||
        group.some((bar,i)=>bar.time!==t+i*sourceSeconds))continue;
      output.push({time:t,open:group[0].open,
        high:Math.max(...group.map(x=>x.high)),
        low:Math.min(...group.map(x=>x.low)),
        close:group.at(-1).close,
        volume:group.reduce((sum,x)=>sum+x.volume,0)});
    }
    return output;
  }
  function status(rows,seconds,asOf=Date.now()/1000){
    const usable=complete(rows,seconds,asOf);
    if(!usable.length)return {state:'NO DATA',count:0,lagSeconds:null,lastClose:null};
    const last=usable.at(-1).time+seconds,age=asOf-last;
    const stale=age>seconds*2+30;
    return {state:stale?'STALE':'LIVE',count:usable.length,
      lagSeconds:Math.max(0,Math.round(age)),lastClose:last};
  }
  root.ASCEND_TF_QA=Object.freeze({complete,aggregate,status,SECONDS});
})(typeof window!=='undefined'?window:globalThis);
