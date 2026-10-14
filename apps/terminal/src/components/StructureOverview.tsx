import {useMemo} from 'react';
import type {Candle} from '@ascend/contracts';
import type {StructureReport} from '../market/ascendStructureResearch';
import type {ResearchDecision,LiquidityLevel} from '../market/liquidityDecisionResearch';
import type {PreviousDayLevels} from '../market/usePreviousDayLevels';
import {deriveLevelChronology,type ObservedLevel,type LevelMoment} from '../market/levelChronology';

type Feed={status:'loading'|'ready'|'error';report?:StructureReport;
  closed1m?:Candle[];updatedAt?:number;reason?:string};
const ORDER=['WATCH','SHIFTING','CONFIRMED','ENTRY READY'] as const;
const clock=(at?:number)=>at?new Date(at).toLocaleTimeString('ru-RU',{
  timeZone:'UTC',hour:'2-digit',minute:'2-digit'}):'—';
const nicePrice=(v:number)=>v.toLocaleString('en-US',{
  maximumFractionDigits:v>=1000?2:v>=1?4:7
});

/** Compact decision ribbon. A research phase is not an executable order. */
export function StructureStatusRibbon({feed,decision}:{feed:Feed;decision?:ResearchDecision}){
  const stale=!feed.updatedAt||Date.now()-feed.updatedAt>130000;
  const available=feed.status==='ready'&&!!feed.report&&!stale;
  // Never expose the old CORE research READY if the 30m/15m/risk gate is WAIT/SKIP.
  const phase=available?(decision?.status==='ENTRY READY'?'ENTRY READY':
    feed.report!.phase==='ENTRY READY'?'CONFIRMED':feed.report!.phase):undefined;
  const progress=phase?ORDER.indexOf(phase):-1;
  return <section className="asc-chart-structure-ribbon" aria-label="Статус Structure Engine">
    <header><strong>STRUCTURE ENGINE</strong>
      <small>{available?'RESEARCH · '+clock(feed.report?.asOf)+' UTC · '+
        (decision?.status??'WAIT'):
        feed.status==='error'?'НЕТ ДАННЫХ · '+(feed.reason??'Ошибка потока'):
          stale&&feed.status==='ready'?'ДАННЫЕ УСТАРЕЛИ':'ОЖИДАНИЕ ПОЛНОЙ 1m ИСТОРИИ'}</small>
    </header>
    <div className="asc-chart-structure-phases">
      {ORDER.map((item,index)=><div key={item}
        className={'asc-chart-phase'+(progress===index?' current':'')+
          (progress>index?' passed':'')+(progress<0?' unavailable':'')}>
        <span className="asc-chart-phase-dot"/>
        <b>{item}</b>
      </div>)}
    </div>
    <small className="asc-chart-structure-notice">Только исследовательское подтверждение · автоматические ордера отключены</small>
  </section>;
}

const badge=(event?:LevelMoment)=>event?clock(event.at):'—';
/** All event times are the CLOSE of an observed, complete one-minute bar.
 * No inference about which tick within that minute touched the level first.
 */
export function LevelChronologyPanel({feed,previousDay,lastPrice,extraLevels}:{
  feed:Feed;previousDay?:PreviousDayLevels;lastPrice?:number;
  extraLevels?:LiquidityLevel[]
}){
  const report=feed.status==='ready'?feed.report:undefined;
  const candles=feed.status==='ready'?feed.closed1m:undefined;
  const levels=useMemo(()=>{
    const rows:ObservedLevel[]=[];
    if(previousDay&&report?.dayStart===previousDay.dayStartUtc+86400000){
      rows.push({id:'YH',price:previousDay.high,side:'UPPER',availableFrom:report.dayStart},
        {id:'YL',price:previousDay.low,side:'LOWER',availableFrom:report.dayStart});
    }
    if(report?.onh!==undefined&&report?.onl!==undefined&&
      report.asOf>=report.dayStart+6*3600000){
      rows.push({id:'ONH',price:report.onh,side:'UPPER',availableFrom:report.dayStart+6*3600000},
        {id:'ONL',price:report.onl,side:'LOWER',availableFrom:report.dayStart+6*3600000});
    }
    for(const level of extraLevels??[]){
      if(level.state!=='FROZEN'||!['RTHH','RTHL','IBH','IBL'].includes(level.id))continue;
      rows.push({id:level.id,price:level.price,side:level.side,
        availableFrom:level.availableFrom});
    }
    return rows;
  },[previousDay,report?.dayStart,report?.asOf,report?.onh,report?.onl,extraLevels]);
  const observations=useMemo(()=>
    candles&&report?deriveLevelChronology(candles,levels,report.asOf):[],
    [candles,levels,report?.asOf]);
  const stale=!feed.updatedAt||Date.now()-feed.updatedAt>130000;
  return <section className="asc-chart-chronology" aria-label="Время событий ключевых уровней">
    <header>
      <div><strong>ЛИКВИДНОСТЬ · ХРОНОЛОГИЯ</strong>
        <small>Касание / снятие / возврат по закрытым свечам 1m · время UTC</small></div>
      <span>{stale||feed.status!=='ready'?'НЕТ АКТУАЛЬНЫХ ДАННЫХ':'НАБЛЮДЕНИЕ'}</span>
    </header>
    {!stale&&observations.length?<div className="asc-chart-chronology-table">
      <div className="asc-chart-chronology-row head">
        <span>Уровень</span><span>Цена / Δ</span><span>Касание</span>
        <span>Снятие</span><span>Возврат</span>
      </div>
      {observations.map(level=><div className="asc-chart-chronology-row" key={level.id}>
        <strong>{level.id}</strong>
        <span>{nicePrice(level.level)}
          <small>{lastPrice&&level.level>0?
            ((lastPrice/level.level-1)*100).toFixed(2)+'%':'—'}</small>
        </span>
        <time>{badge(level.touch)}</time><time>{badge(level.sweep)}</time>
        <time>{badge(level.reclaim)}</time>
      </div>)}
    </div>:<p className="asc-chart-chronology-empty">{feed.status==='error'?
      'История 1m недоступна: '+(feed.reason??'неизвестная ошибка'):
      'Ожидаем подтверждённые замороженные уровни и полный дневной поток 1m.'}</p>}
    <footer>Метки времени = закрытие соответствующей минуты; точный момент касания внутри свечи неизвестен.
      SWEEP — прокол уровня с закрытием обратно; RECLAIM — возврат закрытием после выхода за уровень.
      Это не сигнал на открытие позиции.</footer>
  </section>;
}
