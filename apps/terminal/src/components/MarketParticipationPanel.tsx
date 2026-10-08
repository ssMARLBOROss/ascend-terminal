import {useMemo,useState} from 'react';
import type {ParticipationSnapshot,ParticipationField} from '../market/marketParticipationEngine';
import type {ParticipationJournal} from '../market/useMarketParticipation';
import {downloadParticipationJournal} from '../market/useMarketParticipation';
import type {FvgRecord} from '../market/fvgContextEngine';

const fmt=(v:number|undefined|null,dp=2)=>v===undefined||v===null?'NO DATA':
  v.toLocaleString('en-US',{maximumFractionDigits:dp});
const clock=(t:number|undefined|null)=>t?new Date(t).toLocaleTimeString('ru-RU',
  {timeZone:'UTC',hour:'2-digit',minute:'2-digit',second:'2-digit'}):'—';
const scenarioLabels:Record<ParticipationSnapshot['context'],string>={
  NO_DATA:'NO DATA',OBSERVING:'НАБЛЮДЕНИЕ',BALANCE:'ЦЕНОВОЙ БАЛАНС',
  OUTSIDE_VALUE:'ЦЕНА ВНЕ VALUE AREA',
  CONTINUATION_CANDIDATE:'ВОЗМОЖНОЕ ПРОДОЛЖЕНИЕ',
  ABSORPTION_CANDIDATE:'ВОЗМОЖНОЕ ПОГЛОЩЕНИЕ',
  FALSE_BREAK_CANDIDATE:'ВОЗМОЖНЫЙ ЛОЖНЫЙ ПРОБОЙ'
};
const MetricRow=({label,metric,dp=2,suffix=''}:{
  label:string;metric:ParticipationField;dp?:number;suffix?:string
})=><div className="asc-mp-metric-row">
  <span>{label}<small>{metric.source} · {metric.quality}</small></span>
  <div><strong>{metric.status==='READY'?fmt(metric.value,dp)+suffix:'NO DATA'}</strong>
    <small>{metric.status} · {clock(metric.timestamp)} UTC</small></div>
</div>;

export default function MarketParticipationPanel({symbol,snapshot,journal,fvgs}:{
  symbol:string;snapshot:ParticipationSnapshot;journal:ParticipationJournal;fvgs:FvgRecord[];
}){
  const[expanded,setExpanded]=useState(true);
  const latest=fvgs.filter(z=>z.status!=='FILLED'&&z.status!=='INVALID').at(-1);
  const unknown= [snapshot.delta,snapshot.oi,snapshot.poc,snapshot.vwap,snapshot.bookBid]
    .filter(x=>x.status!=='READY').length;
  return <aside className="asc-mp-panel" aria-label="Market Participation">
    <header className="asc-mp-head">
      <div><strong>MARKET PARTICIPATION</strong>
        <small>ASCEND V1 · {symbol} · BYBIT</small></div>
      <button type="button" onClick={()=>setExpanded(x=>!x)}
        aria-expanded={expanded} aria-label="Свернуть или раскрыть Market Participation">
        {expanded?'−':'+'}</button>
    </header>
    {expanded&&<>
      <div className={'asc-mp-scenario '+snapshot.context.toLowerCase()}>
        <small>НАБЛЮДАЕМЫЙ КОНТЕКСТ · НЕ CORE ENTRY</small>
        <strong>{scenarioLabels[snapshot.context]}</strong>
        <p>{snapshot.explanation}</p>
        <span>{clock(snapshot.observedAt)} UTC ·
          {unknown?' '+unknown+' из 5 источников отсутствуют или устарели':' источники доступны'}</span>
      </div>
      <section className="asc-mp-section">
        <h4>Цена и баланс</h4>
        <MetricRow label="Цена" metric={snapshot.price}/>
        <MetricRow label="TPO · POC" metric={snapshot.poc}/>
        <MetricRow label="VAH" metric={snapshot.vah}/>
        <MetricRow label="VAL" metric={snapshot.val}/>
        <MetricRow label="VWAP · DAY UTC" metric={snapshot.vwap}/>
      </section>
      <section className="asc-mp-section">
        <h4>Участники рынка</h4>
        <MetricRow label="Дельта последних сделок" metric={snapshot.delta} dp={3}/>
        <div className="asc-mp-window">CVD: {snapshot.cvdWindow?
          clock(snapshot.cvdWindow.from)+'–'+clock(snapshot.cvdWindow.to)+' UTC · '+
          snapshot.cvdWindow.trades+' сделок':'NO DATA'}</div>
        <MetricRow label="Open Interest" metric={snapshot.oi}/>
        <MetricRow label="Δ OI vs предыдущий 5m" metric={snapshot.oiDelta} suffix="%"/>
      </section>
      <section className="asc-mp-section">
        <h4>Видимые лимитные заявки</h4>
        <MetricRow label="BID · крупнейший кластер USDT" metric={snapshot.bookBid}/>
        <MetricRow label="ASK · крупнейший кластер USDT" metric={snapshot.bookAsk}/>
        <p>Снимок стакана не показывает исполнение или удержание заявки. Без потока изменений нельзя подтверждать поглощение.</p>
      </section>
      <section className="asc-mp-section">
        <h4>FVG и Structure Engine</h4>
        <p>{latest?'FVG '+latest.timeframe+' · '+(latest.side==='bull'?'BULLISH':'BEARISH')+
          ' · '+latest.status+' · FILL '+latest.maxFillPct.toFixed(0)+'%':'Нет активной FVG среди загруженных таймфреймов.'}</p>
        <div className="asc-mp-core"><span>STRUCTURE ENGINE</span><strong>NOT CONNECTED</strong></div>
        <div className="asc-mp-core"><span>CORE DECISION</span><strong>NOT CONNECTED</strong></div>
        <p>Ни WATCH, ни MSS, ни ENTRY не создаются модулем на основании дельты или OI.</p>
      </section>
      <section className="asc-mp-section">
        <div className="asc-mp-journal-head">
          <h4>Последние наблюдения</h4>
          <button type="button" onClick={()=>downloadParticipationJournal(journal)}
            disabled={!journal.snapshots.length&&!journal.events.length}>
            Экспорт JSON ↓
          </button>
        </div>
        <p>{journal.events.length} событий · {journal.snapshots.length} снимков</p>
        {journal.events.slice(-9).reverse().map(e=>
          <div className="asc-mp-event" key={e.id}>
            <span>{clock(e.occurredAt)} UTC</span>
            <strong>{e.type} {e.level??''}</strong>
            <small>{e.source} · записано {clock(e.observedAt)}</small>
          </div>)}
        {!journal.events.length&&<small>Нет новых событий с момента подключения наблюдения. История до открытия браузера не выдаётся за онлайн-события.</small>}
      </section>
      <footer className="asc-mp-foot">
        Источники опрашиваются разными окнами; совпадение значений во времени не гарантирует причинную связь.
        Журнал хранится локально в этом браузере, не круглосуточно на сервере.
      </footer>
    </>}
  </aside>;
}

/** Both plots use the SAME observation timestamps on the x-axis.
 *  CVD plots are 1000-trade-window snapshots, NOT a continuous CVD.
 *  No interpolation over missing / stale data. */
function TimedLine({data,color,selected,onSelect}:{
  data:(number|null)[];color:string;selected:number;onSelect:(n:number)=>void;
}){
  const n=data.length,ys=data.filter((v):v is number=>v!==null);
  if(n<2||ys.length<2)return <div className="asc-mp-plot-empty">NO DATA · недостаточно наблюдений</div>;
  const min=Math.min(...ys),max=Math.max(...ys),range=Math.max(max-min,Math.abs(max)*.00001,1e-9);
  const lo=min-range*.15,hi=max+range*.15;
  const segments:string[]=[];
  let path='';
  for(let i=0;i<n;i++){
    if(data[i]===null){if(path)segments.push(path);path='';continue}
    const x=8+i/(n-1)*304,y=84-((data[i]!-lo)/(hi-lo))*72;
    path+=(path?' ':'')+x.toFixed(1)+','+y.toFixed(1);
  }
  if(path)segments.push(path);
  return <svg viewBox="0 0 320 100" preserveAspectRatio="none"
    className="asc-mp-observation-plot" role="img" aria-label="Временной ряд наблюдений"
    onMouseMove={event=>{
      const bounds=event.currentTarget.getBoundingClientRect();
      const fraction=(event.clientX-bounds.left)/Math.max(1,bounds.width);
      onSelect(Math.max(0,Math.min(n-1,Math.round(fraction*(n-1)))));
    }}>
    <line x1="8" y1="85" x2="312" y2="85" stroke="#456171" strokeWidth="1"/>
    {segments.map((p,i)=><polyline key={i} points={p} fill="none"
      stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"/>)}
    <line x1={8+selected/Math.max(n-1,1)*304} y1="6"
      x2={8+selected/Math.max(n-1,1)*304} y2="88"
      stroke="#bdc8d2" strokeDasharray="3 4" strokeWidth="1"/>
  </svg>;
}
export function ParticipationMicroCharts({journal}:{journal:ParticipationJournal}){
  const items=useMemo(()=>journal.snapshots.slice(-70),[journal.snapshots]);
  const [hover,setHover]=useState(-1);
  const selected=hover>=0&&hover<items.length?hover:Math.max(0,items.length-1);
  const usable=items.filter(x=>x.oi.status==='READY'||x.delta.status==='READY').length;
  if(usable<2)return <div className="asc-mp-mini-start">
    OI / дельта · ожидаем накопления онлайн-снимков. Нельзя восстановить отсутствующий CVD.
  </div>;
  const oi=items.map(x=>x.oi.status==='READY'?x.oi.value:null);
  const delta=items.map(x=>x.delta.status==='READY'?x.delta.value:null);
  return <section className="asc-mp-micro" aria-label="Наблюдения OI и Trade Delta">
    <header><b>УЧАСТИЕ · ВРЕМЕННЫЕ СРЕЗЫ</b>
      <small>Общая ось: время записи снимков, UTC ·
        выбран {items[selected]?clock(items[selected].observedAt):'—'}</small></header>
    <div className="asc-mp-mini-grid">
      <div><strong>OI · 5m значения</strong>
        <TimedLine data={oi} color="#55bfdc" selected={selected} onSelect={setHover}/>
        <small>{items[selected]?.oi.status==='READY'?fmt(items[selected]?.oi.value):'NO DATA'} ·
          источник {clock(items[selected]?.oi.timestamp)} UTC</small></div>
      <div><strong>Trade Delta · последние ≤1000 сделок</strong>
        <TimedLine data={delta} color="#e8b76e" selected={selected} onSelect={setHover}/>
        <small>{items[selected]?.delta.status==='READY'?fmt(items[selected]?.delta.value,3):'NO DATA'} ·
          {items[selected]?.cvdWindow?' выборка '+clock(items[selected].cvdWindow!.from)+'–'+clock(items[selected].cvdWindow!.to):' нет выборки'}</small></div>
    </div>
    <p>Линии имеют общую шкалу времени наблюдения; сами интервалы источников различаются.
      Здесь нет истинного непрерывного CVD и нет оценки доходности сделок.</p>
  </section>;
}
