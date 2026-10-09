import {useMemo,useState} from 'react';
import StableCandleChart from './StableCandleChart';
import {useMexcMarket} from '../market/useMexcMarket';
import type {StableTimeframe} from '../market/useStableMarket';
import type {FvgAppearance} from './fvgOverlay';
import type {IndicatorSettings} from '../market/indicatorSettings';
import type {FuturesContract} from '../market/exchangeCatalog';

const OFF:FvgAppearance={
  bullish:false,bearish:false,midline:false,showFill:false,
  showCreated:false,showRetest:false,showHistorical:false,
  activeOnly:true,opacity:0,maxZones:0
};
function price(n:number|undefined){
  if(n===undefined||!Number.isFinite(n))return '—';
  return n.toLocaleString('en-US',{maximumFractionDigits:n>=1000?2:n>=1?4:9});
}
export default function MexcWorkspace({contract,timeframe,settings,onViewMode}:{
  contract:FuturesContract;timeframe:StableTimeframe;settings:IndicatorSettings;
  onViewMode:(mode:IndicatorSettings['chartViewMode'])=>void;
}){
  const market=useMexcMarket(contract.symbol,timeframe);
  const[focus,setFocus]=useState(0);
  const[showVolume,setVolume]=useState(settings.volume);
  const[showSessions,setSessions]=useState(settings.sessions);
  const last=market.candles.at(-1);
  const data=useMemo(()=>market.candles,[market.candles]);
  return <main className="asc-lite-workspace">
    <div className="asc-lite-toolbar">
      <div className="asc-lite-pair">
        <strong>{contract.label} <small>{contract.symbol}</small></strong>
        <span>MEXC · USDT PERPETUAL · SOURCE: MEXC FUTURES</span>
      </div>
      <div className="asc-lite-feed">
        <i className={market.status==='POLLING'?'is-live':'is-wait'}/>
        <b>{market.status==='POLLING'?'REST · каждые 15 сек':
          market.status==='ERROR'?'НЕТ ДАННЫХ':'Загружаем MEXC'}</b>
        <small>{data.length} свечей</small>
      </div>
    </div>
    <div className="asc-lite-stats">
      <div><small>ПОСЛЕДНЯЯ ЦЕНА MEXC</small><strong>{price(last?.close)}</strong></div>
      <div><small>OPEN</small><b>{price(last?.open)}</b></div>
      <div><small>HIGH</small><b>{price(last?.high)}</b></div>
      <div><small>LOW</small><b>{price(last?.low)}</b></div>
      <div><small>VOLUME · CONTRACTS</small><b>{last?.volume.toLocaleString('en-US',{maximumFractionDigits:2})??'—'}</b></div>
    </div>
    <div className="asc-mexc-indicators">
      <b>ОТОБРАЖЕНИЕ MEXC</b>
      <button className={showVolume?'active':''} type="button"
        aria-pressed={showVolume} onClick={()=>setVolume(v=>!v)}>◉ Объёмы</button>
      <button className={showSessions?'active':''} type="button"
        aria-pressed={showSessions} onClick={()=>setSessions(v=>!v)}>◉ Сессии</button>
      <div className="asc-chart-view-switch" role="group" aria-label="Масштаб MEXC графика">
        {(['TIGHT','FULL'] as const).map(mode=>
          <button type="button" key={mode} className={settings.chartViewMode===mode?'active':''}
            aria-pressed={settings.chartViewMode===mode}
            onClick={()=>onViewMode(mode)}>{mode}</button>)}
      </div>
      <button type="button" onClick={()=>setFocus(x=>x+1)}>⌖ К текущей цене</button>
    </div>
    <div className="asc-lite-chart-box">
      <StableCandleChart candles={data} timeframe={timeframe}
        showBook={false} showStops={false} showTpo={false}
        fvgZones={[]} showFvg={false} fvgAppearance={OFF}
        focusRequest={focus} viewMode={settings.chartViewMode}
        showVolume={showVolume} showVwap={false}
        showSessions={showSessions} showSessionClock={false}
        showDayLevels={false} showSessionLevels={false}/>
      {data.length<10&&<div className="asc-lite-loading" role="status">
        <strong>{market.status==='ERROR'?'Данные MEXC недоступны':
          'Загружаем фьючерсные свечи MEXC…'}</strong>
        <span>{market.error??'При отсутствии ответа API график не заменяется свечами Bybit.'}</span>
      </div>}
    </div>
    <div className="asc-mexc-research-warning" role="note">
      <strong>MEXC · НЕЗАВИСИМЫЕ БИРЖЕВЫЕ ДАННЫЕ</strong>
      <p>Сейчас для MEXC доступны реальные свечи, объёмы контрактов, визуальные сессии и поиск пар.
      Обновление свечей — REST каждые 15 секунд, не поток сделок WebSocket.</p>
      <p>VWAP / TPO / OI / CVD / FVG Context / Order Book / Market Participation,
      уровни YH/YL и журнал сделок, настроенные на Bybit, здесь намеренно отключены,
      чтобы не смешивать биржи и не показывать ложные подтверждения.</p>
    </div>
    <footer className="asc-lite-chart-footer">
      <span>MEXC · USDT FUTURES · READ ONLY · NO ORDERS</span>
      <span>{market.lastUpdate?'Обновлено '+new Date(market.lastUpdate).toLocaleTimeString('ru-RU'):'Ожидаем REST'}</span>
    </footer>
    {market.error&&data.length>10&&<p className="asc-lite-note">
      MEXC API: {market.error} · последние успешно загруженные свечи сохранены на экране
    </p>}
  </main>;
}
