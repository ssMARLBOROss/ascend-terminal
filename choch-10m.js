/* ASCEND 10m CHOCH V1: protected-pivot structural shift, research only.
 * A CHOCH requires an ESTABLISHED prior HH/HL or LH/LL structure,
 * then a 10-minute CLOSE beyond the last protected low/high.
 * Pivots become eligible only after TWO 10m bars to their right CLOSE.
 * Never calls trading Core, sends orders, or claims ENTRY_READY.
 */
(function(root){
  'use strict';
  const STEP=600, WING=2, MAX_EVENTS=6, ACTIVE_SECONDS=1800;
  const numeric=x=>Number.isFinite(x);
  function scan(bars,asOf){
    const empty={status:'NO_DATA',direction:null,events:[],latest:null,
      expected:'WAIT',protectedLevel:null,priorTrend:null,
      reason:'Недостаточно непрерывных закрытых 10m свечей'};
    if(!Array.isArray(bars)||!numeric(asOf))return empty;
    const complete=bars.filter(b=>numeric(b?.time)&&b.time+STEP<=asOf)
      .sort((a,b)=>a.time-b.time);
    if(complete.length<12||complete.some((b,i)=>
      !numeric(b.close)||!numeric(b.high)||!numeric(b.low)||
      b.low<=0||b.high<b.low||b.close<b.low||b.close>b.high||
      (i>0&&b.time-complete[i-1].time!==STEP)))return empty;
    const highs=[],lows=[];
    for(let i=WING;i+WING<complete.length;i++){
      const c=complete[i],neighbors=complete.slice(i-WING,i)
        .concat(complete.slice(i+1,i+WING+1));
      const knownAt=complete[i+WING].time+STEP;
      if(neighbors.every(b=>b.high<c.high))
        highs.push({level:c.high,pivotAt:c.time,knownAt});
      if(neighbors.every(b=>b.low>c.low))
        lows.push({level:c.low,pivotAt:c.time,knownAt});
    }
    const events=[];
    let brokenTrend=null,currentTrend=null,protectedLevel=null;
    let protectedAt=null,protectedKnownAt=null;
    for(let i=1;i<complete.length;i++){
      const bar=complete[i],prev=complete[i-1],start=bar.time;
      // Strictly prior knowledge: confirming 10m right bars are closed
      // by the START of the candle being evaluated.
      const confirmedHi=highs.filter(x=>x.knownAt<=start);
      const confirmedLo=lows.filter(x=>x.knownAt<=start);
      const a=confirmedHi.at(-1),ap=confirmedHi.at(-2);
      const b=confirmedLo.at(-1),bp=confirmedLo.at(-2);
      currentTrend=a&&ap&&b&&bp?
        (a.level>ap.level&&b.level>bp.level?'LONG':
        a.level<ap.level&&b.level<bp.level?'SHORT':'MIXED'):'WAIT';
      // A broken trend cannot emit another CHOCH until an opposite
      // structure is established; no signal repeats on recrossing.
      if(brokenTrend&&currentTrend!=='MIXED'&&currentTrend!=='WAIT'&&
        currentTrend!==brokenTrend)brokenTrend=null;
      if(currentTrend==='LONG'){
        protectedLevel=b.level;protectedAt=b.pivotAt;
        protectedKnownAt=b.knownAt;
      }else if(currentTrend==='SHORT'){
        protectedLevel=a.level;protectedAt=a.pivotAt;
        protectedKnownAt=a.knownAt;
      }else{
        protectedLevel=null;protectedAt=null;protectedKnownAt=null;
      }
      if(brokenTrend||!numeric(protectedLevel))continue;
      const bear=currentTrend==='LONG'&&prev.close>=protectedLevel&&
        bar.close<protectedLevel;
      const bull=currentTrend==='SHORT'&&prev.close<=protectedLevel&&
        bar.close>protectedLevel;
      if(!bear&&!bull)continue;
      const ev={type:'CHOCH',dir:bear?'SHORT':'LONG',
        priorTrend:currentTrend,at:bar.time+STEP,candleTime:bar.time,
        level:protectedLevel,price:bar.close,protectedAt,protectedKnownAt,
        depthPct:Math.abs(bar.close/protectedLevel-1)*100,
        source:'10m closed candle + confirmed protected pivot'};
      events.push(ev);brokenTrend=currentTrend;
    }
    const latest=events.at(-1)||null;
    const active=latest&&asOf>=latest.at&&asOf-latest.at<=ACTIVE_SECONDS;
    return {
      status:active?'CONFIRMED':currentTrend==='WAIT'?'NO_DATA':'WAIT',
      direction:active?latest.dir:null,latest,events:events.slice(-MAX_EVENTS),
      expected:brokenTrend?'WAIT · новый тренд':
        currentTrend==='LONG'?'CHOCH SHORT':
        currentTrend==='SHORT'?'CHOCH LONG':'WAIT',
      protectedLevel,protectedAt,protectedKnownAt,
      priorTrend:currentTrend,reason:currentTrend==='WAIT'?
        'Недостаточно подтверждённых HH/HL или LH/LL':null,
      asOf,latestBarAt:complete.at(-1).time+STEP
    };
  }
  root.ASCEND_CHOCH_10M=Object.freeze({scan});
})(typeof window!=='undefined'?window:globalThis);
