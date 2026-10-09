import type {StructureReport,StructureStep} from '../market/ascendStructureResearch';
type View={status:'loading'|'ready'|'error';report?:StructureReport;reason?:string};
const labels=[
  ['sweep','ONH / ONL Sweep'],['resolution','Reclaim / Acceptance'],
  ['choch','10m MSS / CHOCH'],['bos','5m BOS'],
  ['retest','3m FVG Retest'],['micro','1m Confirmation'],
  ['session','Session Window'],['entry','ASCEND Entry Ready']
] as const;
const states:Record<StructureStep['status'],string>={
  WAIT:'ОЖИДАНИЕ',OK:'ПОДТВЕРЖДЕНО',BLOCKED:'ЗАПРЕЩЕНО',NODATA:'НЕТ ДАННЫХ'
};
function time(at?:number){
  return at?new Date(at).toLocaleTimeString('ru-RU',{
    timeZone:'UTC',hour:'2-digit',minute:'2-digit',second:'2-digit'
  })+' UTC':'—';
}
const price=(v?:number)=>v===undefined?'—':
  v.toLocaleString('en-US',{maximumFractionDigits:v>=1000?2:6});

export default function AscendStructurePanel({feed,symbol}:{
  feed:View;symbol:string
}){
  const r=feed.report;
  return <section className="asc-structure-research" aria-label="Исследовательская цепочка ASCEND Structure Engine">
    <header>
      <div><strong>ASCEND · STRUCTURE RESEARCH</strong>
        <small>{symbol} · Bybit · только полные закрытые 1m свечи · 00:00–06:00 UTC ONH/ONL</small>
      </div>
      <b className={'asc-structure-phase '+(r?.phase==='ENTRY READY'?'ready':'')}>
        {feed.status==='ready'&&r?r.phase:'ДАННЫЕ'}
      </b>
    </header>
    {feed.status!=='ready'||!r?<p role="status" className="asc-structure-missing">
      {feed.status==='loading'?'Загрузка полного дневного потока закрытых 1m свечей…':
        'Расчёт остановлен: '+(feed.reason??'история Bybit недоступна')}
    </p>:<>
      <div className="asc-structure-summary">
        <span>ONH <b>{price(r.onh)}</b></span>
        <span>ONL <b>{price(r.onl)}</b></span>
        <span>Сторона <b>{r.direction??'—'}</b></span>
        <span>Последняя 1m <b>{time(r.asOf)}</b></span>
      </div>
      <div className="asc-structure-steps">
        {labels.map(([key,label])=>{
          const s=r.steps[key];
          return <div key={key} className={'asc-structure-step '+s.status}>
            <span>{label}</span>
            <b>{states[s.status]}</b>
            <time>{time(s.at)}</time>
            <small>{s.detail}</small>
          </div>;
        })}
      </div>
      {r.rr!==undefined&&<p className="asc-structure-risk">
        Расчёт уровней, не ордер: Entry {price(r.entry)} · SL {price(r.sl)} ·
        TP {price(r.tp)} · R:R {r.rr.toFixed(2)}
      </p>}
    </>}
    <footer>Статусы — исследовательская проверка закрытых свечей, не исполняемые сигналы.
      CHOCH, BOS и 1m подтверждаются только после формирования pivot; для FVG нужен
      последующий ретест. Неподтверждённое или устаревшее событие не допускает вход.</footer>
  </section>;
}
