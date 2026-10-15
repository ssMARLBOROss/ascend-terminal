import {useEffect,useMemo,useState} from 'react';
import {useRadarScanner} from '../market/useRadarScanner';
import {type RadarGroup,type RadarStage,type RadarOnSide,
  ON_HOT_DISTANCE_PCT} from '../market/radarEngine';

const priority:Record<RadarStage,number>={
  'CHECK 1M':0,SHIFTING:1,SWEEP:2,WATCH:3,BUILDING:4,SCANNING:5,'NO DATA':6
};
const label:Record<RadarStage,string>={
  'CHECK 1M':'ПРОВЕРИТЬ 1M',SHIFTING:'SHIFTING',SWEEP:'SWEEP',
  WATCH:'WATCH',BUILDING:'ONH/ONL LIVE',SCANNING:'SCANNING','NO DATA':'НЕТ ДАННЫХ'
};
const price=(n:number)=>n.toLocaleString('en-US',{maximumFractionDigits:n>=1000?2:n>=1?4:9});
const compact=(n:number)=>new Intl.NumberFormat('en-US',{
  notation:'compact',maximumFractionDigits:1}).format(n);
const utc=(at?:number)=>at?new Date(at).toLocaleTimeString('ru-RU',{
  timeZone:'UTC',hour:'2-digit',minute:'2-digit'})+' UTC':'—';
function session(now:number){
  const h=(now%86400000)/3600000;
  return [h<8?'ASIA':'',h>=7&&h<16?'LONDON':'',
    h>=13&&h<22?'NEW YORK':''].filter(Boolean).join(' + ')||'ВНЕ ОКНА ASCEND';
}
export default function RadarView({onOpen}:{onOpen:(symbol:string)=>void}){
  const[limit,setLimit]=useState(40);
  const[revision,setRevision]=useState(0);
  const[search,setSearch]=useState('');
  const[group,setGroup]=useState<RadarGroup|'ALL'>('ALL');
  const[filter,setFilter]=useState<RadarStage|'ALL'>('ALL');
  const[side,setSide]=useState<'ALL'|'LONG'|'SHORT'>('ALL');
  const[rc,setRc]=useState<'ALL'|'RC30'|'RC70'>('ALL');
  const[onFocus,setOnFocus]=useState<RadarOnSide|'ALL'>('ALL');
  const[onlyOn,setOnlyOn]=useState(true);
  const[now,setNow]=useState(()=>Date.now());
  useEffect(()=>{const id=window.setInterval(()=>setNow(Date.now()),15000);
    return()=>window.clearInterval(id)},[]);
  const feed=useRadarScanner(limit,revision);
  const rows=useMemo(()=>feed.rows.filter(r=>{
    if(search&&!r.symbol.includes(search.trim().toUpperCase()))return false;
    if(group!=='ALL'&&r.group!==group)return false;
    if(filter!=='ALL'&&r.stage!==filter)return false;
    if(side!=='ALL'&&r.direction!==side)return false;
    if(rc==='RC30'&&(r.rsi===undefined||r.rsi>33))return false;
    if(rc==='RC70'&&(r.rsi===undefined||r.rsi<67))return false;
    if(onFocus!=='ALL'&&r.onSide!==onFocus)return false;
    if(onlyOn&&!['WATCH','SWEEP','SHIFTING','CHECK 1M'].includes(r.stage))return false;
    if(onlyOn&&r.onState!=='FROZEN')return false;
    return true;
  }).sort((a,b)=>priority[a.stage]-priority[b.stage]||
    (a.distancePct??Infinity)-(b.distancePct??Infinity)||
    b.turnover24h-a.turnover24h),[feed.rows,search,group,filter,side,rc,onFocus,onlyOn]);
  const verified=feed.rows.filter(r=>r.integrity==='COMPLETE');
  const shifting=verified.filter(r=>r.stage==='SHIFTING').length;
  const check=verified.filter(r=>r.stage==='CHECK 1M').length;
  const nearOnl=verified.filter(r=>r.onSide==='ONL'&&
    ['WATCH','SWEEP','SHIFTING','CHECK 1M'].includes(r.stage)).length;
  const nearOnh=verified.filter(r=>r.onSide==='ONH'&&
    ['WATCH','SWEEP','SHIFTING','CHECK 1M'].includes(r.stage)).length;
  const stale=feed.updatedAt!==undefined&&now-feed.updatedAt>180000;
  return <main className="asc-radar-page">
    <header className="asc-radar-hero">
      <div><small>ASCEND · SMART RADAR V1 · RESEARCH</small>
        <h1>Радар зон ONH / ONL</h1>
        <p>Ищем подход к ночной ликвидности, касание, sweep,
          reclaim или acceptance. RSI — только дополнительный контекст.</p>
      </div><div className="asc-radar-clock"><strong>{utc(now)}</strong>
        <span>{session(now)}</span><small>BYBIT · USDT FUTURES</small></div>
    </header>
    <div className="asc-radar-summary">
      <div><small>МОНИТОРИНГ</small><b>{feed.rows.length}</b>
        <span>Проверено {feed.checked}/{feed.total}</span></div>
      <div><small>НИЖНЯЯ ONL</small><b>{nearOnl}</b><span>Кандидаты возле ONL</span></div>
      <div><small>ВЕРХНЯЯ ONH</small><b>{nearOnh}</b><span>Кандидаты возле ONH</span></div>
      <div><small>SHIFTING / 1M</small><b>{shifting} / {check}</b>
        <span>Структура ещё требует Core</span></div>
    </div>
    <section className="asc-radar-controls" aria-label="Фильтры радара">
      <div className="asc-radar-on-tabs" role="group" aria-label="Выбор ночного уровня">
        <button type="button" className={onFocus==='ALL'?'active':''}
          aria-pressed={onFocus==='ALL'} onClick={()=>setOnFocus('ALL')}>
          ◉ ОБЕ ON ЗОНЫ <small>ONH + ONL</small></button>
        <button type="button" className={onFocus==='ONL'?'active':''}
          aria-pressed={onFocus==='ONL'} onClick={()=>setOnFocus('ONL')}>
          ↟ НИЖНЯЯ ONL <small>Sweep → LONG при reclaim / SHORT при acceptance</small></button>
        <button type="button" className={onFocus==='ONH'?'active':''}
          aria-pressed={onFocus==='ONH'} onClick={()=>setOnFocus('ONH')}>
          ↡ ВЕРХНЯЯ ONH <small>Sweep → SHORT при reclaim / LONG при acceptance</small></button>
        <label className="asc-radar-only-on">
          <input type="checkbox" checked={onlyOn}
            onChange={e=>setOnlyOn(e.target.checked)}/> Только активные ON зоны
        </label>
      </div>
      <div className="asc-radar-filter-grid">
        <label>Монета<input type="search" value={search}
          onChange={e=>setSearch(e.target.value)} placeholder="BTC, SOL…"/></label>
        <label>Ход 24ч<select value={group} onChange={e=>setGroup(e.target.value as typeof group)}>
          <option value="ALL">Все группы</option><option value="0.5–3%">0,5–3%</option>
          <option value="3–12%">3–12%</option><option value="12%+">12%+</option></select></label>
        <label>Статус<select value={filter} onChange={e=>setFilter(e.target.value as typeof filter)}>
          <option value="ALL">Все статусы</option><option value="WATCH">WATCH</option>
          <option value="SWEEP">SWEEP</option><option value="SHIFTING">SHIFTING</option>
          <option value="CHECK 1M">Проверить 1m</option></select></label>
        <label>Сторона<select value={side} onChange={e=>setSide(e.target.value as typeof side)}>
          <option value="ALL">LONG + SHORT</option><option value="LONG">LONG</option>
          <option value="SHORT">SHORT</option></select></label>
        <label>RSI 5m · доп. фильтр<select value={rc} onChange={e=>setRc(e.target.value as typeof rc)}>
          <option value="ALL">Любой</option><option value="RC30">RC30 ≤33</option>
          <option value="RC70">RC70 ≥67</option></select></label>
        <label>Размер<select value={limit} onChange={e=>setLimit(Number(e.target.value))}>
          <option value={20}>20 монет</option><option value={40}>40 монет</option>
          <option value={80}>80 монет</option><option value={120}>120 монет</option></select></label>
        <button type="button" onClick={()=>setRevision(r=>r+1)}>↻ Обновить</button>
      </div>
      <div className="asc-radar-updated" role="status">
        <span className={feed.status==='error'||stale?'error':feed.status==='ready'?'live':'loading'}>●</span>
        {feed.status==='error'?'Ошибка: '+feed.error:
          feed.status==='scanning'?'Сканируем '+feed.checked+'/'+feed.total:
          feed.status==='loading'?'Подключение к Bybit…':
          stale?'Данные устарели · обнови радар':'Полный скан '+utc(feed.updatedAt)}
        <small>Примерно раз в 2 минуты · 5m свечи · выбранная выборка,
          не весь фьючерсный рынок</small>
      </div>
    </section>
    <section className="asc-radar-results" aria-label="Результаты сканирования">
      <div className="asc-radar-results-header"><strong>ONH / ONL · КАНДИДАТЫ</strong>
        <span>{rows.length} активных из {feed.rows.length} выбранных · расстояние от
          последней закрытой 5m свечи · HOT ≤{ON_HOT_DISTANCE_PCT.toFixed(2)}%</span></div>
      <div className="asc-radar-scroll"><table>
        <thead><tr><th>Монета</th><th>Цена</th><th>24ч</th><th>RSI 5m</th>
          <th>ON зона · расстояние</th><th>Vol/SMA20</th><th>Событие / Состояние</th>
          <th>Время UTC</th><th>Открыть</th></tr></thead>
        <tbody>{rows.map(row=><tr key={row.symbol}>
          <td><b>{row.symbol.replace(/USDT$/,'')}</b>
            <small>USDT · {row.group} · оборот {compact(row.turnover24h)} USDT</small></td>
          <td>{price(row.price)}</td>
          <td><b className={row.change24h>=0?'radar-long':'radar-short'}>
            {row.change24h>0?'+':''}{row.change24h.toFixed(2)}%</b></td>
          <td>{row.rsi?.toFixed(1)??'—'}<small>{row.zone==='UNAVAILABLE'?'—':row.zone}</small></td>
          <td><b className={'asc-radar-on-side '+row.onSide.toLowerCase()}>
            {row.onSide==='NONE'?'—':row.onSide}</b>
            {' · '}
            <strong className={row.distancePct!==undefined&&
              row.distancePct<=ON_HOT_DISTANCE_PCT?'radar-hot':''}>
              {row.distancePct===undefined?'—':row.distancePct.toFixed(2)+'%'}
            </strong>
            <small>{row.onState} · уровень {row.levelPrice===undefined?'—':price(row.levelPrice)}</small>
            <small>{row.onh===undefined?'ONH/ONL недоступны':
              'H '+price(row.onh)+' · L '+price(row.onl!)}</small></td>
          <td>{row.volumeRatio===undefined?'—':row.volumeRatio.toFixed(2)+'×'}</td>
          <td><span className={'asc-radar-on-event e-'+row.onEvent.toLowerCase()}>
            {row.onEvent}</span>{' '}
            <span className={'asc-radar-tag s-'+row.stage.replace(/\W/g,'-').toLowerCase()}>
            {label[row.stage]}</span>
            <small>{row.reason}</small>
            {row.touchAt&&<small>Касание: {utc(row.touchAt)}</small>}
            {row.sweepAt&&<small>Снятие: {utc(row.sweepAt)}</small>}
            {row.resolutionAt&&<small>Возврат / принятие: {utc(row.resolutionAt)}</small>}
            {row.direction!=='NEUTRAL'&&<small className={
              row.direction==='LONG'?'radar-long':'radar-short'}>
              {row.direction} · предварительно</small>}</td>
          <td>{utc(row.eventAt??row.observedAt)}</td>
          <td><button type="button" className="asc-radar-open"
            onClick={()=>onOpen(row.symbol)}>График ↗</button></td>
        </tr>)}</tbody>
      </table></div>
      {!rows.length&&<p className="asc-radar-empty">
        {feed.rows.length?'Активных ON-сетапов сейчас не найдено в этой выборке. Убери флажок «Только активные ON зоны», чтобы увидеть все проверенные пары.':'Ожидаем скан Bybit…'}
      </p>}
    </section>
    <footer className="asc-radar-disclaimer">
      <b>READ ONLY · НЕ СИГНАЛ ВХОДА.</b> ONH/ONL — диапазон
      00:00–06:00 UTC. До 06:00 уровни LIVE, после закрытия интервала FROZEN.
      WATCH — подход не дальше 0,50% либо недавнее касание; SWEEP —
      прокол уровня; RECLAIM — закрытие обратно; ACCEPTANCE — два 5m
      закрытия за уровнем. SHIFTING и «Проверить 1m» — ещё НЕ ENTRY READY.
      Обязательная цепочка 30m → 15m → 10m → 5m → 3m → 1m,
      структурный SL, ближайшая ликвидность TP и R:R ≥ 1:2 проверяются
      отдельно при открытии монеты. Время событий — закрытие 5m, не точный тик.
      RSI 30/70 не является причиной WATCH. Охват — только выбранные
      20/40/80/120 ликвидных Bybit USDT-фьючерсов; BingX Spot здесь не сканируется.
    </footer>
  </main>;
}
