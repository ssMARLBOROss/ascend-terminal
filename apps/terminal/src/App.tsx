import { useEffect, useMemo, useState } from 'react';
import type { AscendEvent, AscendTimeframe, SetupMode } from '@ascend/contracts';
import { events, radar, sessions, stageOrder } from './data/mockScenario';
import { historicalChronology, historyMeta, marketSources } from './data/mockHistory';
import AnalyticsPage from './pages/AnalyticsPage';
import OverviewPage from './pages/OverviewPage';
import TelegramPage from './pages/TelegramPage';
import PlaceholderPage from './pages/PlaceholderPage';
import RadarPage from './pages/RadarPage';
import SignalsPage from './pages/SignalsPage';
import MiniAppPage from './pages/MiniAppPage';
import SettingsPage from './pages/SettingsPage';
import DevPage from './pages/DevPage';
import LiveCandleChart from './components/LiveCandleChart';
import { useBybitMarket } from './market/useBybitMarket';
import { deriveLiveMarketContext } from './market/engine';
import './dev.css';
import './ux.css';
import './quality.css';
import './layout-v2.css';

const fmtPrice=(v?:number)=>{if(typeof v!=='number'||!Number.isFinite(v))return'—';const a=Math.abs(v);return v.toLocaleString('en-US',{maximumFractionDigits:a>=1000?2:a>=1?4:a>=0.01?6:10})};
function payloadValue(event:AscendEvent,key:string,fallback='—'){const value=(event.payload as Record<string,unknown>)[key];return value===undefined||value===null?fallback:String(value)}

export default function App(){
 const[selected,setSelected]=useState(events[0]);
 const[visibleCount,setVisibleCount]=useState(1);
 const[playing,setPlaying]=useState(false);
 const[density,setDensity]=useState<'compact'|'comfortable'>('compact');
 const[radarOpen,setRadarOpen]=useState(true);
 const[decisionOpen,setDecisionOpen]=useState(true);
 const[mode,setMode]=useState<SetupMode>('SCALP');
 const[activeGroup,setActiveGroup]=useState('ALL');
 const[currentView,setCurrentView]=useState('OVERVIEW');
 const[marketSymbol,setMarketSymbol]=useState('BTCUSDT');
 const[chartTf,setChartTf]=useState<AscendTimeframe>('15m');
 const[marketMode,setMarketMode]=useState<'LIVE'|'REPLAY'>('LIVE');
 const[loadedCandles,setLoadedCandles]=useState(2000);
 const[historyRange,setHistoryRange]=useState('250');
 const[historyOffset,setHistoryOffset]=useState(0);
 const[sourceFilter,setSourceFilter]=useState<'ALL'|'DEX'|'CEX'|'CORE'>('ALL');

 const live=useBybitMarket(marketSymbol,chartTf);
 const historyWindow=Number(historyRange)||250;
 const liveContext=useMemo(()=>deriveLiveMarketContext(marketSymbol,live.contextCandles,live.candles),[marketSymbol,live.contextCandles,live.candles]);
 useEffect(()=>{if(!playing||marketMode!=='REPLAY')return;if(visibleCount>=events.length){setPlaying(false);return}const timer=window.setTimeout(()=>{const next=visibleCount+1;setVisibleCount(next);setSelected(events[next-1])},950);return()=>window.clearTimeout(timer)},[playing,visibleCount,marketMode]);
 useEffect(()=>{if(marketMode==='LIVE'&&liveContext.chronology.length){setSelected(liveContext.chronology[liveContext.chronology.length-1])}},[marketMode,liveContext.chronology.length]);
 useEffect(()=>{setHistoryOffset(0)},[marketSymbol,chartTf]);
 const visibleEvents=events.slice(0,visibleCount);
 const chain=useMemo(()=>events.filter(e=>e.sequenceId<=selected.sequenceId),[selected]);
 const chronologyEvents=useMemo(()=>{
  const replayCurrent=visibleEvents.map(e=>({...e,source:'ASCEND_CORE' as const,status:'CONFIRMED' as const}));
  const liveCurrent=liveContext.chronology.map(e=>({...e,source:'BYBIT' as const,status:'OBSERVED' as const}));
  const base=marketMode==='LIVE'?liveCurrent:[...historicalChronology,...replayCurrent];
  return base.sort((a,b)=>a.timestamp-b.timestamp).filter(e=>{
   if(sourceFilter==='ALL')return true;
   if(sourceFilter==='DEX')return e.source==='DEX_SCANNER';
   if(sourceFilter==='CORE')return e.source==='ASCEND_CORE';
   return e.source!=='DEX_SCANNER'&&e.source!=='ASCEND_CORE';
  });
 },[visibleEvents,sourceFilter,marketMode,liveContext.chronology]);
 const filteredRadar=activeGroup==='ALL'?radar:radar.filter(i=>i.group===activeGroup);
 const confirmed=marketMode==='REPLAY'&&visibleEvents.some(e=>e.type==='CONFIRMED');
 const riskPass=marketMode==='REPLAY'&&confirmed&&Number(payloadValue(events[events.length-1],'remainingRangePct','0'))>=40;
 const effectiveSessions=marketMode==='LIVE'&&liveContext.sessions.length?liveContext.sessions:sessions;
 const currentPrice=marketMode==='LIVE'?(live.ticker.lastPrice??live.candles.at(-1)?.close):86640;
 const reset=()=>{setPlaying(false);setVisibleCount(1);setSelected(events[0])};

 return <div className={'app '+density+(radarOpen?'':' radar-closed')+(decisionOpen?'':' decision-closed')}>
  <header className="global-bar app-nav">
   <button className="brand-block brand-button" onClick={()=>setCurrentView('OVERVIEW')}><div className="mark">A</div><div><strong>ASCEND</strong><small>ТОРГОВЫЙ AI-ТЕРМИНАЛ · AI TRADING TERMINAL</small></div></button>
   <nav className="top-nav">
    {[
      ['OVERVIEW','ОБЗОР','OVERVIEW'],
      ['ANALYTICS','АНАЛИТИКА','ANALYTICS'],
      ['MARKET','РЫНОК','MARKET'],
      ['RADAR','РАДАР','RADAR'],
      ['SIGNALS','СИГНАЛЫ','SIGNALS'],
      ['TELEGRAM','TG-БОТ','TELEGRAM'],
      ['MINIAPP','МИНИ-ПРИЛОЖЕНИЕ','MINI APP'],
      ['SETTINGS','НАСТРОЙКИ','SETTINGS'],
      ['DEV','РАЗРАБОТКА','DEV']
    ].map(([key,ru,en])=><button key={key} className={currentView===key?'active':''} onClick={()=>setCurrentView(key)}><span>{ru}</span><small>{en}</small></button>)}
   </nav>
   <div className="global-actions">
    <span className={'live-status '+(currentView==='MARKET'&&marketMode==='LIVE'&&live.status==='LIVE'?'real-status':'mock-status')}>{currentView==='MARKET'&&marketMode==='LIVE'?'● РЫНОК '+live.status+' · BYBIT':'● ДЕМО · MOCK'}</span>
    <button onClick={()=>setDensity(density==='compact'?'comfortable':'compact')}>{density==='compact'?'Компактно · Compact':'Удобно · Comfortable'}</button>
   </div>
  </header>

  {currentView==='OVERVIEW' ? <OverviewPage onNavigate={setCurrentView}/> :
   currentView==='ANALYTICS' ? <div className="standalone-view"><AnalyticsPage/></div> :
   currentView==='TELEGRAM' ? <div className="standalone-view"><TelegramPage onNavigate={setCurrentView}/></div> :
   currentView==='RADAR' ? <div className="standalone-view"><RadarPage onNavigate={setCurrentView} onOpenMarket={(symbol)=>{setMarketSymbol(symbol);setCurrentView('MARKET')}}/></div> :
   currentView==='SIGNALS' ? <div className="standalone-view"><SignalsPage onNavigate={setCurrentView}/></div> :
   currentView==='MINIAPP' ? <div className="standalone-view"><MiniAppPage/></div> :
   currentView==='SETTINGS' ? <div className="standalone-view"><SettingsPage/></div> :
   currentView==='DEV' ? <div className="standalone-view"><DevPage/></div> :
  <div className={'terminal-grid '+(currentView==='MARKET'?'market-view':'')}>
   <nav className="nav-rail">{[
     ['OVERVIEW','Обзор / Overview'],['MARKET','Рынок / Market'],['RADAR','Радар / Radar'],['SIGNALS','Сигналы / Signals'],['TELEGRAM','TG-Бот / Telegram'],['MINIAPP','Мини / Mini App'],['ANALYTICS','Аналитика / Analytics'],['SETTINGS','Настройки / Settings'],['DEV','Разработка / Dev']
   ].map(([key,label])=><button className={currentView===key?'active':''} key={key} onClick={()=>setCurrentView(key)}><span>{label.slice(0,1)}</span><small>{label}</small></button>)}</nav>

   {radarOpen&&<aside className="radar-panel">
    <div className="panel-title"><div><strong>УМНЫЙ РАДАР · SMART RADAR</strong><small>весь futures universe · server filtered</small></div><button onClick={()=>setRadarOpen(false)}>×</button></div>
    <input className="search" placeholder="Поиск монеты / Search symbol…"/>
    <div className="radar-tabs">{['ALL','HOT NOW','RC30 LONG','RC70 SHORT','YH/YL APPROACH','ONH/ONL APPROACH'].map(group=><button key={group} className={activeGroup===group?'active':''} onClick={()=>setActiveGroup(group)}>{group}</button>)}</div>
    <div className="radar-list">{filteredRadar.map(item=><button className={'radar-row '+(item.symbol==='BTCUSDT'?'selected':'')} key={item.symbol} onClick={()=>{setMarketSymbol(item.symbol);setCurrentView('MARKET')}}><div><b>{item.symbol}</b><small>{item.state}</small></div><span>{item.price}</span><em className={item.change.startsWith('+')?'positive':'negative'}>{item.change}</em></button>)}</div>
    <div className="radar-foot"><small>Радар находит ситуацию. Radar finds the situation. Core принимает решение только после подтверждения.</small></div>
   </aside>}

   <main className="market-workspace">
    <section className="instrument-bar">
     <div><strong>{marketSymbol} <em className={marketMode==='LIVE'?'real-feed-chip':'mock-feed-chip'}>{marketMode==='LIVE'?'REAL':'REPLAY'}</em></strong><small>{marketMode==='LIVE'?'ФЬЮЧЕРСЫ · FUTURES · BYBIT PUBLIC FEED':'ФЬЮЧЕРСЫ · FUTURES · CORE REPLAY'}</small></div>
     <div className="timeframes">{historyMeta.derivedTimeframes.filter(tf=>!['1W','1M'].includes(tf)).map(tf=><button className={chartTf===tf?'active':''} onClick={()=>setChartTf(tf)} key={tf}>{tf}</button>)}</div>
     <div className="instrument-actions"><button className={marketMode==='LIVE'?'active live-mode-btn':''} onClick={()=>setMarketMode('LIVE')}>● REAL MARKET</button><button className={marketMode==='REPLAY'?'active':''} onClick={()=>setMarketMode('REPLAY')}>CORE REPLAY</button>{!radarOpen&&<button onClick={()=>setRadarOpen(true)}>Радар · Radar</button>}{!decisionOpen&&<button onClick={()=>setDecisionOpen(true)}>Панель · Panel</button>}<button className={mode==='SCALP'?'active':''} onClick={()=>setMode('SCALP')}>SCALP</button><button className={mode==='NORMAL'?'active':''} onClick={()=>setMode('NORMAL')}>NORMAL</button></div>
    </section>

    <section className="session-map">{effectiveSessions.map((session,index)=><div className={'session-card '+session.status.toLowerCase()} key={session.name+index}><div><b>{index===3?'NEXT ':''}{session.name}</b><span>{session.status}</span></div>{session.high&&<small>H {fmtPrice(session.high)} · L {fmtPrice(session.low)}</small>}{session.balance&&<small>Balance {fmtPrice(session.balance)}</small>}{session.startsIn&&<em>starts in {session.startsIn}</em>}</div>)}</section>

    {marketMode==='LIVE'?<section className="lifecycle live-market-flow"><span className="flow-live">● PUBLIC FEED</span><b>BYBIT</b><span>→</span><b>CANDLES</b><span>→</span><b>SESSIONS</b><span>→</span><b>FROZEN LEVELS</b><span>→</span><b>BREAK / SWEEP / RECLAIM</b><span>→</span><em>CORE CONFIRMATION NEXT</em></section>:<section className="lifecycle">{stageOrder.map((stage,index)=>{const event=events[index],done=index<visibleCount,current=selected.type===stage;return <button key={stage} className={(done?'done ':'')+(current?'current':'')} onClick={()=>{if(done)setSelected(event)}}><span>{done?'✓':'○'}</span>{stage}</button>})}</section>}

    <section className="chart-shell">
     <div className="chart-toolbar"><div><b>{marketSymbol} · {chartTf}</b><small>СЕССИИ / СТЕНКИ / БАЛАНС / ЛИКВИДНОСТЬ · SESSION FLOW / WALLS / BALANCE / LIQUIDITY</small></div><div className="chart-toggles"><button>УРОВНИ · LEVELS</button><button>КЛАСТЕРЫ · CLUSTERS</button><button>СТРУКТУРА · STRUCTURE</button><button>СОБЫТИЯ · EVENTS</button></div></div>
     <div className="history-toolbar">
      <div className="history-summary"><strong>ИСТОРИЯ СВЕЧЕЙ · HISTORICAL CANDLES</strong><span>{marketMode==='LIVE'?live.candles.length.toLocaleString('ru-RU'):loadedCandles.toLocaleString('ru-RU')} загружено / loaded</span><small>{marketMode==='LIVE'?'реальные Bybit candles · REST pagination + WebSocket live':'≈ '+historyMeta.estimatedCandles.toLocaleString('ru-RU')+' доступно · replay store'}</small></div>
      <div className="history-ranges">{['100','250','500','1000'].map(r=><button key={r} className={historyRange===r?'active':''} onClick={()=>setHistoryRange(r)}>{r} свечей</button>)}</div>
      <div className="history-actions">
       {marketMode==='LIVE'&&<button onClick={async()=>{if(historyOffset+historyWindow>=live.candles.length-20&&live.hasOlder)await live.loadOlder();setHistoryOffset(v=>Math.min(v+Math.max(25,Math.floor(historyWindow/2)),Math.max(0,live.candles.length-historyWindow)))}}>← РАНЬШЕ · EARLIER</button>}
       {marketMode==='LIVE'&&<button disabled={historyOffset===0} onClick={()=>setHistoryOffset(v=>Math.max(0,v-Math.max(25,Math.floor(historyWindow/2))))}>ПОЗЖЕ · LATER →</button>}
       <button disabled={marketMode==='LIVE'&&(!live.hasOlder||live.loadingOlder)} onClick={()=>marketMode==='LIVE'?live.loadOlder():setLoadedCandles(v=>Math.min(v+1000,historyMeta.estimatedCandles))}>{marketMode==='LIVE'&&live.loadingOlder?'ЗАГРУЗКА…':'+ ИСТОРИЯ · LOAD OLDER'}</button>
       <button onClick={()=>{setHistoryOffset(0);if(marketMode==='LIVE'&&liveContext.chronology.length)setSelected(liveContext.chronology[liveContext.chronology.length-1]);else setSelected(events[visibleCount-1]??events[0])}}>К ПОСЛЕДНЕЙ · LATEST →</button>
      </div>
     </div>
     <div className={'mock-chart '+(marketMode==='LIVE'?'live-chart-mode':'')}>
      {marketMode==='LIVE'&&<LiveCandleChart candles={live.candles} levels={liveContext.levels} lastPrice={currentPrice} status={live.status} source={live.source} latencyMs={live.latencyMs} offset={historyOffset} windowSize={historyWindow}/>} 
      <div className="session-band asia"><span>ASIA · FROZEN</span></div><div className="session-band london"><span>LONDON · FROZEN</span></div><div className="session-band ny"><span>NEW YORK · LIVE</span></div><div className="session-band next"><span>NEXT ASIA · EXPECTED</span></div>
      <div className="level wall upper-wall"><b>ВЕРХНЯЯ СТЕНКА · UPPER WALL</b><span>ONH 86,978 · CONFIRMED</span></div>
      <div className="level cluster high-cluster"><b>ВЕРХНИЙ КЛАСТЕР LONDON / NY · HIGH CLUSTER</b><span>86,900–86,990 · UNDER ATTACK</span></div>
      <div className="level reference yh"><span>YH 86,720</span></div><div className="level reference vwap"><span>VWAP 86,460</span></div>
      <div className="level balance"><b>БАЛАНС / РАВНОВЕСИЕ · EQUILIBRIUM</b><span>≈ 86,300–86,400 · CURRENT</span></div>
      <div className="level reference open"><span>OPEN 86,020</span></div>
      <div className="level wall lower-wall"><b>НИЖНЯЯ / ПЕРЕВЁРНУТАЯ СТЕНКА · LOWER / FLIPPED WALL</b><span>RTH HIGH 85,851 · SUPPORT</span></div>
      <div className="level cluster low-cluster"><b>СЛЕДУЮЩАЯ НИЖНЯЯ ЛИКВИДНОСТЬ · NEXT LOWER LIQUIDITY</b><span>85,500–85,100</span></div>
      <svg viewBox="0 0 1000 520" preserveAspectRatio="none" className="price-path"><defs><linearGradient id="priceStroke" x1="0" x2="1"><stop offset="0%" stopColor="#68849b"/><stop offset="58%" stopColor="#44b8d9"/><stop offset="100%" stopColor="#d7e5ee"/></linearGradient></defs><polyline points="15,365 70,340 120,385 175,330 230,350 290,292 345,315 405,250 455,275 510,210 565,230 620,165 675,192 725,125 770,145 815,102 858,155 905,190 955,220 990,210" fill="none" stroke="url(#priceStroke)" strokeWidth="3" vectorEffect="non-scaling-stroke"/></svg>
      {visibleEvents.map((event,index)=><button key={event.eventId} className={'event-marker marker-'+(index+1)+(selected.eventId===event.eventId?' selected':'')} onClick={()=>setSelected(event)}>{index+1}</button>)}
      <div className="event-popover"><div className="event-head"><div><strong>{selected.type}</strong><small>{selected.timeframe} · {selected.session} · {String((selected as any).source??'ASCEND_CORE')}</small></div><span>{new Date(selected.timestamp).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}</span></div><div className="event-level">{selected.level} · {fmtPrice(selected.price)}</div><p>{selected.explanation}</p><div className="event-next"><small>ЧТО ЖДЁМ ДАЛЬШЕ · NEXT EXPECTED</small><b>{selected.nextExpected}</b></div><div className="event-chain">{chain.map(item=>item.type).join(' → ')}</div></div>
     </div>
     {marketMode==='REPLAY'?<div className="scenario-controls"><button className="primary" onClick={()=>setPlaying(true)} disabled={playing||visibleCount>=events.length}>▶ ПРОИГРАТЬ СЦЕНАРИЙ · PLAY</button><button onClick={()=>{if(visibleCount>=events.length)return;const next=visibleCount+1;setVisibleCount(next);setSelected(events[next-1])}}>ШАГ +1 · STEP</button><button onClick={reset}>СБРОС · RESET</button><span>{visibleCount}/{events.length} событий · events</span></div>:<div className="scenario-controls live-feed-controls"><span className={live.status==='LIVE'?'positive':'warning'}>● {live.status}</span><b>{fmtPrice(currentPrice)}</b><span>24H {live.ticker.change24hPct!==undefined?(live.ticker.change24hPct>=0?'+':'')+live.ticker.change24hPct.toFixed(2)+'%':'—'}</span><span>Latency {live.latencyMs??'—'} ms</span><span>{live.error?'Ошибка · '+live.error:'Public data · no API key'}</span></div>}
     <section className="chronology-panel">
      <div className="chronology-head">
       <div><strong>ХРОНОЛОГИЯ РЫНКА · MARKET CHRONOLOGY</strong><small>{marketMode==='LIVE'?'REAL: пробои / sweeps / acceptance по замороженным уровням без look-ahead':'REPLAY: события Core + research context'}</small></div>
       <div className="chronology-source">{(['ALL','DEX','CEX','CORE'] as const).map(s=><button key={s} className={sourceFilter===s?'active':''} onClick={()=>setSourceFilter(s)}>{s}</button>)}</div>
      </div>
      <div className="chronology-scroll">
       {chronologyEvents.map(event=><button key={event.eventId} className={'chronology-event '+(selected.eventId===event.eventId?'active ':'')+(event.source==='DEX_SCANNER'?'dex ':'')+(event.type==='BREAK'?'break ':'')+(event.type==='SWEEP'?'sweep ':'')+(event.type==='CONFIRMED'?'confirmed ':'')} onClick={()=>setSelected(event)}>
        <span>{new Date(event.timestamp).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}</span>
        <b>{event.type}</b>
        <small>{event.level}</small>
        <em>{event.source}</em>
       </button>)}
      </div>
      <div className="chronology-legend"><span>{marketMode==='LIVE'?'BYBIT = реальные публичные свечи':'DEX = раннее предупреждение · discovery only'}</span><span>CEX = проверка рынка · validation</span><span>CORE = решение только после подключения live-confirmation engine</span><span>Клик по событию → объяснение и время</span></div>
     </section>
    </section>

    <section className="analytics-strip">
     {marketMode==='LIVE'?<>
      <div><small>ЦЕНА · LAST PRICE</small><b>{fmtPrice(currentPrice)}</b><span>BYBIT linear perpetual</span></div>
      <div><small>24H</small><b className={(live.ticker.change24hPct??0)>=0?'positive':'negative'}>{live.ticker.change24hPct!==undefined?(live.ticker.change24hPct>=0?'+':'')+live.ticker.change24hPct.toFixed(2)+'%':'—'}</b><span>real-time ticker</span></div>
      <div><small>YH / YL</small><b>{fmtPrice(liveContext.yHigh)} / {fmtPrice(liveContext.yLow)}</b><span>previous UTC day · frozen</span></div>
      <div><small>VWAP</small><b>{fmtPrice(liveContext.vwap)}</b><span>current UTC day · calculated</span></div>
      <div><small>СЕССИЯ · SESSION</small><b>{liveContext.activeSession??'TRANSITION'}</b><span>Asia / London / New York</span></div>
      <div><small>VOLUME</small><b>{liveContext.volumeRatio?liveContext.volumeRatio.toFixed(2)+'×':'—'}</b><span>current candle vs 20-candle average</span></div>
      <div><small>FEED</small><b className={live.status==='LIVE'?'positive':'warning'}>{live.status}</b><span>{live.latencyMs??'—'} ms · public websocket</span></div>
     </>:<>
      <div><small>ИСПОЛЬЗОВАНО · USED RANGE</small><b>82%</b><span>высоко, но не направление · high, not directional</span></div><div><small>ОСТАЛОСЬ · REMAINING</small><b>69%</b><span>после подтверждения · after confirm</span></div><div><small>ПОТЕРЯНО ДВИЖЕНИЯ · LOST MOVE</small><b>31%</b><span>допустимо · acceptable</span></div><div><small>R:R</small><b>2.4</b><span>риск-фильтр пройден · risk gate pass</span></div><div><small>RSI</small><b>49.4</b><span>рабочая зона · working zone</span></div><div><small>VOLUME</small><b>1.6×</b><span>выше базы · above base</span></div><div><small>DELTA / CVD</small><b>MOCK</b><span>только контекст · context only</span></div>
     </>}
    </section>
   </main>

   {decisionOpen&&<aside className="decision-panel">
    <div className="panel-title"><div><strong>ЦЕНТР РЕШЕНИЙ · DECISION CENTER</strong><small>почему сейчас / почему ждём · why now / why wait</small></div><button onClick={()=>setDecisionOpen(false)}>×</button></div>
    <div className="price-card"><div><small>{marketSymbol} · {marketMode==='LIVE'?'BYBIT REAL':'REPLAY'}</small><b>{fmtPrice(currentPrice)}</b></div><span className={confirmed?'confirmed':'watch'}>{marketMode==='LIVE'?'MARKET WATCH':confirmed?'CONFIRMED':'WATCH'}</span></div>
    <section><div className="section-title">{marketMode==='LIVE'?'РЕАЛЬНЫЕ УРОВНИ · LIVE LEVELS':'СТЕНКИ РЫНКА · MARKET WALLS'}</div>{marketMode==='LIVE'?<>{liveContext.levels.slice(0,8).map(level=><div className="kv" key={level.id}><span>{level.label} <small>{level.status}</small></span><b>{fmtPrice(level.price)}</b></div>)}</>:<><div className="kv"><span>Верхняя стенка · Upper Wall</span><b>86,978</b></div><div className="kv"><span>Balance</span><b>86,300–86,400</b></div><div className="kv"><span>Нижняя стенка · Lower Wall</span><b>85,851</b></div><div className="kv"><span>Положение цены · Price position</span><b>внутри диапазона · inside range</b></div></>}</section>
    {marketMode==='LIVE'&&liveContext.chronology.length===0?<section><div className="section-title">АКТИВНОЕ СОБЫТИЕ · ACTIVE EVENT</div><h3>WAIT MARKET EVENT</h3><p>Реальные свечи поступают. Ждём касание, пробой, sweep, acceptance или reclaim одного из замороженных уровней.</p><div className="kv"><span>Источник · Source</span><b>BYBIT PUBLIC</b></div><div className="kv"><span>Состояние · Status</span><b className="positive">{live.status}</b></div></section>:<section><div className="section-title">АКТИВНОЕ СОБЫТИЕ · ACTIVE EVENT</div><h3>{selected.type}</h3><p>{selected.explanation}</p><div className="kv"><span>Время · Time</span><b>{new Date(selected.timestamp).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}</b></div><div className="kv"><span>TF</span><b>{selected.timeframe}</b></div><div className="kv"><span>Источник · Source</span><b>{marketMode==='LIVE'?'BYBIT':String((selected as any).source??'ASCEND_CORE')}</b></div><div className="kv"><span>Уровень · Level</span><b>{selected.level}</b></div><div className="kv"><span>RSI</span><b>{payloadValue(selected,'rsi')}</b></div><div className="kv"><span>Объём · Volume</span><b>{payloadValue(selected,'volumeRatio')}×</b></div><div className="kv"><span>Глубина снятия · Sweep depth</span><b>{payloadValue(selected,'sweepDepthPct')}</b></div><div className="kv"><span>Закрытие выше · Close above</span><b>{payloadValue(selected,'closeAbovePct')}</b></div></section>}
    <section><div className="section-title">ЦЕПОЧКА CORE · CORE CHAIN · {mode}</div>{marketMode==='LIVE'?<><div className="live-core-warning">Рынок уже REAL. Торговое CONFIRMED пока не подключаем к live execution: сначала валидируем события и уровни.</div>{['PUBLIC FEED','CANDLES','SESSION MAP','FROZEN LEVELS','BREAK/SWEEP','STRUCTURE ENGINE','CONFIRMED'].map((stage,index)=><div className={'chain-row '+(index<5?'passed':'')} key={stage}><span>{index<5?'✓':'○'}</span><b>{stage}</b><small>{index<5?'REAL':'NEXT'}</small></div>)}</>:stageOrder.map((stage,index)=><div className={'chain-row '+(index<visibleCount?'passed':'')} key={stage}><span>{index<visibleCount?'✓':'○'}</span><b>{stage}</b><small>{events[index].timeframe}</small></div>)}</section>
    <section><div className="section-title">РИСК / МАРШРУТ · RISK / ROUTE GATE</div><div className="kv"><span>Потенциальный ход · Potential Move</span><b>{confirmed?'0.96%':'—'}</b></div><div className="kv"><span>Риск · Risk</span><b>{confirmed?'0.38%':'—'}</b></div><div className="kv"><span>Потеряно движения · Lost Move</span><b>{confirmed?'31%':'—'}</b></div><div className="kv"><span>Осталось · Remaining</span><b>{confirmed?'69%':'—'}</b></div><div className="kv"><span>R:R</span><b>{confirmed?'2.4':'—'}</b></div><div className={'gate '+(riskPass?'pass':'wait')}>{riskPass?'РИСК-ФИЛЬТР ПРОЙДЕН · RISK GATE PASSED':'ЖДЁМ ПОДТВЕРЖДЕНИЕ · WAIT CONFIRMATION'}</div></section>
    <section><div className="section-title">ТОРГОВЫЙ ПЛАН · TRADE PLAN</div>{marketMode==='LIVE'?<><div className="kv"><span>Рынок · Market data</span><b className="positive">REAL</b></div><div className="kv"><span>Core decision</span><b className="warning">WAIT VALIDATION</b></div><div className="kv"><span>Entry / SL / TP</span><b>—</b></div><button className="paper" disabled>LIVE CORE ЕЩЁ НЕ РАЗРЕШЁН · VALIDATION FIRST</button><small className="safety">Реальные свечи не означают автоматический вход. Execution остаётся отключённым.</small></>:<><div className="kv"><span>Направление · Direction</span><b>SHORT</b></div><div className="kv"><span>Вход · Entry</span><b>{confirmed?'86,680':'—'}</b></div><div className="kv"><span>SL</span><b>{confirmed?'86,991+':'—'}</b></div><div className="kv"><span>TP1</span><b>{confirmed?'Balance 86,400':'—'}</b></div><div className="kv"><span>TP2</span><b>{confirmed?'RTH H 85,851':'—'}</b></div><div className="kv"><span>TP3</span><b>{confirmed?'Cluster 85,500–85,100':'—'}</b></div><button className="paper" disabled={!riskPass}>БУМАЖНЫЙ ВХОД · PAPER EXECUTE</button></>}<small className="safety">LIVE execution disabled.</small></section>
   </aside>}
  </div>}

  <footer className="system-bar"><span className="ok">● ИНТЕРФЕЙС · UI ONLINE</span><span className={live.status==='LIVE'?'real-footer':'mock-footer'}>BYBIT MARKET · {live.status}</span><span>CEX: {marketSources.filter(s=>s.kind==='CEX').length} adapters architecture</span><span>DEX: discovery-only ready</span><span>Рыночный поток · Market Feed {live.status}</span><span>Симуляция Core · Core Simulation</span><span>Каркас API · API skeleton</span><span>PostgreSQL · запланирован / planned</span><span>Redis · запланирован / planned</span><span>Telegram · не подключён / not connected</span><span className="latency">Задержка · Latency {live.latencyMs??"—"} ms</span></footer>
 </div>
}
