import type {TrendStructureSnapshot} from '../market/trendStructureResearch';
import type {ExpandedTrendSnapshot} from '../market/useExpandedTrendResearch';
import type {ResearchDecision,MarketLiquidity} from '../market/liquidityDecisionResearch';
import type {ChartNarrative} from '../market/chartNarrativeResearch';
import type {EarlyOnResearch} from '../market/earlyOnResearch';
import type {PlannedVenue} from '../market/crossExchangeSpread';
const fmt=(n?:number)=>n===undefined||!Number.isFinite(n)?'—':
  n.toLocaleString('en-US',{maximumFractionDigits:n>=1000?2:n>=1?4:7});
const clock=(at?:number)=>at?new Date(at).toLocaleTimeString('ru-RU',{
  timeZone:'UTC',hour:'2-digit',minute:'2-digit'}):'—';
export default function FocusDecisionPanel({trend,extended,decision,liquidity,narrative,early,plannedVenue}:{
  trend:TrendStructureSnapshot;extended:ExpandedTrendSnapshot;decision:ResearchDecision;
  liquidity:MarketLiquidity;narrative:ChartNarrative;early:EarlyOnResearch;
  plannedVenue:PlannedVenue;
}){
  const reason=narrative.valid?narrative.warning:
    decision.reasons[0]??'Ожидаем свежие подтверждения по закрытым 1m свечам';
  const ready=decision.status==='ENTRY READY'&&narrative.ready;
  const direction=decision.direction??trend.setupDirection;
  const onh=liquidity.levels.find(x=>x.id==='ONH'&&x.state==='FROZEN');
  const onl=liquidity.levels.find(x=>x.id==='ONL'&&x.state==='FROZEN');
  return <aside className="asc-focus-decision" aria-label="ASCEND Focus — решение по сделке">
    <header className="asc-focus-decision-head">
      <strong>ASCEND · DECISION</strong>
      <span className={ready?'ready':decision.status==='SKIP'?'skip':'wait'}>
        {ready?'ENTRY READY':decision.status}</span>
    </header>
    <div className="asc-focus-trend-summary">
      <small>СТРУКТУРА / ТРЕНД / НАПРАВЛЕНИЕ</small>
      <strong className={trend.alignment.toLowerCase()}>
        {trend.alignment==='LONG'?'ТРЕНД ВВЕРХ':
          trend.alignment==='SHORT'?'ТРЕНД ВНИЗ':
          trend.alignment==='CONFLICT'?'КОНФЛИКТ 30m / 15m':'НЕ ПОДТВЕРЖДЁН'}</strong>
      <span>Сетап: <b>{direction??'—'}</b>
        {' · '}5m импульс: <b>{narrative.impulseDirection??'—'}</b></span>
    </div>
    <div className="asc-focus-timeframe-ladder asc-confirmation-13" aria-label="Единая панель структуры и подтверждения по 13 таймфреймам">
      <header>
        <b>ПОДТВЕРЖДЕНИЕ · 13 TF</b>
        <span className="asc-confirmation-progress">
          CORE {decision.checks.filter(c=>c.state==='OK').length}/6
        </span>
      </header>
      <div className="asc-confirmation-legend">
        <small>◆ 6 проверок входа</small><small>○ 7 таймфреймов контекста</small>
      </div>
      <div className="asc-focus-timeframe-chips">
        {extended.rows.map(row=>{
          const check=decision.checks.find(c=>c.tf===row.tf);
          const core=Boolean(check);
          return <div key={row.tf}
            className={'asc-focus-tf-chip asc-confirmation-cell'+(core?' is-core':' is-context')+
              ' trend-'+row.trend.toLowerCase().replace(' ','-')+
              (check?' check-'+check.state.toLowerCase():'')}
            title={(core?'ОБЯЗАТЕЛЬНАЯ ПРОВЕРКА: '+check!.why:
              'КОНТЕКСТ: не блокирует вход · '+row.reason)+
              ' · '+(row.at?new Date(row.at).toISOString():'нет времени подтверждения')}>
            <div className="asc-confirmation-cell-head">
              <b>{row.tf}</b><span aria-label={core?'Входит в торговое ядро':'Контекст'}>{core?'◆':'○'}</span>
            </div>
            <small>{row.high}/{row.low}</small>
            <strong className="asc-confirmation-status">
              {check?check.state==='OK'?'✓ ГОТОВ':check.state==='NODATA'?'НЕТ ДАННЫХ':
                check.state==='BLOCKED'?'БЛОК':'ЖДЁМ':
                row.trend==='NO DATA'?'НЕТ ДАННЫХ':row.trend==='LONG'?'↑ ВВЕРХ':
                row.trend==='SHORT'?'↓ ВНИЗ':row.trend==='TRANSITION'?'ПЕРЕХОД':'БАЛАНС'}
            </strong>
          </div>;
        })}
      </div>
      <small className="asc-confirmation-note">
        30m → 15m → 10m → 5m → 3m → 1m — обязательные проверки CORE.
        Остальные 7 TF показывают рыночную структуру и не отменяют корректный вход.
      </small>
      <small>{extended.status==='error'?'Нет истории Bybit: '+(extended.reason??'ошибка'):
        extended.fresh?'Контекст 30m/15m: '+extended.observed30m15m:
          'Ожидаем историю · отсутствие данных не означает подтверждение'}</small>
    </div>
    <div className="asc-focus-on-levels">
      <span>ONH <b>{fmt(onh?.price)}</b></span>
      <span>ONL <b>{fmt(onl?.price)}</b></span>
      <small>Только FROZEN</small>
    </div>
    <div className="asc-focus-early">
      <small>EARLY ONH/ONL · ИССЛЕДОВАНИЕ</small>
      <strong className={early.status==='EARLY CANDIDATE'?'candidate':''}>
        {early.status==='NONE'?'НЕТ РАННЕГО СЕТАПА':early.status}</strong>
      <span>{early.direction!=='NEUTRAL'?early.direction+' · ':''}{early.reason}</span>
    </div>
    <div className="asc-planned-decision-venue">
      <span>БИРЖА ПЛАНА: <strong>{plannedVenue}</strong></span>
      <small>{plannedVenue==='BYBIT'
        ?'Уровни исследовательского плана рассчитываются по Bybit.'
        :'График и уровни пока Bybit. Перед сделкой на '+plannedVenue+
        ' нужны её собственные котировки и пересчёт Entry / SL / TP.'}</small>
    </div>
    <div className="asc-focus-risk" aria-label="Параметры исследовательского торгового плана">
      <div><small>ENTRY</small><b>{fmt(ready?decision.entry:
        early.status==='EARLY CANDIDATE'?early.indicativeEntry:undefined)}</b></div>
      <div><small>SL</small><b>{fmt(ready?decision.sl:
        early.status==='EARLY CANDIDATE'?early.structuralSl:undefined)}</b></div>
      <div><small>TP</small><b>{fmt(ready?decision.tp:
        early.status==='EARLY CANDIDATE'?early.target:undefined)}</b></div>
      <div><small>R:R</small><b>{ready?decision.rr?.toFixed(2):
        early.status==='EARLY CANDIDATE'?early.rr?.toFixed(2):'—'}</b></div>
    </div>
    <div className="asc-focus-blocker" role="status">
      <strong>{ready?'ПОДТВЕРЖДЕНО · RESEARCH':
        decision.status==='SKIP'?'ПОЧЕМУ SKIP?':'ПОЧЕМУ WAIT?'}</strong>
      <p>{ready?'Все обязательные проверки ядра выполнены. Автоматический ордер отключён.':
        reason}</p>
      {early.status==='EARLY CANDIDATE'&&<small>
        EARLY CANDIDATE ≠ ENTRY READY · проверить 1m micro-BOS</small>}
    </div>
    <footer>Закрытые свечи · {clock(decision.asOf)} UTC · без автоордеров.
      Нажми DETAIL для журнала, FVG/TPO и подробной истории.</footer>
  </aside>;
}
