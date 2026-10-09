import {useEffect,useMemo,useState} from 'react';
import {useRadarScanner} from '../market/useRadarScanner';
import {type RadarGroup,type RadarStage} from '../market/radarEngine';

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
  const[limit,setLimit]=useState(20);
  const[revision,setRevision]=useState(0);
  const[search,setSearch]=useState('');
  const[group,setGroup]=useState<RadarGroup|'ALL'>('ALL');
  const[filter,setFilter]=useState<RadarStage|'ALL'>('ALL');
  const[side,setSide]=useState<'ALL'|'LONG'|'SHORT'>('ALL');
  const[rc,setRc]=useState<'ALL'|'RC30'|'RC70'>('ALL');
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
    return true;
  }).sort((a,b)=>priority[a.stage]-priority[b.stage]||
    (a.distancePct??Infinity)-(b.distancePct??Infinity)||
    b.turnover24h-a.turnover24h),[feed.rows,search,group,filter,side,rc]);
  const verified=feed.rows.filter(r=>r.integrity==='COMPLETE');
  const active=verified.filter(r=>['WATCH','SWEEP','SHIFTING','CHECK 1M'].includes(r.stage)).length;
  const shifting=verified.filter(r=>r.stage==='SHIFTING').length;
  const check=verified.filter(r=>r.stage==='CHECK 1M').length;
  const stale=feed.updatedAt!==undefined&&now-feed.updatedAt>180000;
  return <main className="asc-radar-page">
    <header className="asc-radar-hero">
      <div><small>ASCEND · SMART RADAR V1 · RESEARCH</small>
        <h1>Радар торговых ситуаций</h1>
        <p>Подход к RC30/70 и ONH/ONL · снятие уровня · reclaim · предварительная структура.</p>
      </div><div className="asc-radar-clock"><strong>{utc(now)}</strong>
        <span>{session(now)}</span><small>BYBIT · USDT FUTURES</small></div>
    </header>
    <div className="asc-radar-summary">
      <div><small>МОНИТОРИНГ</small><b>{feed.rows.length}</b>
        <span>Проверено {feed.checked}/{feed.total}</span></div>
      <div><small>АКТИВНЫЕ ЗОНЫ</small><b>{active}</b><span>WATCH / SWEEP / SHIFT</span></div>
      <div><small>SHIFTING</small><b>{shifting}</b><span>5m reclaim / acceptance</span></div>
      <div><small>ПРОВЕРИТЬ 1M</small><b>{check}</b><span>5m pivot ≠ Entry Ready</span></div>
    </div>
    <section className="asc-radar-controls" aria-label="Фильтры радара">
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
        <label>RSI 5m<select value={rc} onChange={e=>setRc(e.target.value as typeof rc)}>
          <option value="ALL">Любой</option><option value="RC30">RC30 ≤33</option>
          <option value="RC70">RC70 ≥67</option></select></label>
        <label>Размер<select value={limit} onChange={e=>setLimit(Number(e.target.value))}>
          <option value={20}>20 монет</option><option value={40}>40 монет</option></select></label>
        <button type="button" onClick={()=>setRevision(r=>r+1)}>↻ Обновить</button>
      </div>
      <div className="asc-radar-updated" role="status">
        <span className={feed.status==='error'||stale?'error':feed.status==='ready'?'live':'loading'}>●</span>
        {feed.status==='error'?'Ошибка: '+feed.error:
          feed.status==='scanning'?'Сканируем '+feed.checked+'/'+feed.total:
          feed.status==='loading'?'Подключение к Bybit…':
          stale?'Данные устарели · обнови радар':'Полный скан '+utc(feed.updatedAt)}
        <small>Автоматическое обновление примерно раз в 2 минуты</small>
      </div>
    </section>
    <section className="asc-radar-results" aria-label="Результаты сканирования">
      <div className="asc-radar-results-header"><strong>ТОРГОВЫЕ СИТУАЦИИ</strong>
        <span>{rows.length} из {feed.rows.length} · по суточному обороту</span></div>
      <div className="asc-radar-scroll"><table>
        <thead><tr><th>Монета</th><th>Цена</th><th>24ч</th><th>RSI 5m</th>
          <th>До ONH/ONL</th><th>Vol/SMA20</th><th>Состояние</th>
          <th>Время UTC</th><th>Открыть</th></tr></thead>
        <tbody>{rows.map(row=><tr key={row.symbol}>
          <td><b>{row.symbol.replace(/USDT$/,'')}</b>
            <small>USDT · {row.group} · оборот {compact(row.turnover24h)} USDT</small></td>
          <td>{price(row.price)}</td>
          <td><b className={row.change24h>=0?'radar-long':'radar-short'}>
            {row.change24h>0?'+':''}{row.change24h.toFixed(2)}%</b></td>
          <td>{row.rsi?.toFixed(1)??'—'}<small>{row.zone==='UNAVAILABLE'?'—':row.zone}</small></td>
          <td>{row.distancePct===undefined?'—':row.distancePct.toFixed(2)+'%'}
            <small>{row.onh===undefined?'ONH/ONL LIVE':
              'H '+price(row.onh)+' · L '+price(row.onl!)}</small></td>
          <td>{row.volumeRatio===undefined?'—':row.volumeRatio.toFixed(2)+'×'}</td>
          <td><span className={'asc-radar-tag s-'+row.stage.replace(/\W/g,'-').toLowerCase()}>
            {label[row.stage]}</span>
            <small>{row.reason}</small>
            {row.direction!=='NEUTRAL'&&<small className={
              row.direction==='LONG'?'radar-long':'radar-short'}>
              {row.direction} · предварительно</small>}</td>
          <td>{utc(row.eventAt??row.observedAt)}</td>
          <td><button type="button" className="asc-radar-open"
            onClick={()=>onOpen(row.symbol)}>График ↗</button></td>
        </tr>)}</tbody>
      </table></div>
      {!rows.length&&<p className="asc-radar-empty">
        {feed.rows.length?'По этим фильтрам совпадений нет':'Ожидаем скан Bybit…'}
      </p>}
    </section>
    <footer className="asc-radar-disclaimer">
      <b>READ ONLY · НЕ СИГНАЛ ВХОДА.</b> WATCH — подход к зоне или RSI 30/70;
      SWEEP — снятие ONH/ONL; SHIFTING — 5m reclaim/acceptance;
      «Проверить 1m» — предварительный 5m pivot break. Полная цепочка
      10m CHOCH → 5m BOS → 3m FVG → 1m micro-BOS → SL/TP/R:R
      проверяется отдельно при открытии пары. Радар не выдаёт Entry Ready.
      ONH/ONL замораживаются в 06:00 UTC. Охват — только 20/40 выбранных пар.
    </footer>
  </main>;
}
