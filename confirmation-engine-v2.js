/* ASCEND Confirmation Engine V2 — causal, closed-candle research.
   Records a candidate only after:
   frozen-level sweep/reclaim -> 10m CHOCH -> 5m MSS ->
   confirmed 3m retest HL/LH -> 1m micro-BOS + volume -> structural SL / frozen-liquidity TP R:R>=2.
   No trading, no orders, no auto-entry. No future candles, no provisional pivots. */
(function(root){
  'use strict';
  const TIME={m1:60,m3:180,m5:300,m10:600};
  const HORIZON=3*3600,TRIGGER_AGE=600;
  const isNum=v=>typeof v==='number'&&Number.isFinite(v);
  const validBar=(b,step)=>b&&isNum(b.time)&&b.time%step===0&&
    [b.open,b.high,b.low,b.close].every(isNum)&&b.low>0&&
    b.high>=b.low&&b.open>=b.low&&b.open<=b.high&&
    b.close>=b.low&&b.close<=b.high;
  const step=(name,label)=>({name,label,status:'WAIT',at:null,price:null,level:null,note:''});
  const makeSteps=()=>[
    step('context','30m / 15m · тренд сессии'),
    step('sweep','SWEEP / RECLAIM · frozen level'),
    step('choch','10m · CHOCH'),
    step('mss','5m · MSS'),
    step('retest','3m · RETEST + HL/LH'),
    step('micro','1m · Micro-BOS + volume'),
    step('risk','STRUCTURAL SL / TP · R:R ≥ 2')
  ];
  const byName=(all,name)=>all.find(s=>s.name===name);
  function rows(raw,seconds,asOf){
    const sorted=(Array.isArray(raw)?raw:[]).filter(b=>
      validBar(b,seconds)&&b.time+seconds<=asOf)
      .sort((a,b)=>a.time-b.time);
    const unique=[];
    for(const b of sorted)if(!unique.length||unique.at(-1).time!==b.time)unique.push(b);
    let from=0;
    for(let i=1;i<unique.length;i++)if(unique[i].time!==unique[i-1].time+seconds)from=i;
    return unique.slice(from);
  }
  function combine(raw,base,target,asOf){
    const input=rows(raw,base,asOf),group=new Map(),output=[];
    for(const b of input){
      const start=Math.floor(b.time/target)*target;
      if(!group.has(start))group.set(start,[]);
      group.get(start).push(b);
    }
    for(const [t,bars] of [...group].sort((a,b)=>a[0]-b[0])){
      if(t+target>asOf||bars.length!==target/base||
        bars.some((b,i)=>b.time!==t+i*base))continue;
      output.push({time:t,open:bars[0].open,close:bars.at(-1).close,
        high:Math.max(...bars.map(b=>b.high)),
        low:Math.min(...bars.map(b=>b.low)),
        volume:bars.reduce((a,b)=>a+(isNum(b.volume)?b.volume:0),0)});
    }
    return rows(output,target,asOf);
  }
  function swings(bars,seconds,wing=2){
    const hi=[],lo=[];
    for(let i=wing;i+wing<bars.length;i++){
      const now=bars[i],neighbors=bars.slice(i-wing,i)
        .concat(bars.slice(i+1,i+wing+1));
      const pivot={at:now.time,knownAt:bars[i+wing].time+seconds};
      if(neighbors.every(b=>b.high<now.high))hi.push({...pivot,level:now.high});
      if(neighbors.every(b=>b.low>now.low))lo.push({...pivot,level:now.low});
    }
    return {hi,lo};
  }
  function sweeps(one,levels,meta,asOf){
    const items=[...(levels?.all?.uppers||[]),...(levels?.all?.lowers||[])];
    const out=[];
    for(const item of items){
      const frozenAt=Number(meta?.[item.key]?.freezeAt ?? item.freezeAt);
      const value=Number(item.level);
      if(!isNum(frozenAt)||frozenAt<=0||frozenAt>asOf||
        !isNum(value)||value<=0||!['upper','lower'].includes(item.side))continue;
      for(const c of one){
        const at=c.time+60;
        if(at<=frozenAt)continue;
        const buy=item.side==='lower',penetrates=buy?c.low<value:c.high>value,
          reclaimed=buy?c.close>value:c.close<value;
        if(!penetrates||!reclaimed)continue;
        out.push({name:'sweep',key:item.key,dir:buy?'LONG':'SHORT',
          at,level:value,price:c.close,extreme:buy?c.low:c.high,
          freezeAt:frozenAt,note:'SWEEP тенью + RECLAIM закрытием 1m'});
      }
    }
    return out.sort((a,b)=>a.at-b.at);
  }
  function mssAfter(five,choch){
    const p=swings(five,300),out=[];
    for(let i=1;i<five.length;i++){
      const b=five[i],prev=five[i-1],at=b.time+300;
      if(b.time<choch.at||at-choch.at>HORIZON)continue;
      const options=choch.dir==='LONG'?p.hi:p.lo;
      const pivot=options.filter(x=>x.knownAt<=b.time).at(-1);
      if(!pivot)continue;
      const broke=choch.dir==='LONG'?
        prev.close<=pivot.level&&b.close>pivot.level:
        prev.close>=pivot.level&&b.close<pivot.level;
      if(broke)out.push({name:'mss',dir:choch.dir,at,level:pivot.level,
        price:b.close,note:'Пробой подтверждённого 5m swing закрытием'});
    }
    return out;
  }
  function atrAt(five,at){
    const history=five.filter(b=>b.time+300<=at);
    if(history.length<15)return null;
    const b=history.slice(-15),tr=[];
    for(let i=1;i<b.length;i++)
      tr.push(Math.max(b[i].high-b[i].low,Math.abs(b[i].high-b[i-1].close),
        Math.abs(b[i].low-b[i-1].close)));
    const val=tr.reduce((a,v)=>a+v,0)/tr.length;
    return val>0?val:null;
  }
  function retestAfter(three,five,mss,asOf){
    const p=swings(three,180),ret=[];
    for(let i=2;i+2<three.length;i++){
      const b=three[i],at=b.time+180,confirmation=three[i+2].time+180;
      if(b.time<mss.at||confirmation>asOf||confirmation-mss.at>HORIZON)continue;
      const atr=atrAt(five,at),tol=atr===null?null:atr*.25;
      if(tol===null)continue;
      const touches=b.low<=mss.level+tol&&b.high>=mss.level-tol;
      const recovered=mss.dir==='LONG'?b.close>mss.level:b.close<mss.level;
      if(!touches||!recovered)continue;
      const pivots=mss.dir==='LONG'?p.lo:p.hi;
      const own=pivots.find(x=>x.at===b.time&&x.knownAt===confirmation);
      const prior=pivots.filter(x=>x.at<b.time&&x.knownAt<=b.time).at(-1);
      if(!own||!prior)continue;
      const hl=mss.dir==='LONG'?own.level>prior.level:own.level<prior.level;
      if(!hl)continue;
      ret.push({name:'retest',dir:mss.dir,at:confirmation,
        touchAt:at,level:mss.level,price:b.close,extreme:mss.dir==='LONG'?b.low:b.high,
        atr,note:'Касание 3m + '+(mss.dir==='LONG'?'HL':'LH')+
        ' · swing подтверждён 2 следующими 3m свечами'});
    }
    return ret;
  }
  function microAfter(one,retest){
    const p=swings(one,60),events=[];
    for(let i=21;i<one.length;i++){
      const b=one[i],prev=one[i-1],at=b.time+60;
      if(b.time<retest.at||at-retest.at>HORIZON)continue;
      const pivot=(retest.dir==='LONG'?p.hi:p.lo)
        .filter(x=>x.knownAt<=b.time).at(-1);
      if(!pivot)continue;
      const crossed=retest.dir==='LONG'?
        prev.close<=pivot.level&&b.close>pivot.level:
        prev.close>=pivot.level&&b.close<pivot.level;
      if(!crossed)continue;
      const recent=one.slice(i-20,i).map(x=>Number(x.volume));
      const avg=recent.reduce((a,v)=>a+v,0)/20;
      const volume=Number(b.volume);
      if(!recent.every(v=>Number.isFinite(v)&&v>0)||
        !Number.isFinite(volume)||avg<=0||volume/avg<1.2)continue;
      events.push({name:'micro',dir:retest.dir,at,level:pivot.level,
        price:b.close,volumeX:volume/avg,
        note:'1m swing break закрытием · объём '+(volume/avg).toFixed(2)+'×'});
    }
    return events;
  }
  function risk(micro,retest,five,levels,meta){
    const atr=atrAt(five,micro.at),entry=micro.price;
    if(!atr||!isNum(entry)||!isNum(retest.extreme))return null;
    const buy=micro.dir==='LONG';
    const stop=buy?retest.extreme-atr*.1:retest.extreme+atr*.1;
    const distance=buy?entry-stop:stop-entry;
    if(distance<=0)return null;
    const targets=[...(levels?.all?.uppers||[]),...(levels?.all?.lowers||[])]
      .filter(x=>Number(meta?.[x.key]?.freezeAt??x.freezeAt)<=micro.at &&
        ['YH','YL','ONH','ONL','RTH_H','RTH_L','IBH','IBL'].includes(x.key))
      .map(x=>Number(x.level)).filter(x=>isNum(x)&&x>0&&
        (buy?x>entry:x<entry)).sort((a,b)=>buy?a-b:b-a);
    if(!targets.length)return {entry,stop,rr:null,target:null,
      reason:'Нет следующей замороженной зоны ликвидности'};
    const target=targets[0],rr=Math.abs(target-entry)/distance;
    return {entry,stop,target,rr,reason:rr>=2?'R:R подтверждено':'R:R меньше 1:2'};
  }
  function analyze(input={}){
    const steps=makeSteps(),asOf=Number(input.asOf),now=Number(input.now);
    const base={symbol:input.symbol||null,side:null,asOf,status:'NO DATA',
      reason:'Нет полностью закрытых данных',steps,ready:false,plan:null};
    if(!isNum(asOf)||!isNum(now)||now<asOf-10||now-asOf>180)return base;
    const one=rows(input.one,60,asOf),five=rows(input.five,300,asOf),
      fifteen=rows(input.fifteen,900,asOf),
      three=combine(one,60,180,asOf),ten=combine(five,300,600,asOf);
    if(one.length<35||five.length<35||fifteen.length<20||three.length<12||
      ten.length<12)return {...base,reason:'Недостаточно непрерывной истории 1m/5m/15m'};
    const secOk=Array.isArray(input.feedStatuses)&&input.feedStatuses.length===3&&
      input.feedStatuses.every(s=>s==='LIVE');
    if(!secOk)return {...base,reason:'DATA HEALTH: 1m / 5m / 15m не все LIVE'};
    const levelData=input.levels,meta=input.levelMeta||{};
    const sweepEvents=sweeps(one,levelData,meta,asOf);
    if(!sweepEvents.length)return {...base,status:'WAIT',
      reason:'Ожидаем SWEEP/RECLAIM замороженного уровня'};
    const choice={steps,asOf,symbol:input.symbol||null,plan:null,ready:false,
      side:null,status:'WATCH',reason:'Ожидание последовательных подтверждений'};
    const update=(name,ev,kind='CONFIRMED')=>{
      const s=byName(steps,name);s.status=kind;
      s.at=ev?.at??null;s.level=ev?.level??null;s.price=ev?.price??null;
      s.note=ev?.note||'';
    };
    const chochEvents=(input.chochEvents||[]).filter(ev=>ev?.type==='CHOCH'&&
      isNum(ev.at)&&ev.at<=asOf).sort((a,b)=>b.at-a.at);
    let chosen=null;
    for(const ch of chochEvents){
      const matching=sweepEvents.filter(e=>e.dir===ch.dir&&e.at<ch.at&&
        ch.at-e.at<=HORIZON).at(-1);
      if(matching){chosen={sweep:matching,choch:ch};break;}
    }
    const sweep=chosen?.sweep||sweepEvents.at(-1),side=chosen?.choch?.dir||sweep.dir;
    choice.side=side;
    const t15=input.context?.t15,t30=input.context?.t30;
    const contrary=side==='LONG'?'SHORT':'LONG';
    const contextOk=t15===side&&t30!==contrary&&
      ['LONG','SHORT','MIXED'].includes(t30);
    if(contextOk)update('context',{at:asOf,note:'15m '+t15+' · 30m '+t30});
    else byName(steps,'context').note='15m '+(t15||'NO DATA')+
      ' · 30m '+(t30||'NO DATA')+' · ожидаем согласование';
    update('sweep',sweep);
    if(!chosen)return {...choice,reason:'После SWEEP ожидаем 10m CHOCH'};
    const choch={name:'choch',...chosen.choch,note:'10m защищённый HL/LH · закрытая свеча'};
    update('choch',choch);
    const mss=mssAfter(five,choch).find(e=>e.at>choch.at);
    if(!mss)return {...choice,reason:'Ожидаем 5m MSS после CHOCH'};
    update('mss',mss);
    const retest=retestAfter(three,five,mss,asOf).find(e=>e.at>mss.at);
    if(!retest)return {...choice,reason:'Ожидаем 3m RETEST + подтверждённый HL/LH'};
    update('retest',retest);
    const micro=microAfter(one,retest).find(e=>e.at>retest.at);
    if(!micro)return {...choice,reason:'Ожидаем 1m Micro-BOS с объёмом'};
    update('micro',micro);
    // Invalidate if the original sweep extreme was lost before micro confirmation.
    const lost=one.find(b=>b.time+60>sweep.at&&b.time+60<=micro.at&&
      (side==='LONG'?b.close<sweep.extreme:b.close>sweep.extreme));
    if(lost){
      update('micro',{at:lost.time+60,level:sweep.extreme,price:lost.close,
        note:'Цена нарушила экстремум SWEEP'},'INVALIDATED');
      return {...choice,status:'INVALIDATED',reason:'SWEEP структурно инвалидирован'};
    }
    if(asOf-micro.at>TRIGGER_AGE)
      return {...choice,status:'WAIT',reason:'1m вход устарел · ожидаем новый Micro-BOS'};
    const plan=risk(micro,retest,five,levelData,meta);
    if(!plan||plan.rr===null){
      byName(steps,'risk').note=plan?.reason||'Не подтверждён structural SL';
      return {...choice,plan,reason:'Не найдена достоверная ближайшая цель/стоп'};
    }
    update('risk',{at:micro.at,level:plan.target,price:plan.entry,
      note:'SL '+plan.stop.toPrecision(8)+' · TP '+plan.target.toPrecision(8)+
        ' · R:R '+plan.rr.toFixed(2)},plan.rr>=2?'CONFIRMED':'WAIT');
    if(!contextOk||plan.rr<2)return {...choice,plan,
      reason:!contextOk?'Контекст 30m/15m не согласован':'R:R < 1:2'};
    // A historical confirmation is NOT a current entry: stop/target hits
    // after the 1m trigger invalidate further readiness.
    const after=one.filter(b=>b.time+60>micro.at&&b.time+60<=asOf);
    const stopHit=after.find(b=>side==='LONG'?b.low<=plan.stop:b.high>=plan.stop);
    const targetHit=after.find(b=>side==='LONG'?b.high>=plan.target:b.low<=plan.target);
    if(stopHit||targetHit){
      const exit=stopHit&&targetHit?
        (stopHit.time<=targetHit.time?stopHit:targetHit):stopHit||targetHit;
      update('risk',{at:exit.time+60,level:stopHit===exit?plan.stop:plan.target,
        price:exit.close,note:stopHit===exit?
          'После входа достигнут structural SL':'Следующая цель уже достигнута'},
        'INVALIDATED');
      return {...choice,plan,status:'INVALIDATED',
        reason:stopHit===exit?'Structural SL нарушен':'Цель достигнута · новый вход запрещён'};
    }
    return {...choice,plan,status:'CONFIRMED',ready:true,
      reason:'Семь условий V2 подтверждены · только исследовательский сигнал'};
  }
  root.ASCEND_CONFIRMATION_V2=Object.freeze({
    analyze,rows,combine,swings,sweeps,mssAfter,retestAfter,microAfter,atrAt,risk
  });
})(typeof window!=='undefined'?window:globalThis);
