import type {LiquidityMap,LiquidityLevel} from '../market/liquidityMapEngine';

const fmt=(n:number)=>{
  const decimals=n>=1000?2:n>=1?4:n>=.01?6:9;
  return n.toLocaleString('en-US',{maximumFractionDigits:decimals});
};
const when=(n?:number)=>n===undefined?'—':new Date(n).toLocaleString('ru-RU',{
  timeZone:'UTC',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',
  hourCycle:'h23'
})+' UTC';
const keys=['YH','YL','ONH','ONL','RTH_H','RTH_L','IBH','IBL'] as const;
const stateText:Record<LiquidityLevel['state'],string>={
  LIVE:'LIVE · диапазон формируется',FROZEN:'FROZEN',SWEEP:'SWEEP',
  RECLAIM:'RECLAIM',ACCEPTANCE:'ACCEPTANCE'
};
export default function LiquidityMapPanel({map,status,reason}:{
  map?:LiquidityMap;status:'loading'|'ready'|'error';reason?:string
}){
  return <section className="asc-liq-map-panel" aria-label="ASCEND Liquidity Map V1">
    <header>
      <div><strong>LIQUIDITY MAP V1 · BSL / SSL</strong>
        <small>Bybit · закрытые 1m свечи · уровень и время события в UTC · read-only</small>
      </div>
      <b className={'asc-liq-map-ready '+(map?'ready':'')}>
        {map?'ATR(14) 5m × 0,30':status==='error'?'НЕТ ИСТОРИИ':'ЗАГРУЗКА'}
      </b>
    </header>
    {!map?<p className="asc-liq-map-unavailable" role="status">
      {status==='error'?'История 1m недоступна: '+(reason??'проверка полноты не пройдена'):
        'Ожидаем сплошные закрытые минутные свечи и ATR(14) по 5m…'}
    </p>:<>
      <div className="asc-liq-map-overview">
        <span className="bsl"><strong>ВЕРХНЯЯ BSL</strong>
          {map.upper?<><b>{map.upper.key} · {fmt(map.upper.price)}</b>
            <small>{map.upper.distancePct>0?'+':''}{map.upper.distancePct.toFixed(2)}% · {map.upper.state}</small></>:
            <small>Уровень ещё не сформирован</small>}
        </span>
        <span className="ssl"><strong>НИЖНЯЯ SSL</strong>
          {map.lower?<><b>{map.lower.key} · {fmt(map.lower.price)}</b>
            <small>{map.lower.distancePct>0?'+':''}{map.lower.distancePct.toFixed(2)}% · {map.lower.state}</small></>:
            <small>Уровень ещё не сформирован</small>}
        </span>
        <span><strong>ATR 5m</strong><b>{fmt(map.atr)}</b><small>Ширина зоны {fmt(map.atr*.3)}</small></span>
      </div>
      <div className="asc-liq-map-list">
        {keys.map(key=>{
          const item=map.levels.find(x=>x.key===key);
          return <div key={key} className={'asc-liq-map-row '+(item?.side??'') }>
            <b>{key}</b>
            <span>{item?fmt(item.price):'—'}</span>
            <span className={item?.state==='LIVE'?'live':'state'}>{item?stateText[item.state]:'НЕ СФОРМИРОВАН'}</span>
            <span>{item?(item.distancePct>0?'+':'')+item.distancePct.toFixed(2)+'%':'—'}</span>
            <span title="Время наблюдаемого закрытия свечи, не время сделки внутри свечи">
              SWEEP: {when(item?.sweepAt)}
              {item?.depthPct!==undefined&&<em> · {item.depthPct.toFixed(2)}% ({fmt(item.depthPrice??0)})</em>}
            </span>
            <span>RECLAIM: {when(item?.reclaimAt)}</span>
            <span>ACCEPT: {when(item?.acceptanceAt)}</span>
          </div>;
        })}
      </div>
      <div className="asc-liq-map-last-events">
        <b>ПОСЛЕДНИЕ СОБЫТИЯ</b>
        {map.events.length?
          map.events.slice(-8).reverse().map((e,i)=><span key={e.key+'-'+e.at+'-'+e.type+'-'+i}>
            {when(e.at)} · {e.key} {e.type}
            {e.type==='SWEEP'&&e.depthPct!==undefined?' · '+e.depthPct.toFixed(2)+'%':''}
          </span>):<span>Пока нет SWEEP после заморозки уровней</span>}
      </div>
    </>}
    <footer>ONH/ONL: 00:00–06:00 UTC. RTH: 09:30–16:00 Нью-Йорк
      (с автоматическим учётом DST). IBH/IBL: первый час RTH.
      LIVE-уровень не участвует в SWEEP, пока диапазон не закрыт.
      Время события — закрытие 1m свечи. ACCEPTANCE = минимум два закрытия за уровнем.
      Это расчётные зоны потенциальной ликвидности, не фактические стоп-ордера;
      модуль не создаёт торговых входов.</footer>
  </section>;
}
