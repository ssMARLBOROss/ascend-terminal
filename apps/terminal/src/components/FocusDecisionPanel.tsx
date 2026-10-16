import type {TrendStructureSnapshot} from '../market/trendStructureResearch';
import type {ResearchDecision,MarketLiquidity} from '../market/liquidityDecisionResearch';
import type {ChartNarrative} from '../market/chartNarrativeResearch';
import type {EarlyOnResearch} from '../market/earlyOnResearch';
const fmt=(n?:number)=>n===undefined||!Number.isFinite(n)?'—':
  n.toLocaleString('en-US',{maximumFractionDigits:n>=1000?2:n>=1?4:7});
const clock=(at?:number)=>at?new Date(at).toLocaleTimeString('ru-RU',{
  timeZone:'UTC',hour:'2-digit',minute:'2-digit'}):'—';
export default function FocusDecisionPanel({trend,decision,liquidity,narrative,early}:{
  trend:TrendStructureSnapshot;decision:ResearchDecision;
  liquidity:MarketLiquidity;narrative:ChartNarrative;early:EarlyOnResearch;
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
    <div className="asc-focus-mtf" aria-label="Шесть проверок таймфреймов">
      {decision.checks.map(c=>{
        const row=trend.rows.find(r=>r.tf===c.tf);
        return <div key={c.tf} className={'asc-focus-mtf-cell '+c.state.toLowerCase()}
          title={c.why+' · '+(row?.reason??'Нет структурного контекста')}>
          <b>{c.tf}</b>
          <strong>{c.state}</strong>
          <small>{row?.high??'—'} / {row?.low??'—'}</small>
        </div>;
      })}
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
