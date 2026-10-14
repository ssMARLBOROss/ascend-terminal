import {useEffect,useState} from 'react';
import type {MarketLiquidity,ResearchDecision,DecisionRecord,LiquidityLevel} from '../market/liquidityDecisionResearch';
import {appendDecisionRecord} from '../market/liquidityDecisionResearch';

const clock=(at?:number)=>at?new Date(at).toLocaleTimeString('ru-RU',{
  timeZone:'UTC',hour:'2-digit',minute:'2-digit',second:'2-digit'}):'—';
const fmt=(v?:number)=>v===undefined?'—':v.toLocaleString('en-US',{
  maximumFractionDigits:v>=1000?2:v>=1?4:7});
function LevelTile({level,price}:{level:LiquidityLevel;price?:number}){
  return <div className={'asc-liq-level '+level.side.toLowerCase()}>
    <div><strong>{level.id}</strong>
      <small>{level.state} · {level.description}</small></div>
    <div><b>{fmt(level.price)}</b>
      <small>{price&&price>0?((level.price/price-1)*100).toFixed(2)+'% от цены':'—'}</small>
    </div>
  </div>;
}
/** Market walls are derived ONLY from genuine FROZEN levels and a complete ATR5m.
 * LIVE RTH/IB labels are observations and never become TP targets.
 */
export function LiquidityMapPanel({data,price}:{data:MarketLiquidity;price?:number}){
  const walls=[data.bsl,data.ssl].filter((x):x is NonNullable<typeof x>=>!!x);
  return <section className="asc-research-section" aria-label="BSL SSL и карта ликвидности">
    <header><div><strong>LIQUIDITY MAP · BSL / SSL</strong>
      <small>YH/YL · ONH/ONL · RTH H/L · IBH/IBL · выбранная биржа Bybit</small></div>
      <span>ATR5m × 0.30 · {data.atr5m?fmt(data.atr5m):'NO ATR'}</span>
    </header>
    <div className="asc-liq-walls">
      {walls.map(w=><div className={'asc-liq-wall '+w.id.toLowerCase()} key={w.id}>
        <strong>{w.id} · {w.anchor.id}</strong>
        <b>{fmt(w.low)} – {fmt(w.high)}</b>
        <small>До уровня {w.distancePct.toFixed(2)}% · {w.anchor.state}</small>
      </div>)}
      {!walls.length&&<p>Нет ближайших FROZEN зон над и под текущей ценой</p>}
    </div>
    <div className="asc-liq-level-grid">
      {data.levels.map(l=><LevelTile key={l.id} level={l} price={price}/>)}
    </div>
    <footer>RTH и IB — ориентиры американской фондовой сессии 09:30–16:00 по Нью-Йорку,
      не закрытие криптобиржи. Пока диапазон формируется, он LIVE и не может стать целью TP.
      BSL/SSL — рассчитанные области, а не реальные заявки из стакана.</footer>
  </section>;
}
const KEY='ascend.research.decision-journal.v1.';
function read(symbol:string):DecisionRecord[]{
  try{
    const raw=window.localStorage.getItem(KEY+symbol);
    if(!raw)return [];
    const parsed=JSON.parse(raw) as DecisionRecord[];
    return Array.isArray(parsed)?parsed.filter(x=>x.symbol===symbol).slice(-100):[];
  }catch{return []}
}
export function DecisionResearchPanel({decision,asOf}:{decision:ResearchDecision;asOf:number}){
  const [records,setRecords]=useState<DecisionRecord[]>(()=>read(decision.symbol));
  useEffect(()=>{
    if(!decision.asOf||!asOf)return;
    setRecords(previous=>{
      const next=appendDecisionRecord(previous,decision);
      if(next!==previous){
        try{window.localStorage.setItem(KEY+decision.symbol,JSON.stringify(next))}catch{}
      }
      return next;
    });
  },[decision.symbol,decision.status,decision.phase,decision.direction,
    decision.asOf,decision.reasons.join('|')]);
  const recent=[...records].reverse().slice(0,5);
  return <section className="asc-research-section asc-decision-research"
    aria-label="ASCEND Decision Engine и журнал кандидатов">
    <header>
      <div><strong>ASCEND DECISION ENGINE · RESEARCH</strong>
        <small>30m → 15m → 10m → 5m → 3m → 1m · только закрытые свечи</small></div>
      <span className={'asc-decision-state '+decision.status.toLowerCase().replace(' ','-')}>
        {decision.status}</span>
    </header>
    <div className="asc-decision-checks">
      {decision.checks.map(check=><div key={check.tf} className={'asc-decision-check '+check.state.toLowerCase()}>
        <b>{check.tf}</b><span>{check.label}</span>
        <strong>{check.state}</strong>
        <small>{check.direction??check.why}</small>
        <time>{clock(check.at)}</time>
      </div>)}
    </div>
    <div className="asc-decision-plan">
      <div><small>НАПРАВЛЕНИЕ</small><strong>{decision.direction??'—'}</strong></div>
      <div><small>ENTRY</small><strong>{fmt(decision.entry)}</strong></div>
      <div><small>STRUCTURAL SL</small><strong>{fmt(decision.sl)}</strong>
        <em>{decision.stopDistancePct?.toFixed(2)??'—'}%</em></div>
      <div><small>TP · FROZEN</small><strong>{fmt(decision.tp)}</strong>
        <em>{decision.targetLevel??'—'} · {decision.targetDistancePct?.toFixed(2)??'—'}%</em></div>
      <div><small>R:R</small><strong>{decision.rr?.toFixed(2)??'—'}</strong></div>
    </div>
    <div className="asc-decision-reasons">
      <b>{decision.reasons.length?'ПОЧЕМУ НЕЛЬЗЯ ВОЙТИ':'ПОДТВЕРЖДЕНО ТОЛЬКО ДЛЯ ИССЛЕДОВАНИЯ'}</b>
      {decision.reasons.length?<ul>{decision.reasons.slice(0,7).map((x,i)=><li key={i}>{x}</li>)}</ul>:
        <p>Все проверенные условия согласованы; ордер не открывается автоматически.</p>}
    </div>
    <details className="asc-decision-history">
      <summary>ЖУРНАЛ КАНДИДАТОВ · {records.length} записей</summary>
      {recent.length?<div>{recent.map(r=><div key={r.id} className="asc-decision-history-line">
        <span>{clock(r.at)}</span><b>{r.phase} / {r.status}</b>
        <small>{r.direction??'—'} · {fmt(r.entry)} · {r.reason.split('|').at(-1)}</small>
      </div>)}</div>:<p>Пока нет переходов состояний для этой монеты.</p>}
      <small>Исследовательские состояния сохраняются локально в этом браузере;
        это не журнал реальных ордеров и не результаты P&L.</small>
    </details>
    <footer>Fail closed: при неполных данных, конфликте 30m/15m, устаревшем 1m или
      R:R ниже 1:2 итоговый ENTRY READY не предоставляется.
      FVG-ретест пока остаётся обязательным в существующем CORE Research — это отдельная
      проверяемая гипотеза, не доказанное преимущество.</footer>
  </section>;
}
