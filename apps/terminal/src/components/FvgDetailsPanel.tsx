import {useMemo} from 'react';
import {distanceToFvg,summariseFvg,type FvgRecord,type FvgEvent} from '../market/fvgContextEngine';
import {exportFvgJournal} from '../market/useFvgResearch';
import type {StructureReport,StructureStep} from '../market/ascendStructureResearch';

const pct=(n:number)=>n.toFixed(2)+'%';
const money=(n:number)=>n.toLocaleString('en-US',{maximumFractionDigits:n>=100?2:6});
const date=(n:number,tz:string)=>{
  try{return new Intl.DateTimeFormat('ru-RU',{timeZone:tz,
    month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',
    hourCycle:'h23'}).format(n)}
  catch{return new Date(n).toISOString()}
};
const classes:Record<FvgRecord['sizeClass'],string>={
  SMALL:'< 0,25 ATR',MEDIUM:'0,25–0,50 ATR',LARGE:'0,50–1,00 ATR',
  VERY_LARGE:'> 1 ATR',ATR_UNAVAILABLE:'ATR недоступен'
};
const labels:Record<string,string>={
  CREATED:'CREATED',ACTIVE:'ACTIVE',APPROACH:'APPROACH',RETEST:'RETEST',
  FILL_25:'FILL 25%',FILL_50:'FILL 50%',FILL_75:'FILL 75%',
  FILLED:'FILLED 100%',PARTIAL:'PARTIAL',EXIT:'EXIT',INVALID:'INVALID'
};
const STRUCTURE_ROWS=[
  ['sweep','ONH/ONL Sweep'],['resolution','Reclaim / Acceptance'],
  ['choch','10m MSS / CHOCH'],['bos','5m BOS'],
  ['micro','1m Confirmation'],['entry','ASCEND Entry Ready']
] as const;
const stateLabel:Record<StructureStep['status'],string>={
  WAIT:'ОЖИДАНИЕ',OK:'ПОДТВЕРЖДЕНО',BLOCKED:'ЗАПРЕЩЕНО',NODATA:'НЕТ ДАННЫХ'
};
export default function FvgDetailsPanel({symbol,records,journal,selectedId,
  onSelect,price,zoneTimeframes,errors,structure}:{
  symbol:string;records:FvgRecord[];journal:FvgRecord[];selectedId?:string;
  onSelect:(id:string)=>void;price?:number;zoneTimeframes:string[];
  errors:Record<string,string|undefined>;structure?:StructureReport;
}){
  const active=records.filter(z=>z.status!=='FILLED'&&z.status!=='INVALID');
  const selected=records.find(z=>z.id===selectedId)??active.at(-1)??records.at(-1);
  const stats=useMemo(()=>summariseFvg(journal),[journal]);
  const tz=Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';
  const events:FvgEvent[]=selected?.events??[];
  return <section className="asc-fvg-details" aria-label="FVG Context Engine V1 — исследовательская панель">
    <header className="asc-fvg-details-head">
      <div><strong>ASCEND / FVG CONTEXT ENGINE V1</strong>
        <small>Многотаймфреймные FVG · данные Bybit · без торговых решений</small></div>
      <button type="button" onClick={()=>exportFvgJournal(symbol,journal)}
        disabled={journal.length===0} title="Экспорт сохранённой в браузере истории FVG">
        ↓ ЖУРНАЛ JSON
      </button>
    </header>
    <div className="asc-fvg-details-summary">
      <span><b>{active.length}</b> активных зон</span>
      <span><b>{records.length}</b> рассчитано</span>
      <span><b>{journal.length}</b> в локальном журнале</span>
      <span>ТФ: {zoneTimeframes.length?zoneTimeframes.join(' / '):'загрузка'}</span>
    </div>
    {Object.entries(errors).some(([,err])=>err)&&
      <p className="asc-fvg-warning">Часть таймфреймов недоступна: {Object.entries(errors)
        .filter(([,err])=>err).map(([tf])=>tf).join(', ')}</p>}
    {selected?<div className="asc-fvg-details-layout">
      <div className="asc-fvg-list">
        <div className="asc-fvg-list-title">ЗОНЫ · НАЖМИ ДЛЯ ПРОСМОТРА</div>
        {[...records].sort((a,b)=>{
          const aFilled=a.status==='FILLED'?1:0,bFilled=b.status==='FILLED'?1:0;
          if(aFilled!==bFilled)return aFilled-bFilled;
          const da=distanceToFvg(a,price??NaN)??Infinity;
          const db=distanceToFvg(b,price??NaN)??Infinity;
          return da-db||b.formedAt-a.formedAt;
        }).slice(0,48).map(z=><button type="button" key={z.id}
          className={'asc-fvg-list-item '+(z.id===selected.id?'selected ':'')+z.side}
          onClick={()=>onSelect(z.id)}>
          <span><b>{z.side==='bull'?'▲ BULL':'▼ BEAR'}</b>
            <b>{z.timeframe}</b><small>{classes[z.sizeClass]}</small></span>
          <span><strong>{money(z.low)} – {money(z.high)}</strong>
            <small>{z.status} · FILL {Math.round(z.maxFillPct)}%</small></span>
        </button>)}
      </div>
      <div className="asc-fvg-detail-main">
        <div className="asc-fvg-selected">
          <div className="asc-fvg-selected-title"><strong>{selected.side==='bull'?'BULLISH FVG':'BEARISH FVG'}</strong>
            <span>{selected.timeframe} · {selected.status}</span></div>
          <div className="asc-fvg-fields">
            <div><small>ID</small><b title={selected.id}>{selected.id.slice(-33)}</b></div>
            <div><small>Время создания ({tz})</small><b>{date(selected.formedAt,tz)}</b></div>
            <div><small>Границы</small><b>{money(selected.low)} – {money(selected.high)}</b></div>
            <div><small>Середина 50%</small><b>{money(selected.midpoint)}</b></div>
            <div><small>Ширина цены</small><b>{money(selected.size)}</b></div>
            <div><small>Размер в %</small><b>{pct(selected.gapPercent)}</b></div>
            <div><small>Размер в ATR(14)</small><b>{selected.atrMultiple===null?'Н/Д':
              selected.atrMultiple.toFixed(3)+' ATR'}</b></div>
            <div><small>Расстояние до цены</small><b>{price?
              pct(distanceToFvg(selected,price)??0):'Н/Д'}</b></div>
            <div><small>Макс. заполнение</small><b>{pct(selected.maxFillPct)}</b></div>
            <div><small>Первое касание</small><b>{selected.firstTouchAt?
              date(selected.firstTouchAt,tz):'Не было'}</b></div>
            <div><small>Время до касания</small><b>{selected.firstTouchAt?
              Math.round((selected.firstTouchAt-selected.formedAt)/60000)+' мин':'—'}</b></div>
            <div><small>Повторных визитов</small><b>{selected.visits}</b></div>
            <div><small>Оценка времени внутри</small><b>{Math.round(selected.timeInsideMs/60000)} мин</b></div>
            <div><small>Связанные уровни</small><b>{selected.context.levels.length?
              selected.context.levels.map(x=>x.id+' '+x.status).join(', '):'Нет подтверждённого совпадения'}</b></div>
            <div><small>Торговая сессия</small><b>{selected.context.session}</b></div>
            <div><small>Объём / SMA20</small><b>{selected.context.volumeRatio===null?'Н/Д':
              selected.context.volumeRatio.toFixed(2)+'×'}</b></div>
          </div>
          <div className="asc-fvg-observations">
            <strong>НАБЛЮДЕНИЯ ИЗ LEGACY LEVEL ENGINE · НЕ ПОДТВЕРЖДЕНИЯ CORE</strong>
            {selected.context.observations?.length?
              selected.context.observations.map((e,i)=><span key={i}>
                {date(e.at,tz)} · {e.level??'LEVEL'} {e.type}
              </span>):<span>Нет подтверждённых исторических наблюдений</span>}
          </div>
          <div className="asc-fvg-milestones">Заполнение: {([25,50,75,100] as const).map(level=>
            <span key={level} className={selected.milestones[level]?'reached':''}>
              {level}% {selected.milestones[level]?'✓':'–'}
            </span>)}</div>
        </div>
        <div className="asc-fvg-confirmations">
          <strong>ПОДТВЕРЖДЕНИЯ CORE · ОТДЕЛЬНО ОТ ЗОНЫ</strong>
          {STRUCTURE_ROWS.map(([key,label])=>{
            const step=structure?.steps[key];
            return <div key={key} title={step?.detail??'Исследовательская история 1m загружается'}>
              <span>{label}</span>
              <b className={step?.status==='OK'?'confirmed':'unknown'}>
                {step?stateLabel[step.status]:'ОЖИДАНИЕ ДАННЫХ'}</b>
            </div>;
          })}
          <div><span>Ретест FVG</span><b className={selected.firstTouchAt?'confirmed':'unknown'}>
            {selected.firstTouchAt?'ДА · НАБЛЮДАЛСЯ':'НЕТ'}</b></div>
          <div><span>Session Window · при формировании выбранного FVG</span><b>{selected.context.session==='OUTSIDE_WINDOWS'?'ВНЕ ОКНА':'АКТИВНА'}</b></div>
          <p>Состояния Structure Research относятся к текущим UTC-суткам и выбранной паре,
            а не к конкретной FVG из исторического списка. Ретест выбранной FVG показывается
            отдельно. Подтверждения не отправляются в торговый бот.</p>
        </div>
        <div className="asc-fvg-events">
          <strong>ХРОНОЛОГИЯ · ПО ЗАКРЫТЫМ СВЕЧАМ</strong>
          {events.length?events.map(e=><div key={e.id}>
            <time>{date(e.at,tz)}</time><span>{labels[e.type]??e.type}</span>
            <b>{Math.round(e.fillPct)}%</b>
          </div>):<small>Пока только создана зона</small>}
          <p>Время внутри бара неизвестно: для wick-событий указано время закрытия
            свечи, на которой событие стало наблюдаемым, не время сделки внутри свечи.</p>
        </div>
      </div>
    </div>:<p className="asc-fvg-warning">Дожидаемся закрытых свечей выбранных таймфреймов.</p>}
    <div className="asc-fvg-stats">
      <strong>ИССЛЕДОВАНИЕ · ПО ATR-КЛАССАМ (БЕЗ WIN RATE)</strong>
      <div className="asc-fvg-stats-grid">{(Object.entries(stats) as
        [FvgRecord['sizeClass'],{total:number;retested:number;filled:number}][])
        .map(([label,s])=><div key={label}>
          <b>{classes[label]}</b><span>Зон: {s.total}</span>
          <span>Касание: {s.retested}</span><span>Заполнено: {s.filled}</span>
        </div>)}</div>
      <p>Заполненный FVG ≠ прибыльная сделка. Без подтверждённых Entry / SL / TP
        невозможно корректно вычислить Win Rate, MFE/MAE или expectancy.</p>
    </div>
    <p className="asc-fvg-local-note">
      Журнал сохраняется только в локальном хранилище этого браузера. Не является
      круглосуточным серверным сборщиком; при закрытом терминале новые события не
      записываются до следующей загрузки биржевых свечей.
    </p>
  </section>;
}
