/* ASCEND SMC Target Liquidit V1 — own observational proxy, not TradingView script.
 * ONLY draws on a separate chart canvas; never sends events into Structure Engine,
 * Confirmation, ENTRY READY, manual/PAPER or real orders.
 * Fixed UTC-4 for the screenshots' named session windows; not DST-aware.
 */
(function(root){
  'use strict';
  const NAME='SMC Target Liquidit', KEY='asc_smctl_v1';
  const TF=Object.freeze({'1m':60,'3m':180,'5m':300,'10m':600,'15m':900,'30m':1800,'45m':2700,'1h':3600,'2h':7200,'4h':14400,'6h':21600,'12h':43200,'1d':86400});
  const CONFIG=Object.freeze({pivot:10,internal:3,external:25,maxTargets:5,maxBlocks:10,tzHours:-4});
  const SESSIONS=Object.freeze([
    {key:'ASIA',name:'Азия',from:20*60,to:24*60,color:'#e5c642'},
    {key:'LONDON',name:'Лондон',from:2*60,to:5*60,color:'#00a99a'},
    {key:'NY_AM',name:'Нью-Йорк AM',from:8*60+30,to:11*60,color:'#e98e35'}
  ]);
  const $=id=>document.getElementById(id);
  const number=x=>Number.isFinite(Number(x));
  const format=x=>Number(x).toLocaleString('ru-RU',{maximumFractionDigits:Math.abs(x)>=1?4:8});
  const clock=t=>number(t)?new Date(t*1000).toISOString().slice(0,16).replace('T',' ')+' UTC':'—';
  function sessionAt(t){
    if(!number(t))return null;
    const minute=((Math.floor((Number(t)+CONFIG.tzHours*3600)/60)%1440)+1440)%1440;
    return SESSIONS.find(s=>minute>=s.from&&minute<s.to)||null;
  }
  function prepared(input,seconds,asOf){
    if(!Array.isArray(input)||!number(seconds)||seconds<=0||!number(asOf))return [];
    const complete=input.filter(x=>number(x&&x.time)&&Number(x.time)+seconds<=asOf)
      .sort((a,b)=>Number(a.time)-Number(b.time));
    const rows=[];let previous=null;
    for(const raw of complete){
      const b={time:Number(raw.time),open:Number(raw.open),high:Number(raw.high),
        low:Number(raw.low),close:Number(raw.close),volume:Number(raw.volume)};
      if(b.time%seconds!==0||![b.open,b.high,b.low,b.close].every(Number.isFinite)||
        b.low<=0||b.high<b.low||b.open<b.low||b.open>b.high||
        b.close<b.low||b.close>b.high)return [];
      if(previous!==null&&b.time<=previous)return [];
      if(previous!==null&&b.time-previous!==seconds)rows.length=0; // no bridging gaps
      rows.push(b);previous=b.time;
    }
    return rows;
  }
  function pivots(bars,seconds,wing){
    const out=[];
    for(let i=wing;i+wing<bars.length;i++){
      const b=bars[i],around=bars.slice(i-wing,i).concat(bars.slice(i+1,i+wing+1));
      const knownAt=bars[i+wing].time+seconds;
      if(around.every(x=>x.high<b.high))
        out.push({id:'H-'+wing+'-'+b.time,type:'HIGH',price:b.high,at:b.time,knownAt});
      if(around.every(x=>x.low>b.low))
        out.push({id:'L-'+wing+'-'+b.time,type:'LOW',price:b.low,at:b.time,knownAt});
    }
    return out.sort((a,b)=>a.knownAt-b.knownAt||a.at-b.at);
  }
  function pattern(list){
    const his=list.filter(p=>p.type==='HIGH'),los=list.filter(p=>p.type==='LOW');
    const ph=his.at(-2),h=his.at(-1),pl=los.at(-2),l=los.at(-1);
    const highLabel=!h||!ph?null:h.price>ph.price?'HH':h.price<ph.price?'LH':'EH';
    const lowLabel=!l||!pl?null:l.price>pl.price?'HL':l.price<pl.price?'LL':'EL';
    const trend=highLabel==='HH'&&lowLabel==='HL'?'LONG':
      highLabel==='LH'&&lowLabel==='LL'?'SHORT':'WAIT';
    return {highLabel,lowLabel,trend};
  }
  function withLabels(list){
    const seenHi=[],seenLo=[];
    return list.map(p=>{
      const group=p.type==='HIGH'?seenHi:seenLo,prior=group.at(-1);
      const label=!prior?(p.type==='HIGH'?'H':'L'):
        p.type==='HIGH'?(p.price>prior.price?'HH':p.price<prior.price?'LH':'EH'):
        p.price>prior.price?'HL':p.price<prior.price?'LL':'EL';
      group.push(p);
      return {...p,label};
    });
  }
  function breaksAndBlocks(bars,seconds,external){
    const events=[],blocks=[],seen=new Set();
    for(let i=1;i<bars.length;i++){
      const b=bars[i],prev=bars[i-1],known=external.filter(x=>x.knownAt<=b.time);
      if(known.length<3)continue;
      const p=pattern(known),high=known.filter(x=>x.type==='HIGH').at(-1),
        low=known.filter(x=>x.type==='LOW').at(-1);
      const bull=high&&prev.close<=high.price&&b.close>high.price&&!seen.has(high.id);
      const bear=low&&prev.close>=low.price&&b.close<low.price&&!seen.has(low.id);
      if(!bull&&!bear)continue;
      const side=bull?'LONG':'SHORT',target=bull?high:low;
      seen.add(target.id);
      const kind=p.trend==='WAIT'?'BREAK':p.trend===side?'BOS':'CHOCH';
      const ev={type:kind,side,level:target.price,at:b.time,knownAt:b.time+seconds,
        pivotAt:target.at,pivotKnownAt:target.knownAt};
      events.push(ev);
      // Research-only candidate: last opposite candle before a closed external break.
      const prior=bars.slice(Math.max(0,i-6),i).reverse()
        .find(x=>bull?x.close<x.open:x.close>x.open);
      if(!prior)continue;
      blocks.push({id:'OB-'+b.time+'-'+side,side,type:'OB proxy',
        low:prior.low,high:prior.high,originAt:prior.time,
        knownAt:ev.knownAt,trigger:kind,triggerAt:b.time,level:target.price});
    }
    const active=blocks.filter(z=>!bars.some(b=>b.time>=z.knownAt &&
      (z.side==='LONG'?b.close<z.low:b.close>z.high)));
    return {events:events.slice(-12),blocks:active.slice(-CONFIG.maxBlocks)};
  }
  function scan(input,tf,asOf){
    const seconds=TF[tf],none={status:'NO DATA',reason:'Нет проверенных закрытых свечей',
      bars:[],targets:[],internal:[],external:[],events:[],blocks:[],asOf,step:seconds||null};
    if(!seconds||!number(asOf))return none;
    const bars=prepared(input,seconds,Number(asOf));
    if(bars.length<2*CONFIG.external+3)return {...none,bars,
      reason:'Недостаточно непрерывных закрытых '+tf+' свечей: нужно не менее '+(2*CONFIG.external+3)};
    if(Number(asOf)-(bars.at(-1).time+seconds)>Math.max(2*seconds,180))
      return {...none,bars,reason:'История устарела · ожидаем свежие закрытые свечи'};
    const ti=pivots(bars,seconds,CONFIG.pivot);
    const internal=withLabels(pivots(bars,seconds,CONFIG.internal));
    const external=withLabels(pivots(bars,seconds,CONFIG.external));
    const open=ti.filter(p=>{
      const s=sessionAt(p.at);
      return !!s&&!bars.some(b=>b.time>=p.knownAt &&
        (p.type==='HIGH'?b.high>=p.price:b.low<=p.price));
    }).map(p=>({...p,session:sessionAt(p.at)})).slice(-CONFIG.maxTargets);
    const result=breaksAndBlocks(bars,seconds,external);
    return {status:'RESEARCH',reason:null,bars,targets:open,internal,external,
      events:result.events,blocks:result.blocks,asOf:Number(asOf),step:seconds};
  }
  root.ASCEND_SMC_TARGET_LIQUIDIT_V1=Object.freeze({scan,pivots,sessionAt,CONFIG,TF});

  let settings={targets:false,structure:false,blocks:false,radar:false},ready=false,subscribed=false;
  let lastResult=null,lastRadar=null,lastSignature='',lastView='',lastAsOf=0;
  function persist(){try{localStorage.setItem(KEY,JSON.stringify(settings))}catch(_){}}
  function restore(){
    try{
      const saved=JSON.parse(localStorage.getItem(KEY)||'{}');
      ['targets','structure','blocks','radar'].forEach(k=>{settings[k]=saved[k]===true});
    }catch(_){}
  }
  function node(tag,className,textValue){
    const el=document.createElement(tag);if(className)el.className=className;
    if(textValue!==undefined)el.textContent=textValue;return el;
  }
  function mount(){
    if(ready||!$('tfBar')||!$('chartShell'))return;
    const button=node('button','asc-tl-launch',NAME);
    button.id='ascTLButton';button.type='button';button.setAttribute('aria-expanded','false');
    button.setAttribute('aria-controls','ascTLPanel');
    const panel=node('section','asc-tl-panel');panel.id='ascTLPanel';panel.hidden=true;
    panel.setAttribute('aria-label',NAME+' · исследование');
    const header=node('div','asc-tl-header'),title=node('strong','',NAME);
    const close=node('button','','×');close.type='button';close.title='Закрыть панель';
    close.addEventListener('click',()=>toggle(false));header.append(title,close);panel.appendChild(header);
    panel.appendChild(node('p','asc-tl-note','Один инструмент · данные MEXC OHLCV · только наблюдение. Не оригинальные алгоритмы TradingView.'));
    const opts=node('div','asc-tl-options');
    const labels=[
      ['radar','Радар зон · 2–3 ближайшие · ATR14 (30m)'],
      ['targets','Цели ликвидности · Pivot 10 · до 5'],
      ['structure','Внутренняя 3 / внешняя 25 · структура'],
      ['blocks','Блоки ордеров · до 10 · исследование']
    ];
    labels.forEach(([key,label])=>{
      const line=node('label','asc-tl-option'),input=node('input');
      input.type='checkbox';input.dataset.tlLayer=key;input.checked=settings[key];
      input.addEventListener('change',()=>{settings[key]=input.checked;persist();draw(true)});
      line.append(input,node('span','',label));opts.appendChild(line);
    });
    panel.appendChild(opts);
    panel.appendChild(node('div','asc-tl-zone-radar','Радар выключен')).id='ascTLRadar';
    panel.appendChild(node('div','asc-tl-status','NO DATA · ожидаем подтверждённые свечи')).id='ascTLStatus';
    panel.appendChild(node('div','asc-tl-items')).id='ascTLItems';
    panel.appendChild(node('div','asc-tl-detail','Выберите строку уровня, чтобы узнать время подтверждения.')).id='ascTLDetail';
    const foot=node('small','asc-tl-foot','UTC−4 фиксированный · без автоперехода DST · уровни появляются после подтверждения правыми свечами.');
    panel.appendChild(foot);
    const canvas=node('canvas','asc-tl-canvas');canvas.id='ascTLCanvas';canvas.setAttribute('aria-hidden','true');
    $('chartShell').append(canvas,panel);$('tfBar').appendChild(button);
    button.addEventListener('click',()=>toggle(panel.hidden));
    panel.addEventListener('keydown',ev=>{if(ev.key==='Escape')toggle(false)});
    ready=true;
    if(typeof ResizeObserver!=='undefined')new ResizeObserver(()=>{
      if(settings.targets||settings.structure||settings.blocks||settings.radar)plot(lastResult);
    }).observe($('chartShell'));
    draw(true);
  }
  function toggle(open){
    const panel=$('ascTLPanel'),button=$('ascTLButton');if(!panel||!button)return;
    panel.hidden=!open;button.setAttribute('aria-expanded',String(open));
    if(open&&root.ASCEND_AXIS_CHART_V1?.close)root.ASCEND_AXIS_CHART_V1.close();
    draw(true);
  }
  function info(title,details){
    const el=$('ascTLDetail');if(!el)return;
    el.replaceChildren();
    el.appendChild(node('strong','',title));
    details.forEach(([k,v])=>{const row=node('div','asc-tl-fact');
      row.append(node('span','',k),node('b','',String(v)));el.appendChild(row)});
  }
  function renderRadar(){
    const box=$('ascTLRadar');if(!box)return;
    box.replaceChildren();
    if(!settings.radar){box.appendChild(node('div','asc-tl-empty','Радар выключен'));return}
    const data=lastRadar;
    if(!data||data.status!=='RESEARCH'){
      box.appendChild(node('div','asc-tl-empty','NO DATA · '+(data?.reason||'Радар ждёт проверенные свечи')));
      return;
    }
    const head=node('div','asc-tl-radar-head','РАДАР ЗОН · '+data.zones.length+
      ' ближайших · 30m ATR14 '+format(data.atr)+' · '+(data.trend==='LONG'?'ТРЕНД ВВЕРХ':data.trend==='SHORT'?'ТРЕНД ВНИЗ':'ТРЕНД НЕЙТРАЛЬНЫЙ'));
    box.appendChild(head);
    if(!data.zones.length)box.appendChild(node('div','asc-tl-empty','Нет подтверждённых уровней'));
    for(const z of data.zones){
      const b=node('button','asc-tl-radar-item');b.type='button';
      b.appendChild(node('strong','',z.label+' · '+format(z.low)+'–'+format(z.high)));
      b.appendChild(node('span','',z.status+' · приоритет '+z.priority+'/4'));
      b.appendChild(node('small','',z.kind==='SUPPORT'?'Спрос':'Предложение'));
      const dist=z.distPct===null?'—':z.distPct.toFixed(2)+'%';
      b.appendChild(node('small','', 'До зоны '+dist+' · '+(z.trendAligned?'по тренду':'против тренда / переход')));
      b.addEventListener('click',()=>info('ЗОНА · '+format(z.price),[
        ['Источник',z.sources.join(', ')],['Статус',z.status],
        ['Диапазон',format(z.low)+'–'+format(z.high)],
        ['Ширина','±0,25 ATR14 (30m)'],
        ['Появление',clock(z.originAt)],['Известна с',clock(z.knownAt)],
        ['Снятие (кандидат)',clock(z.sweepAt)],['Возврат',clock(z.reclaimAt)],
        ['Пробой 5m',clock(z.breakAt)],['Объём 5m ≥1,5× среднего',z.volumeConfirmed?'ДА':'НЕТ'],
        ['Риск','Реакция зоны не является ENTRY READY']
      ]));
      box.appendChild(b);
    }
    box.appendChild(node('small','asc-tl-radar-disclaimer','Только наблюдение. Обновление по закрытым свечам 30m/5m. Не открывает сделки.'));
  }
  function listItems(result){
    const box=$('ascTLItems'),status=$('ascTLStatus');if(!box||!status)return;
    renderRadar();
    box.replaceChildren();
    if(!result||result.status!=='RESEARCH'){
      status.textContent=settings.targets||settings.structure||settings.blocks?
        'NO DATA · '+(result?.reason||'Ожидаем историю'):'Дополнительные слои выключены';return;
    }
    status.textContent='MEXC · '+(typeof state!=='undefined'?state.symbol:'—')+
      ' · '+(typeof state!=='undefined'?state.timeframe:'—')+' · '+result.bars.length+
      ' закрытых свечей · '+clock(result.bars.at(-1).time+result.step);
    const items=[];
    if(settings.targets)result.targets.slice().reverse().forEach(p=>{
      items.push({label:p.session.name+' '+(p.type==='HIGH'?'H':'L')+' · '+format(p.price),
        detail:['Потенциальная цель, не сигнал','Pivot '+CONFIG.pivot],
        item:p,kind:'target'});
    });
    if(settings.structure)result.external.slice(-3).reverse().forEach(p=>{
      items.push({label:'ВНЕШНЯЯ '+p.label+' · '+format(p.price),item:p,kind:'swing'});
    });
    if(settings.structure)result.internal.slice(-3).reverse().forEach(p=>{
      items.push({label:'ВНУТРЕННЯЯ '+p.label+' · '+format(p.price),item:p,kind:'swing'});
    });
    if(settings.structure)result.events.slice(-2).reverse().forEach(e=>{
      items.push({label:e.type+' '+(e.side==='LONG'?'↑':'↓')+' · '+format(e.level),item:e,kind:'break'});
    });
    if(settings.blocks)result.blocks.slice(-CONFIG.maxBlocks).reverse().forEach(z=>{
      items.push({label:'OB-кандидат '+(z.side==='LONG'?'спрос':'предложение')+' · '+format(z.low)+'–'+format(z.high),
        item:z,kind:'block'});
    });
    if(!items.length){box.appendChild(node('div','asc-tl-empty','Нет подтверждённых элементов для выбранных слоёв'));return}
    items.forEach(entry=>{
      const b=node('button','asc-tl-item',entry.label);b.type='button';
      b.addEventListener('click',()=>{
        const p=entry.item,common=[['Источник','MEXC · закрытые OHLCV'],['Таймфрейм',typeof state!=='undefined'?state.timeframe:'—']];
        if(entry.kind==='target')info(entry.label,common.concat([
          ['Сессия',p.session.name+' (фикс. UTC−4)'],['Экстремум',clock(p.at)],
          ['Подтверждение',clock(p.knownAt)],['Уровень',format(p.price)],
          ['Статус','Не снят на доступной истории · RESEARCH']]));
        if(entry.kind==='swing')info(entry.label,common.concat([
          ['Экстремум',clock(p.at)],['Подтверждение',clock(p.knownAt)],
          ['Цена',format(p.price)],['Статус','Подтверждённый pivot, не прогноз']]));
        if(entry.kind==='break')info(entry.label,common.concat([
          ['Уровень pivot',format(p.level)],['Pivot',clock(p.pivotAt)],
          ['Pivot подтверждён',clock(p.pivotKnownAt)],['Пробой закрытием',clock(p.knownAt)],
          ['Классификация',p.type+' · исследовательский расчёт']]));
        if(entry.kind==='block')info(entry.label,common.concat([
          ['Исходная свеча',clock(p.originAt)],['Подтверждён после пробоя',clock(p.knownAt)],
          ['Границы',format(p.low)+' – '+format(p.high)],
          ['Статус','Кандидат OHLCV, не оригинальный Order Block Mxwll']]));
      });box.appendChild(b);
    });
  }
  function plot(result){
    const canvas=$('ascTLCanvas'),shell=$('chartShell');
    if(!canvas||!shell)return;
    const w=shell.clientWidth,h=shell.clientHeight,dpr=Math.min(2,root.devicePixelRatio||1);
    if(w<=0||h<=0)return;
    canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);
    canvas.style.width=w+'px';canvas.style.height=h+'px';
    const ctx=canvas.getContext('2d');if(!ctx)return;
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
    if(typeof chart==='undefined'||!chart||typeof candles==='undefined'||!candles)return;
    const yOf=price=>candles.priceToCoordinate(Number(price));
    const xOf=t=>chart.timeScale().timeToCoordinate(Number(t));
    const write=(s,x,y,color)=>{
      ctx.fillStyle=color;ctx.font='600 10px system-ui';
      ctx.fillText(s,Math.max(6,Math.min(w-148,x)),Math.max(12,Math.min(h-7,y)));
    };
    if(settings.radar&&lastRadar?.status==='RESEARCH'){
      lastRadar.zones.forEach(z=>{
        const y1=yOf(z.low),y2=yOf(z.high);
        if(![y1,y2].every(Number.isFinite))return;
        const top=Math.min(y1,y2),height=Math.max(1,Math.abs(y1-y2));
        if(top>h||top+height<0)return;
        ctx.fillStyle=z.kind==='SUPPORT'?'rgba(26,185,133,.07)':'rgba(224,97,108,.07)';
        ctx.strokeStyle=z.kind==='SUPPORT'?'rgba(26,185,133,.7)':'rgba(224,97,108,.7)';
        ctx.lineWidth=1;ctx.setLineDash([5,5]);
        ctx.fillRect(8,top,Math.max(1,w-65),height);
        ctx.strokeRect(8,top,Math.max(1,w-65),height);
        ctx.setLineDash([]);
        write('ЗОНА '+format(z.price)+' · '+z.status.slice(0,16),12,top+12,ctx.strokeStyle);
      });
    }
    if(!result||result.status!=='RESEARCH')return;
    if(settings.blocks){
      // Only 2 nearby zones drawn to prevent chart clutter; all 10 remain in list.
      result.blocks.slice(-2).forEach(z=>{
        const y1=yOf(z.low),y2=yOf(z.high),x=xOf(z.knownAt-result.step);
        if(![y1,y2,x].every(Number.isFinite))return;
        const top=Math.min(y1,y2),bottom=Math.max(y1,y2);
        ctx.fillStyle=z.side==='LONG'?'rgba(30,179,127,.11)':'rgba(219,84,111,.10)';
        ctx.strokeStyle=z.side==='LONG'?'#178e72':'#ba526b';
        ctx.setLineDash([3,5]);ctx.fillRect(Math.max(8,x),top,Math.max(0,w-60-Math.max(8,x)),bottom-top);
        ctx.strokeRect(Math.max(8,x),top,Math.max(0,w-60-Math.max(8,x)),bottom-top);
        ctx.setLineDash([]);
      });
    }
    if(settings.targets)result.targets.forEach(p=>{
      const y=yOf(p.price),x=xOf(p.knownAt-result.step);
      if(!Number.isFinite(y)||!Number.isFinite(x))return;
      const sx=Math.max(10,x),ex=w-54;
      if(sx>=ex)return;
      ctx.strokeStyle=p.session.color;ctx.lineWidth=1.6;ctx.setLineDash([6,4]);
      ctx.beginPath();ctx.moveTo(sx,y);ctx.lineTo(ex,y);ctx.stroke();ctx.setLineDash([]);
      write(p.session.name+' '+(p.type==='HIGH'?'H':'L'),sx+5,y-5,p.session.color);
    });
    if(settings.structure){
      const recent=[
        ...result.external.slice(-3).map(p=>({...p,prefix:'В'})),
        ...result.internal.slice(-3).map(p=>({...p,prefix:'М'}))
      ];
      recent.forEach(p=>{
        // Place the label on the last confirming candle, never on an unknowable past pivot.
        const x=xOf(p.knownAt-result.step),y=yOf(p.price);
        if(!Number.isFinite(x)||!Number.isFinite(y))return;
        write(p.prefix+' '+p.label,x-5,y+(p.type==='HIGH'?-12:17),
          p.label==='LH'||p.label==='LL'?'#ee7387':'#66d8b0');
      });
      result.events.slice(-2).forEach(e=>{
        const x=xOf(e.at),y=yOf(e.level);
        if(Number.isFinite(x)&&Number.isFinite(y))
          write(e.type+(e.side==='LONG'?' ↑':' ↓'),x,y-8,e.side==='LONG'?'#4fd9ab':'#f28ca0');
      });
    }
  }
  function readRadar(){
    if(typeof state==='undefined'||!state.tf)return null;
    const engine=root.ASCEND_SMC_ZONE_RADAR_V1;
    return engine?engine.scan({rows30:state.tf['30m']||[],rows5:state.tf['5m']||[],asOf:Date.now()/1000}):
      {status:'NO DATA',reason:'Модуль радара не загружен',zones:[]};
  }
  function read(){
    if(typeof state==='undefined'||!state.tf)return null;
    const tf=state.timeframe,raw=state.tf[tf]||[],step=TF[tf];
    if(!step)return scan([],tf,Date.now()/1000);
    const asOf=Date.now()/1000;
    return scan(raw,tf,asOf);
  }
  function draw(force){
    if(!ready)return;
    const active=settings.targets||settings.structure||settings.blocks||settings.radar;
    const frame=typeof state!=='undefined'?state.symbol+'|'+state.timeframe:'?';
    const data=typeof state!=='undefined'&&Array.isArray(state.tf[state.timeframe])?
      state.tf[state.timeframe]:[];
    const end=data.at(-1),h30=state?.tf?.['30m']?.at(-1),h5=state?.tf?.['5m']?.at(-1);
    const signature=frame+'|'+data.length+'|'+(end?.time||0)+'|'+(end?.close||0)+'|'+
      (h30?.time||0)+'|'+(h30?.close||0)+'|'+(h5?.time||0)+'|'+(h5?.close||0)+'|'+
      settings.targets+'|'+settings.structure+'|'+settings.blocks+'|'+settings.radar;
    const panelOpen=!$('ascTLPanel').hidden;
    if(!active&&!panelOpen){$('ascTLCanvas').hidden=true;lastSignature='';return;}
    if(!force&&signature===lastSignature&&!panelOpen)return;
    lastSignature=signature;
    lastResult=settings.targets||settings.structure||settings.blocks?read():null;
    lastRadar=settings.radar?readRadar():null;
    if(panelOpen)listItems(lastResult);
    $('ascTLCanvas').hidden=!active;
    if(active)plot(lastResult);
  }
  function start(){
    restore();mount();
    if(!ready)return;
    setInterval(()=>{
      if(typeof state==='undefined'||!state.chartReady)return;
      if(!subscribed&&typeof chart!=='undefined'&&chart){
        chart.timeScale().subscribeVisibleLogicalRangeChange(()=>{if(settings.targets||settings.structure||settings.blocks||settings.radar)plot(lastResult)});
        subscribed=true;
        draw(true); // Chart becomes ready after the initial DOM mount.
      }
      if(!document.hidden&&document.body.dataset.view==='market')draw(false);
    },2000);
    root.ASCEND_SMC_TARGET_LIQUIDIT_UI=Object.freeze({
      open:()=>toggle(true),close:()=>toggle(false),refresh:()=>draw(true),
      enabled:()=>({...settings})
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})(window);
