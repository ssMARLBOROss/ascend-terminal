/* ASCEND SMC Target Liquidit — Zone Radar V1 (research-only).
 * Deterministic and closed-candle only. No feeds, orders, alerts or risk edits.
 */
(function(root){
  'use strict';
  const BASE=()=>root.ASCEND_SMC_TARGET_LIQUIDIT_V1;
  const STEP=1800,DAY=86400,MAX_ZONES=3;
  const SESSIONS=[
    {id:'ASIA',name:'Азия',start:0,end:8},
    {id:'LONDON',name:'Лондон',start:7,end:16},
    {id:'NY',name:'Нью-Йорк',start:13,end:22}
  ];
  const resultNo=(reason)=>({status:'NO DATA',reason,zones:[],trend:'UNKNOWN',atr:null,price:null});
  const good=n=>typeof n==='number'&&Number.isFinite(n);
  function atrWilder(rows,n=14){
    if(rows.length<n+1)return null;
    const tr=[];
    for(let i=1;i<rows.length;i++){
      const b=rows[i],p=rows[i-1];
      tr.push(Math.max(b.high-b.low,Math.abs(b.high-p.close),Math.abs(b.low-p.close)));
    }
    let v=tr.slice(0,n).reduce((a,b)=>a+b,0)/n;
    for(let i=n;i<tr.length;i++)v=(v*(n-1)+tr[i])/n;
    return v>0&&good(v)?v:null;
  }
  function ema(rows,n){
    if(rows.length<n)return null;
    const a=2/(n+1);let e=rows[0].close;
    for(let i=1;i<rows.length;i++)e=e*(1-a)+rows[i].close*a;
    return e;
  }
  function makeSources(ctx,asOf){
    const src=[],bars=ctx.bars;
    // Confirmed 30m swing pivots: 3 left and 3 right CLOSED bars.
    for(const p of ctx.internal.slice(-28)){
      if(p.knownAt>asOf||p.knownAt<asOf-3*DAY)continue;
      src.push({id:'P'+p.id,kind:p.type==='HIGH'?'RESISTANCE':'SUPPORT',
        price:p.price,knownAt:p.knownAt,originAt:p.at,
        family:'STRUCTURE',label:'Структура 30m'});
    }
    // Previous completed UTC day: only if all 48 half-hour candles exist.
    const today=Math.floor((asOf-1)/DAY)*DAY,prev=today-DAY;
    const yesterday=bars.filter(x=>x.time>=prev&&x.time<today);
    if(yesterday.length===48&&yesterday[0].time===prev&&yesterday.at(-1).time===today-STEP){
      const hi=Math.max(...yesterday.map(x=>x.high)),lo=Math.min(...yesterday.map(x=>x.low));
      src.push({id:'YH'+prev,kind:'RESISTANCE',price:hi,knownAt:today,
        originAt:prev,family:'PREVDAY',label:'YH · предыдущий день'});
      src.push({id:'YL'+prev,kind:'SUPPORT',price:lo,knownAt:today,
        originAt:prev,family:'PREVDAY',label:'YL · предыдущий день'});
    }
    // Only COMPLETED named UTC sessions, never growing session H/L.
    for(const s of SESSIONS){
      for(let k=0;k<3;k++){
        const day=today-k*DAY,start=day+s.start*3600,end=day+s.end*3600;
        if(end>asOf||asOf-end>DAY)continue;
        const members=bars.filter(x=>x.time>=start&&x.time<end),count=(end-start)/STEP;
        if(members.length!==count||members[0].time!==start||members.at(-1).time!==end-STEP)continue;
        src.push({id:'SH'+s.id+start,kind:'RESISTANCE',
          price:Math.max(...members.map(x=>x.high)),knownAt:end,
          originAt:start,family:'SESSION',label:s.name+' H (закрыта)'});
        src.push({id:'SL'+s.id+start,kind:'SUPPORT',
          price:Math.min(...members.map(x=>x.low)),knownAt:end,
          originAt:start,family:'SESSION',label:s.name+' L (закрыта)'});
      }
    }
    return src;
  }
  function deduplicate(sources,halfWidth){
    const groups=[];
    const ordered=sources.slice().sort((a,b)=>b.knownAt-a.knownAt);
    for(const s of ordered){
      const group=groups.find(g=>g.kind===s.kind&&Math.abs(g.price-s.price)<=halfWidth);
      if(group){
        group.sources.push(s);
        // Retain most recently confirmed anchor; NEVER average future knowledge.
      }else groups.push({...s,sources:[s]});
    }
    return groups;
  }
  function stateOf(z,rows5,atr,asOf){
    const recent=rows5.filter(b=>b.time+300<=asOf&&b.time>=Math.max(z.knownAt,asOf-4*3600));
    const last=rows5.at(-1);
    const near=last.low<=z.high&&last.high>=z.low;
    const distance=last.close<z.low?z.low-last.close:last.close>z.high?last.close-z.high:0;
    const sweepMargin=atr*0.08;
    let sweep=null,reclaim=null;
    for(const b of recent){
      const crossed=z.kind==='SUPPORT'?b.low<z.price-sweepMargin:b.high>z.price+sweepMargin;
      const returned=z.kind==='SUPPORT'?b.close>z.price:b.close<z.price;
      if(crossed){sweep=b;reclaim=returned?b:null;}
      else if(sweep&&returned&&!reclaim)reclaim=b;
    }
    const volumeBefore=rows5.filter(b=>b.time<(reclaim?.time??-1)).slice(-20);
    const meanVolume=volumeBefore.length===20?volumeBefore.reduce((s,b)=>s+Math.max(0,b.volume||0),0)/20:0;
    const exceptional=!!reclaim&&meanVolume>0&&Number(reclaim.volume)>=meanVolume*1.5;
    let status='ОЖИДАНИЕ';
    if(near||distance<=atr*0.25)status='ГОРЯЧЕЕ НАБЛЮДЕНИЕ';
    if(sweep)status='СНЯТИЕ? · ждём возврата';
    if(reclaim)status='ВОЗВРАТ · проверка структуры';
    // Zone reaction != ENTRY READY. Confirm only a 5m continuation beyond
    // the pre-reclaim 5m structure, with volume. No look-ahead.
    let structuralBreak=null;
    if(reclaim){
      const prior=rows5.filter(b=>b.time<reclaim.time&&b.time>=reclaim.time-12*300);
      if(prior.length>=6){
        const trigger=z.kind==='SUPPORT'?Math.max(...prior.map(b=>b.high)):Math.min(...prior.map(b=>b.low));
        structuralBreak=rows5.find(b=>b.time>reclaim.time&&b.time+300<=asOf&&
          (z.kind==='SUPPORT'?b.close>trigger:b.close<trigger))||null;
      }
      if(structuralBreak&&exceptional)status='РЕАКЦИЯ ПОДТВЕРЖДЕНА · только анализ';
    }
    return {status,sweepAt:sweep?sweep.time+300:null,reclaimAt:reclaim?reclaim.time+300:null,
      breakAt:structuralBreak?structuralBreak.time+300:null,volumeConfirmed:exceptional,
      distance,distPct:Math.abs(last.close)>0?distance/last.close*100:null};
  }
  function scan({rows30=[],rows5=[],asOf=NaN}={}){
    const base=BASE();
    if(!base||!good(asOf))return resultNo('Нет валидного времени или Structure module');
    const c30=base.scan(rows30,'30m',asOf),c5=base.scan(rows5,'5m',asOf);
    if(c30.status!=='RESEARCH')return resultNo('30m · '+c30.reason);
    if(c5.status!=='RESEARCH')return resultNo('5m · '+c5.reason);
    const last30=c30.bars.at(-1),last5=c5.bars.at(-1);
    if(last5.time+300<last30.time) return resultNo('Нарушена синхронизация 30m/5m');
    const atr=atrWilder(c30.bars,14);
    if(!atr)return resultNo('ATR14 недоступен');
    const e20=ema(c30.bars,20),e50=ema(c30.bars,50);
    const trend=e20>e50&&last30.close>e20?'LONG':e20<e50&&last30.close<e20?'SHORT':'NEUTRAL';
    const halfWidth=atr*0.25,price=last5.close;
    const merged=deduplicate(makeSources(c30,asOf),halfWidth);
    if(!merged.length)return resultNo('Нет подтверждённых структурных и сессионных зон');
    const candidates=merged.map(z=>{
      const low=z.price-halfWidth,high=z.price+halfWidth;
      const stage=stateOf({...z,low,high},c5.bars,atr,asOf);
      const families=[...new Set(z.sources.map(s=>s.family))];
      const priority=Math.min(4,1+(families.includes('PREVDAY')?1:0)+
        (families.includes('SESSION')?1:0)+(families.includes('STRUCTURE')?1:0));
      const direction=z.kind==='SUPPORT'?'LONG':'SHORT';
      return {id:z.id,kind:z.kind,price:z.price,low,high,knownAt:z.knownAt,
        originAt:z.originAt,label:z.label,sources:z.sources.map(s=>s.label),
        sourceTimes:z.sources.map(s=>s.knownAt),
        priority,trendAligned:trend===direction,expectedSide:direction,
        ...stage};
    }).filter(z=>good(z.distance));
    // Keep nearest three across both sides; tie-break by independent sources.
    candidates.sort((a,b)=>a.distance-b.distance||b.priority-a.priority||b.knownAt-a.knownAt);
    return {status:'RESEARCH',reason:null,price,atr,trend,tf:'30m',priceTf:'5m',
      candleAt:last5.time+300,zones:candidates.slice(0,MAX_ZONES)};
  }
  root.ASCEND_SMC_ZONE_RADAR_V1=Object.freeze({scan,atrWilder,makeSources,CONFIG:Object.freeze({maxZones:MAX_ZONES,halfAtr:.25})});
})(window);
