/* ASCEND Structure Evidence V1 — read-only, close-confirmed, no Core signal routing. */
(function(root){
  'use strict';
  const DAY=86400,MINUTE=60;
  const TFS=[['30m',1800],['15m',900],['10m',600],['5m',300],['3m',180],['1m',60]];
  const finite=v=>Number.isFinite(Number(v));
  function prepared(input,tf,asOf){
    const sorted=(input||[]).filter(x=>finite(x.time)&&Number(x.time)+tf<=asOf)
      .sort((a,b)=>Number(a.time)-Number(b.time));
    if(!sorted.length)return [];
    const bars=[];
    for(const b of sorted){
      const t=Number(b.time),o=Number(b.open),h=Number(b.high),
        l=Number(b.low),c=Number(b.close);
      if(![o,h,l,c].every(Number.isFinite)||l<=0||h<l||o<l||o>h||
        c<l||c>h)continue;
      if(bars.length&&t<=bars.at(-1).time)continue;
      bars.push({time:t,open:o,high:h,low:l,close:c,volume:Number(b.volume)||0});
    }
    // Keep only the latest continuous segment; never bridge an OHLCV gap.
    let begin=0;
    for(let i=1;i<bars.length;i++)if(bars[i].time!==bars[i-1].time+tf)begin=i;
    return bars.slice(begin);
  }
  function grouped(one,seconds,baseStep=60){
    if(seconds===baseStep)return one;
    const by=new Map(),out=[];
    for(const b of one){
      const time=Math.floor(b.time/seconds)*seconds;
      if(!by.has(time))by.set(time,[]);
      by.get(time).push(b);
    }
    for(const [t,g] of [...by].sort((a,b)=>a[0]-b[0])){
      if(g.length!==seconds/baseStep||g.some((b,i)=>b.time!==t+i*baseStep))continue;
      out.push({time:t,open:g[0].open,high:Math.max(...g.map(x=>x.high)),
        low:Math.min(...g.map(x=>x.low)),close:g.at(-1).close,
        volume:g.reduce((s,x)=>s+x.volume,0)});
    }
    return prepared(out,seconds,one.at(-1)?.time+baseStep||0);
  }
  function pivots(bars,seconds,wing=2){
    const highs=[],lows=[];
    for(let i=wing;i+wing<bars.length;i++){
      const curr=bars[i],surround=bars.slice(i-wing,i).concat(bars.slice(i+1,i+wing+1));
      const knownAt=bars[i+wing].time+seconds;
      if(surround.every(x=>x.high<curr.high))
        highs.push({price:curr.high,at:curr.time,knownAt});
      if(surround.every(x=>x.low>curr.low))
        lows.push({price:curr.low,at:curr.time,knownAt});
    }
    return {highs,lows};
  }
  function snapshot(bars,seconds,asOf){
    if(bars.length<9)return {trend:'NODATA',pattern:'Недостаточно свечей',events:[],
      count:bars.length};
    const p=pivots(bars,seconds),highs=p.highs.filter(x=>x.knownAt<=asOf),
      lows=p.lows.filter(x=>x.knownAt<=asOf);
    const lastHigh=highs.at(-1),prevHigh=highs.at(-2),lastLow=lows.at(-1),prevLow=lows.at(-2);
    const hi=lastHigh&&prevHigh?(lastHigh.price>prevHigh.price?'HH':
      lastHigh.price<prevHigh.price?'LH':'EH'):'—';
    const lo=lastLow&&prevLow?(lastLow.price>prevLow.price?'HL':
      lastLow.price<prevLow.price?'LL':'EL'):'—';
    const trend=hi==='HH'&&lo==='HL'?'LONG':hi==='LH'&&lo==='LL'?'SHORT':
      lastHigh&&lastLow?'MIXED':'NODATA';
    const events=[];
    for(let i=1;i<bars.length;i++){
      const b=bars[i],before=bars[i-1],end=b.time+seconds;
      // A pivot is not tradable until ALL right-side confirming bars have closed.
      const knownHigh=highs.filter(p=>p.knownAt<=b.time&&p.at<b.time).at(-1);
      const knownLow=lows.filter(p=>p.knownAt<=b.time&&p.at<b.time).at(-1);
      if(knownHigh&&before.close<=knownHigh.price&&b.close>knownHigh.price)
        events.push({at:end,dir:'LONG',kind:'BREAK↑',level:knownHigh.price});
      if(knownLow&&before.close>=knownLow.price&&b.close<knownLow.price)
        events.push({at:end,dir:'SHORT',kind:'BREAK↓',level:knownLow.price});
    }
    return {trend,pattern:hi+' / '+lo,events:events.slice(-8),
      lastHigh:lastHigh?.price,lastLow:lastLow?.price,count:bars.length};
  }
  function levelHistory(one,item,asOf){
    if(!item||!finite(item.level)||Number(item.level)<=0)return null;
    const side=item.side,level=Number(item.level);
    const freezeAt=Number(item.freezeAt??item.frozenAt??0);
    if(!freezeAt)return null;
    const zone=item.zone||{low:level,high:level};
    const tolLow=Number(zone.low),tolHigh=Number(zone.high);
    const observed=one.filter(x=>x.time+60>freezeAt&&x.time+60<=asOf);
    const incomplete=one.length>0&&one[0].time>freezeAt;
    const events=[];let previousOutside=false,wasNear=false;
    let outsideStreak=0,lastBreak=0,lastProbe=0,lastResolution=null,lastRetestAt=0;
    let sweptExtreme=null;
    for(const c of observed){
      const t=c.time+MINUTE,upper=side==='upper',
        penetrated=upper?c.high>level:c.low<level,
        outside=upper?c.close>level:c.close<level,
        inside=upper?c.close<=level:c.close>=level,
        inZone=c.low<=tolHigh&&c.high>=tolLow;
      if(inZone&&!wasNear){
        events.push({type:'TOUCH',at:t,key:item.key,price:level,
          depthPct:0,dir:null});
      }
      if(penetrated&&inside){
        const extreme=upper?c.high:c.low;
        const depthPct=Math.abs(extreme-level)/level*100;
        if(!lastProbe||t-lastProbe>=180){
          events.push({type:'SWEEP',at:t,key:item.key,price:level,
            depthPct,extreme,dir:upper?'SHORT':'LONG'});
          lastProbe=t;
          sweptExtreme=extreme;
          lastResolution={at:t,dir:upper?'SHORT':'LONG',type:'SWEEP'};
        }else if(sweptExtreme!==null&&(upper?extreme>sweptExtreme:extreme<sweptExtreme)){
          sweptExtreme=extreme;
        }
      }
      if(outside&&!previousOutside){
        events.push({type:'BREAK',at:t,key:item.key,price:level,
          depthPct:Math.abs(c.close-level)/level*100,
          dir:upper?'LONG':'SHORT'});
        lastBreak=t;
      }
      outsideStreak=outside?outsideStreak+1:0;
      if(outsideStreak===2&&lastBreak){
        const dir=upper?'LONG':'SHORT';
        events.push({type:'ACCEPTANCE',at:t,key:item.key,price:level,dir});
        lastResolution={at:t,dir,type:'ACCEPTANCE'};
      }
      if(!outside&&previousOutside){
        events.push({type:'RECLAIM',at:t,key:item.key,price:level,
          dir:upper?'SHORT':'LONG'});
        lastResolution={at:t,dir:upper?'SHORT':'LONG',type:'RECLAIM'};
      }
      // Retest requires a LATER bar after an accepted break or reclaim.
      // Only count the first confirming touch for each resolution phase.
      if(lastResolution&&t>lastResolution.at&&t>lastRetestAt&&inZone){
        const confirms=lastResolution.dir==='LONG'?c.close>level:c.close<level;
        if(confirms){
          events.push({type:'RETEST',at:t,key:item.key,price:level,
            dir:lastResolution.dir,after:lastResolution.type});
          lastRetestAt=t;
          lastResolution=null;
        }
      }
      previousOutside=outside;wasNear=inZone;
    }
    return {key:item.key,side,level,freezeAt,
      status:asOf<freezeAt?'LIVE':incomplete?'PARTIAL':'FROZEN',
      events,latest:events.at(-1)||null,
      historyStart:one[0]?.time??null};
  }
  function analyze(input){
    const asOf=Number(input?.asOf);
    if(!Number.isFinite(asOf)||!input)return {status:'NODATA',reason:'Нет закрытых минутных свечей'};
    const one=prepared(input.one,60,asOf),fifteen=prepared(input.fifteen,900,asOf);
    if(one.length<30)return {status:'NODATA',reason:'Недостаточно непрерывных 1m свечей',asOf};
    const wallClock=Number(input.wallClock);
    const stale=Number.isFinite(wallClock)&&wallClock-asOf>180;
    // Trend is independent from liquidity availability and never reads an open bar.
    const frames={};
    for(const [name,seconds] of TFS){
      const bars=seconds===1800?grouped(fifteen,1800,900):
        seconds===900?fifteen:grouped(one,seconds);
      frames[name]=snapshot(bars,seconds,asOf);
    }
    const items=(input.levels?.all?.uppers||[]).concat(input.levels?.all?.lowers||[]);
    const perLevel=items.map(level=>levelHistory(one,{
      ...level,freezeAt:input.levelMeta?.[level.key]?.freezeAt
    },asOf)).filter(Boolean);
    const recent=perLevel.flatMap(x=>x.events).sort((a,b)=>b.at-a.at).slice(0,14);
    const context=frames['30m'].trend===frames['15m'].trend&&
      ['LONG','SHORT'].includes(frames['30m'].trend)?frames['30m'].trend:'MIXED';
    // Isolated BREAK↑/↓ is shown as structure evidence, not assumed CHOCH/BOS.
    const ten=frames['10m'].events.at(-1)||null,
      five=frames['5m'].events.at(-1)||null,
      micro=frames['1m'].events.at(-1)||null;
    const levelRetest=recent.find(x=>x.type==='RETEST')||null;
    const direction=levelRetest?.dir||null;
    const aligned=Boolean(direction&&context===direction&&ten?.dir===direction&&
      five?.dir===direction&&micro?.dir===direction&&
      ten.at<=five.at&&five.at<=micro.at&&
      levelRetest.at<=micro.at);
    return {status:stale?'STALE':'READY',asOf,frames,perLevel,
      context,recent,ten,five,micro,levelRetest,aligned,
      historyStart:one[0].time,
      reason:items.length?'':'Нет замороженных уровней или недостаточно истории 15m'};
  }
  root.ASCEND_STRUCTURE_EVIDENCE=Object.freeze({analyze,pivots,snapshot,prepared,grouped,levelHistory});
})(typeof window!=='undefined'?window:globalThis);
