import { useEffect, useMemo, useState } from 'react';
import type { AscendEvent, SetupMode } from '@ascend/contracts';
import { events, radar, sessions, stageOrder } from './data/mockScenario';
import AnalyticsPage from './pages/AnalyticsPage';
import OverviewPage from './pages/OverviewPage';
import TelegramPage from './pages/TelegramPage';
import PlaceholderPage from './pages/PlaceholderPage';
import RadarPage from './pages/RadarPage';
import SignalsPage from './pages/SignalsPage';
import MiniAppPage from './pages/MiniAppPage';
import SettingsPage from './pages/SettingsPage';
import DevPage from './pages/DevPage';
import './dev.css';
import './ux.css';

const fmtPrice=(v?:number)=>typeof v==='number'?v.toLocaleString('en-US'):'—';
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

 useEffect(()=>{if(!playing)return;if(visibleCount>=events.length){setPlaying(false);return}const timer=window.setTimeout(()=>{const next=visibleCount+1;setVisibleCount(next);setSelected(events[next-1])},950);return()=>window.clearTimeout(timer)},[playing,visibleCount]);
 const visibleEvents=events.slice(0,visibleCount);
 const chain=useMemo(()=>events.filter(e=>e.sequenceId<=selected.sequenceId),[selected]);
 const filteredRadar=activeGroup==='ALL'?radar:radar.filter(i=>i.group===activeGroup);
 const confirmed=visibleEvents.some(e=>e.type==='CONFIRMED');
 const riskPass=confirmed&&Number(payloadValue(events[events.length-1],'remainingRangePct','0'))>=40;
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
    <span className="live-status mock-status">● ДЕМО · MOCK</span>
    <button onClick={()=>setDensity(density==='compact'?'comfortable':'compact')}>{density==='compact'?'Компактно · Compact':'Удобно · Comfortable'}</button>
   </div>
  </header>

  {currentView==='OVERVIEW' ? <OverviewPage onNavigate={setCurrentView}/> :
   currentView==='ANALYTICS' ? <div className="standalone-view"><AnalyticsPage/></div> :
   currentView==='TELEGRAM' ? <div className="standalone-view"><TelegramPage onNavigate={setCurrentView}/></div> :
   currentView==='RADAR' ? <div className="standalone-view"><RadarPage onNavigate={setCurrentView}/></div> :
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
    <div className="radar-list">{filteredRadar.map(item=><button className={'radar-row '+(item.symbol==='BTCUSDT'?'selected':'')} key={item.symbol}><div><b>{item.symbol}</b><small>{item.state}</small></div><span>{item.price}</span><em className={item.change.startsWith('+')?'positive':'negative'}>{item.change}</em></button>)}</div>
    <div className="radar-foot"><small>Радар находит ситуацию. Radar finds the situation. Core принимает решение только после подтверждения.</small></div>
   </aside>}

   <main className="market-workspace">
    <section className="instrument-bar">
     <div><strong>BTCUSDT</strong><small>ФЬЮЧЕРСЫ · FUTURES · MOCK FEED</small></div>
     <div className="timeframes">{['1m','3m','5m','10m','15m','30m','45m','1H','2H','4H','6H','12H','1D'].map(tf=><button className={tf==='15m'?'active':''} key={tf}>{tf}</button>)}</div>
     <div className="instrument-actions">{!radarOpen&&<button onClick={()=>setRadarOpen(true)}>Радар · Radar</button>}{!decisionOpen&&<button onClick={()=>setDecisionOpen(true)}>Панель · Panel</button>}<button className={mode==='SCALP'?'active':''} onClick={()=>setMode('SCALP')}>SCALP</button><button className={mode==='NORMAL'?'active':''} onClick={()=>setMode('NORMAL')}>NORMAL</button></div>
    </section>

    <section className="session-map">{sessions.map((session,index)=><div className={'session-card '+session.status.toLowerCase()} key={session.name+index}><div><b>{index===3?'NEXT ':''}{session.name}</b><span>{session.status}</span></div>{session.high&&<small>H {fmtPrice(session.high)} · L {fmtPrice(session.low)}</small>}{session.balance&&<small>Balance {fmtPrice(session.balance)}</small>}{session.startsIn&&<em>starts in {session.startsIn}</em>}</div>)}</section>

    <section className="lifecycle">{stageOrder.map((stage,index)=>{const event=events[index],done=index<visibleCount,current=selected.type===stage;return <button key={stage} className={(done?'done ':'')+(current?'current':'')} onClick={()=>{if(done)setSelected(event)}}><span>{done?'✓':'○'}</span>{stage}</button>})}</section>

    <section className="chart-shell">
     <div className="chart-toolbar"><div><b>BTCUSDT · 15m</b><small>СЕССИИ / СТЕНКИ / БАЛАНС / ЛИКВИДНОСТЬ · SESSION FLOW / WALLS / BALANCE / LIQUIDITY</small></div><div className="chart-toggles"><button>УРОВНИ · LEVELS</button><button>КЛАСТЕРЫ · CLUSTERS</button><button>СТРУКТУРА · STRUCTURE</button><button>СОБЫТИЯ · EVENTS</button></div></div>
     <div className="mock-chart">
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
      <div className="event-popover"><div className="event-head"><div><strong>{selected.type}</strong><small>{selected.timeframe} · {selected.session}</small></div><span>{new Date(selected.timestamp).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}</span></div><div className="event-level">{selected.level} · {fmtPrice(selected.price)}</div><p>{selected.explanation}</p><div className="event-next"><small>ЧТО ЖДЁМ ДАЛЬШЕ · NEXT EXPECTED</small><b>{selected.nextExpected}</b></div><div className="event-chain">{chain.map(item=>item.type).join(' → ')}</div></div>
     </div>
     <div className="scenario-controls"><button className="primary" onClick={()=>setPlaying(true)} disabled={playing||visibleCount>=events.length}>▶ ПРОИГРАТЬ СЦЕНАРИЙ · PLAY</button><button onClick={()=>{if(visibleCount>=events.length)return;const next=visibleCount+1;setVisibleCount(next);setSelected(events[next-1])}}>ШАГ +1 · STEP</button><button onClick={reset}>СБРОС · RESET</button><span>{visibleCount}/{events.length} событий · events</span></div>
    </section>

    <section className="analytics-strip">
     <div><small>ИСПОЛЬЗОВАНО · USED RANGE</small><b>82%</b><span>высоко, но не направление · high, not directional</span></div><div><small>ОСТАЛОСЬ · REMAINING</small><b>69%</b><span>после подтверждения · after confirm</span></div><div><small>ПОТЕРЯНО ДВИЖЕНИЯ · LOST MOVE</small><b>31%</b><span>допустимо · acceptable</span></div><div><small>R:R</small><b>2.4</b><span>риск-фильтр пройден · risk gate pass</span></div><div><small>RSI</small><b>49.4</b><span>рабочая зона · working zone</span></div><div><small>VOLUME</small><b>1.6×</b><span>выше базы · above base</span></div><div><small>DELTA / CVD</small><b>MOCK</b><span>только контекст · context only</span></div>
    </section>
   </main>

   {decisionOpen&&<aside className="decision-panel">
    <div className="panel-title"><div><strong>ЦЕНТР РЕШЕНИЙ · DECISION CENTER</strong><small>почему сейчас / почему ждём · why now / why wait</small></div><button onClick={()=>setDecisionOpen(false)}>×</button></div>
    <div className="price-card"><div><small>BTCUSDT</small><b>86,140</b></div><span className={confirmed?'confirmed':'watch'}>{confirmed?'CONFIRMED':'WATCH'}</span></div>
    <section><div className="section-title">СТЕНКИ РЫНКА · MARKET WALLS</div><div className="kv"><span>Верхняя стенка · Upper Wall</span><b>86,978</b></div><div className="kv"><span>Balance</span><b>86,300–86,400</b></div><div className="kv"><span>Нижняя стенка · Lower Wall</span><b>85,851</b></div><div className="kv"><span>Положение цены · Price position</span><b>внутри диапазона · inside range</b></div></section>
    <section><div className="section-title">АКТИВНОЕ СОБЫТИЕ · ACTIVE EVENT</div><h3>{selected.type}</h3><p>{selected.explanation}</p><div className="kv"><span>Время · Time</span><b>{new Date(selected.timestamp).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}</b></div><div className="kv"><span>TF</span><b>{selected.timeframe}</b></div><div className="kv"><span>Уровень · Level</span><b>{selected.level}</b></div><div className="kv"><span>RSI</span><b>{payloadValue(selected,'rsi')}</b></div><div className="kv"><span>Объём · Volume</span><b>{payloadValue(selected,'volumeRatio')}×</b></div></section>
    <section><div className="section-title">ЦЕПОЧКА CORE · CORE CHAIN · {mode}</div>{stageOrder.map((stage,index)=><div className={'chain-row '+(index<visibleCount?'passed':'')} key={stage}><span>{index<visibleCount?'✓':'○'}</span><b>{stage}</b><small>{events[index].timeframe}</small></div>)}</section>
    <section><div className="section-title">РИСК / МАРШРУТ · RISK / ROUTE GATE</div><div className="kv"><span>Потенциальный ход · Potential Move</span><b>{confirmed?'0.96%':'—'}</b></div><div className="kv"><span>Риск · Risk</span><b>{confirmed?'0.38%':'—'}</b></div><div className="kv"><span>Потеряно движения · Lost Move</span><b>{confirmed?'31%':'—'}</b></div><div className="kv"><span>Осталось · Remaining</span><b>{confirmed?'69%':'—'}</b></div><div className="kv"><span>R:R</span><b>{confirmed?'2.4':'—'}</b></div><div className={'gate '+(riskPass?'pass':'wait')}>{riskPass?'РИСК-ФИЛЬТР ПРОЙДЕН · RISK GATE PASSED':'ЖДЁМ ПОДТВЕРЖДЕНИЕ · WAIT CONFIRMATION'}</div></section>
    <section><div className="section-title">ТОРГОВЫЙ ПЛАН · TRADE PLAN · SIMULATION</div><div className="kv"><span>Направление · Direction</span><b>SHORT</b></div><div className="kv"><span>Вход · Entry</span><b>{confirmed?'86,680':'—'}</b></div><div className="kv"><span>SL</span><b>{confirmed?'86,991+':'—'}</b></div><div className="kv"><span>TP1</span><b>{confirmed?'Balance 86,400':'—'}</b></div><div className="kv"><span>TP2</span><b>{confirmed?'RTH H 85,851':'—'}</b></div><div className="kv"><span>TP3</span><b>{confirmed?'Cluster 85,500–85,100':'—'}</b></div><button className="paper" disabled={!riskPass}>БУМАЖНЫЙ ВХОД · PAPER EXECUTE</button><small className="safety">LIVE-исполнение намеренно отключено в V1. Live execution is disabled in V1.</small></section>
   </aside>}
  </div>}

  <footer className="system-bar"><span className="ok">● ИНТЕРФЕЙС · UI ONLINE</span><span className="mock-footer">ДЕМО-ДАННЫЕ · MOCK DATA</span><span>Рыночный поток · Market Feed MOCK</span><span>Симуляция Core · Core Simulation</span><span>Каркас API · API skeleton</span><span>PostgreSQL · запланирован / planned</span><span>Redis · запланирован / planned</span><span>Telegram · не подключён / not connected</span><span className="latency">Задержка · Latency —</span></footer>
 </div>
}
