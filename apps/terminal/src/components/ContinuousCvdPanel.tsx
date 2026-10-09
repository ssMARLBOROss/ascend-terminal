import {useMemo,useState} from 'react';
import type {ContinuousCvd} from '../market/useContinuousCvd';
import type {CvdPoint,CvdInterval} from '../market/cvdEngine';

function fmt(value:number,dp=3){
  if(!Number.isFinite(value))return '—';
  return (value>0?'+':'')+value.toLocaleString('en-US',{maximumFractionDigits:dp});
}
function time(ts:number){
  return new Date(ts).toLocaleTimeString('ru-RU',{
    timeZone:'UTC',hour:'2-digit',minute:'2-digit',second:'2-digit'
  });
}
function Plot({points,metric,onHover,hovered}:{
  points:CvdPoint[];metric:'delta'|'cumulative';
  onHover:(at:number)=>void;hovered:number;
}){
  const bars=points.slice(-96);
  const selected=hovered<0?bars.length-1:bars.findIndex(p=>p.time===hovered);
  if(bars.length<2)return <div className="asc-cvd-empty">
    График появится после накопления нескольких интервалов · NO HISTORY BEFORE CONNECTION
  </div>;
  const values=bars.map(p=>p[metric]),hi=Math.max(0,...values),lo=Math.min(0,...values);
  const gap=Math.max(1e-8,hi-lo),x=(i:number)=>12+i/Math.max(1,bars.length-1)*600;
  const y=(v:number)=>103-(v-(lo-gap*.1))/(gap*1.2)*88;
  const baseline=y(0);
  const lines:string[]=[];
  let segment='';
  for(let i=0;i<bars.length;i++){
    if(i>0&&bars[i].time-bars[i-1].time!==bars[1].time-bars[0].time){
      if(segment)lines.push(segment);
      segment='';
    }
    segment+=(segment?' ':'')+x(i).toFixed(2)+','+y(values[i]).toFixed(2);
  }
  if(segment)lines.push(segment);
  const first=bars[0].time,last=bars.at(-1)!.time,range=Math.max(1,last-first);
  return <svg viewBox="0 0 625 120" preserveAspectRatio="none"
    className="asc-cvd-plot" role="img"
    aria-label={metric==='delta'?'Bybit per-interval taker delta':'Accumulated live CVD'}
    onMouseMove={event=>{
      const bbox=event.currentTarget.getBoundingClientRect();
      const target=first+Math.min(1,Math.max(0,(event.clientX-bbox.left)/bbox.width))*range;
      let nearest=bars[0];for(const p of bars)if(Math.abs(p.time-target)<Math.abs(nearest.time-target))nearest=p;
      onHover(nearest.time);
    }} onMouseLeave={()=>onHover(-1)}>
    <line x1="10" x2="612" y1={baseline} y2={baseline}
      stroke="#4d6576" strokeDasharray="4 5" strokeWidth="1"/>
    {metric==='delta'?bars.map((p,i)=><line key={p.time}
      x1={x(i)} x2={x(i)} y1={baseline} y2={y(p.delta)}
      stroke={p.delta>=0?'#5cdbad':'#e47c90'}
      strokeWidth={Math.max(2,Math.min(8,460/bars.length))}/>)
    :lines.map((line,i)=><polyline key={i} points={line}
      fill="none" stroke="#f0c36f" strokeWidth="2.3" strokeLinejoin="round"/>)}
    {selected>=0&&<line x1={x(selected)} x2={x(selected)} y1="8" y2="109"
      stroke="#e1e7ef" strokeDasharray="3 3" strokeWidth="1"/>}
  </svg>;
}

export default function ContinuousCvdPanel({symbol,live,interval,onInterval}:{
  symbol:string;live:ContinuousCvd;interval:CvdInterval;
  onInterval:(tf:CvdInterval)=>void;
}){
  const[hovered,setHovered]=useState(-1);
  const[mode,setMode]=useState<'cumulative'|'delta'>('cumulative');
  const d=live.data;
  const point=useMemo(()=>{
    if(!d?.points.length)return undefined;
    return hovered>=0?d.points.find(p=>p.time===hovered):d.points.at(-1);
  },[d,hovered]);
  const quality=d?.health==='LIVE'?'ONLINE · FROM CONNECTED SEGMENT':
    d?.health==='GAP'?'GAP · UNKNOWN MISSING TRADES':
    live.status==='CONNECTING'?'CONNECTING':'STALE / NO DATA';
  return <section className="asc-cvd-panel" aria-label="ASCEND CVD Stream V1">
    <header className="asc-cvd-head">
      <div><b>CVD · EXECUTED TRADES / {symbol}</b>
        <small>Накопление по агрессору · Bybit publicTrade · только текущий непрерывный сегмент</small></div>
      <div className="asc-cvd-status">
        <strong className={live.status==='LIVE'?'online':live.status==='GAP'?'gap':''}>
          {quality}</strong>
        <small>{d&&d.trades?time(d.startedAt)+'–'+time(d.lastTradeAt)+' UTC':'ожидание первой сделки'}</small>
      </div>
    </header>
    <div className="asc-cvd-stats">
      <div><span>CVD · base asset</span><strong className={d&&d.volumeDelta>=0?'positive':'negative'}>
        {d&&d.trades?fmt(d.volumeDelta):'NO DATA'}</strong></div>
      <div><span>BUY / SELL</span><strong>{d&&d.trades?
        d.buyVolume.toFixed(3)+' / '+d.sellVolume.toFixed(3):'—'}</strong></div>
      <div><span>Δ в USDT (notional)</span><strong>{d&&d.trades?fmt(d.notionalDelta,0):'NO DATA'}</strong></div>
      <div><span>Сделок получено</span><strong>{d?.trades??0}</strong></div>
    </div>
    <div className="asc-cvd-plot-controls">
      <div className="asc-cvd-button-row">
        {(['1m','5m','15m'] as CvdInterval[]).map(tf=>
          <button type="button" key={tf} className={tf===interval?'selected':''}
            aria-pressed={tf===interval} onClick={()=>onInterval(tf)}>{tf}</button>)}
      </div>
      <div className="asc-cvd-button-row">
        <button type="button" className={mode==='cumulative'?'selected':''}
          aria-pressed={mode==='cumulative'} onClick={()=>setMode('cumulative')}>CVD линия</button>
        <button type="button" className={mode==='delta'?'selected':''}
          aria-pressed={mode==='delta'} onClick={()=>setMode('delta')}>Delta свечей</button>
      </div>
    </div>
    <Plot points={d?.points??[]} metric={mode} hovered={hovered} onHover={setHovered}/>
    <div className="asc-cvd-bar-meta">
      {point?<><span>{time(point.time)} UTC · {point.isClosed?'закрытый интервал':'текущий интервал'}</span>
        <b>BUY {point.buyVolume.toFixed(3)} · SELL {point.sellVolume.toFixed(3)} ·
          Δ {fmt(point.delta)} · CVD {fmt(point.cumulative)}</b></>:
        <span>Нет исторической непрерывной линии до подключения WebSocket.</span>}
    </div>
    <div className="asc-cvd-interpretation">
      <b>PRICE ↔ CVD · ПО ЗАКРЫТЫМ ИНТЕРВАЛАМ</b>
      <span>{d?.health!=='LIVE'||!d.trades?'NO DATA':
        d.signal==='PRICE_UP_DELTA_DOWN'?'Цена растёт, дельта ослабевает · возможное расхождение (не сигнал).':
        d.signal==='PRICE_DOWN_DELTA_UP'?'Цена снижается, дельта усиливается · возможное расхождение (не сигнал).':
        d.signal==='ALIGNED'?'Цена и изменение дельты не показывают этого типа расхождения.':
        'Недостаточно двух полных соседних интервалов.'}</span>
    </div>
    {(d?.health==='GAP'||d?.health==='STALE')&&<p className="asc-cvd-gap">
      Пропуск потока: {d.gapReason??'нет свежих сделок'}. Следующее подключение начнёт
      новый сегмент с нуля. Старые и новые значения не суммируются.
    </p>}
    <footer>Качество: точная классификация исполненных сделок *внутри полученного потока*.
      Открытая вкладка обязательна; нет серверного сбора 24/7, нет backfill пропусков.
      Это аналитика, не разрешение входа ASCEND.</footer>
  </section>;
}
