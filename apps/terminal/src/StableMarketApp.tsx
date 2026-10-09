import {useEffect,useMemo,useState} from 'react';
import StableCandleChart from './components/StableCandleChart';
import {STABLE_TIMEFRAMES,useStableMarket,type StableTimeframe} from './market/useStableMarket';
import {usePreviousDayLevels,type PreviousDayLevels} from './market/usePreviousDayLevels';
import {usePreviousSessionLevels,type PreviousSessionLevels} from './market/usePreviousSessionLevels';
import {useDailyVwap,type DailyVwap} from './market/useDailyVwap';
import {useOrderbookClusters} from './market/useOrderbookClusters';
import WeekOverlayCompare from './components/WeekOverlayCompare';
import LiveMarketPanels from './components/LiveMarketPanels';
import {useLiveMarketMetrics} from './market/useLiveMarketMetrics';
import {selectFvgZones,type FvgAppearance} from './components/fvgOverlay';
import {useFvgResearch} from './market/useFvgResearch';
import FvgDetailsPanel from './components/FvgDetailsPanel';
import MarketParticipationPanel,{ParticipationMicroCharts} from './components/MarketParticipationPanel';
import {useMarketParticipation} from './market/useMarketParticipation';
import {useContinuousCvd,type ContinuousCvd} from './market/useContinuousCvd';
import ContinuousCvdPanel from './components/ContinuousCvdPanel';
import IndicatorManager from './components/IndicatorManager';
import {loadIndicatorSettings,DEFAULT_INDICATORS,STORAGE_KEY,
  type IndicatorSettings,type IndicatorKey} from './market/indicatorSettings';

const FAVORITES=[
  'BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT','DOGEUSDT',
  'ADAUSDT','LINKUSDT','AVAXUSDT','SUIUSDT','DOTUSDT','LTCUSDT',
  'TRXUSDT','NEARUSDT','INJUSDT','APTUSDT','ARBUSDT','OPUSDT',
  'FILUSDT','ATOMUSDT','UNIUSDT','AAVEUSDT','ETCUSDT','XLMUSDT'
];

function fmtPrice(value?:number){
  if(value===undefined||!Number.isFinite(value))return '—';
  const decimals=value>=1000?2:value>=1?4:value>=.01?6:9;
  return value.toLocaleString('en-US',{maximumFractionDigits:decimals});
}

function fmtVolume(value?:number){
  if(value===undefined||!Number.isFinite(value))return '—';
  return value.toLocaleString('ru-RU',{maximumFractionDigits:2});
}

function Workspace({symbol,timeframe,previousDay,previousDayStatus,previousSessions,previousSessionsStatus,dailyVwap,vwapStatus,liveMetrics,cvdStream,settings,onToggle,onUpdate,onReset}:{
  symbol:string;timeframe:StableTimeframe;
  previousDay?:PreviousDayLevels;previousDayStatus:'loading'|'ready'|'error';
  previousSessions?:PreviousSessionLevels;previousSessionsStatus:'loading'|'ready'|'error';
  dailyVwap?:DailyVwap;vwapStatus:'loading'|'ready'|'error';
  liveMetrics:ReturnType<typeof useLiveMarketMetrics>;
  cvdStream:ContinuousCvd;
  settings:IndicatorSettings;onToggle:(key:IndicatorKey)=>void;
  onUpdate:(patch:Partial<IndicatorSettings>)=>void;onReset:()=>void;
}){
  const{candles,status,error,lastPrice,lastUpdate}=useStableMarket(symbol,timeframe);
  const[focusRequest,setFocusRequest]=useState(0);
  const[selectedFvgId,setSelectedFvgId]=useState<string>();
  // Participation is a separate read-only consumer; hiding book rectangles
  // must not stop its selected-symbol snapshots when this panel is enabled.
  const liquidity=useOrderbookClusters(symbol,settings.book||settings.participation);
  const engineSettings=useMemo(()=>({
    atrLength:settings.fvgAtrLength,fillMode:settings.fvgFillMode,
    minGapPercent:settings.fvgThreshold
  }),[settings.fvgAtrLength,settings.fvgFillMode,settings.fvgThreshold]);
  const fvgResearch=useFvgResearch(symbol,timeframe,candles,settings.fvgTimeframes,
    engineSettings,previousDay,previousSessions);
  const latest=candles[candles.length-1];
  const displayPrice=lastPrice??latest?.close;
  const fvgAppearance=useMemo<FvgAppearance>(()=>({
    bullish:settings.fvgBullish,bearish:settings.fvgBearish,
    midline:settings.fvgMidline,showFill:settings.fvgShowFill,
    showCreated:settings.fvgShowCreated,showRetest:settings.fvgShowRetest,
    showHistorical:settings.fvgShowHistorical,activeOnly:settings.fvgOnlyActive,
    opacity:settings.fvgOpacity,maxZones:settings.fvgMaxZones,
    selectedId:selectedFvgId
  }),[settings,selectedFvgId]);
  const shownFvg=useMemo(()=>selectFvgZones(
    fvgResearch.zones,displayPrice??0,settings.fvgViewMode,fvgAppearance
  ),[fvgResearch.zones,displayPrice,settings.fvgViewMode,fvgAppearance]);
  const participation=useMarketParticipation({
    enabled:settings.participation,symbol,timeframe,candles,price:displayPrice,
    priceAt:lastUpdate,dailyVwap,tpo:liveMetrics.tpo,oi:liveMetrics.oi,
    cvd:liveMetrics.cvd,continuousCvd:cvdStream,
    book:liquidity.status==='ready'?liquidity.snapshot:undefined,
    previousDay,previousSessions,fvgs:fvgResearch.zones
  });

  return <main className="asc-lite-workspace">
    <div className="asc-lite-toolbar">
      <div className="asc-lite-pair">
        <strong>{symbol}</strong>
        <span>BYBIT · USDT PERPETUAL · REAL DATA</span>
      </div>
      <div className="asc-lite-daily-levels" title="Максимум и минимум предыдущего закрытого дня · 00:00–00:00 UTC">
        {previousDay?<>
          <span className="asc-lite-daily-level high"><b>YH</b><strong>{fmtPrice(previousDay.high)}</strong></span>
          <span className="asc-lite-daily-level low"><b>YL</b><strong>{fmtPrice(previousDay.low)}</strong></span>
          <small>{new Date(previousDay.dayStartUtc).toLocaleDateString('ru-RU',{timeZone:'UTC',day:'2-digit',month:'2-digit'})} UTC</small>
        </>:<small>{previousDayStatus==='error'?'YH / YL: ожидание данных Bybit':'Загружаем YH / YL…'}</small>}
      </div>
      <div className="asc-lite-vwap-ticker" title="Дневной VWAP с 00:00 UTC · HLC3 × объём, Bybit 5m">
        <b>VWAP · UTC</b>
        {dailyVwap?<>
          <strong>{fmtPrice(dailyVwap.value)}</strong>
          <span className={displayPrice!==undefined&&displayPrice>=dailyVwap.value?'above':'below'}>
            {displayPrice===undefined?'—':displayPrice>=dailyVwap.value?'ЦЕНА ВЫШЕ':'ЦЕНА НИЖЕ'}
            {displayPrice!==undefined?' · '+Math.abs((displayPrice/dailyVwap.value-1)*100).toFixed(2)+'%':''}
          </span>
        </>:<small>{vwapStatus==='error'?'Нет полного VWAP · повтор загрузки':'Расчёт от 00:00…'}</small>}
      </div>
      <div className="asc-lite-feed">
        <i className={status==='LIVE'?'is-live':'is-wait'}/>
        <b>{status==='LIVE'?'Поток LIVE':status==='RECONNECTING'?'Переподключение':'Подключение'}</b>
        <small>{candles.length} свечей</small>
      </div>
    </div>
    {settings.stats&&<div className="asc-lite-stats">
      <div><small>ПОСЛЕДНЯЯ ЦЕНА</small><strong>{fmtPrice(displayPrice)}</strong></div>
      <div><small>O / ОТКРЫТИЕ СВЕЧИ</small><b>{fmtPrice(latest?.open)}</b></div>
      <div><small>H / МАКСИМУМ СВЕЧИ</small><b>{fmtPrice(latest?.high)}</b></div>
      <div><small>L / МИНИМУМ СВЕЧИ</small><b>{fmtPrice(latest?.low)}</b></div>
      <div><small>ОБЪЁМ СВЕЧИ</small><b>{fmtVolume(latest?.volume)}</b></div>
    </div>}
    <IndicatorManager settings={settings} onToggle={onToggle}
      onUpdate={onUpdate} onReset={onReset}
      onFocus={()=>setFocusRequest(value=>value+1)}
      fvgVisible={shownFvg.length}
      bookState={settings.book?
        (liquidity.status==='ready'?'ONLINE · '+new Date(liquidity.snapshot!.receivedAt).toLocaleTimeString('ru-RU'):
          liquidity.status==='error'?'НЕДОСТУПЕН':'ПОДКЛЮЧЕНИЕ'):'ВЫКЛЮЧЕН'}/>
    <div className={'asc-mp-layout'+(settings.participation?' visible':'')}>
      <div className="asc-mp-chart-column">
        <div className="asc-lite-chart-box">
      <StableCandleChart candles={candles} timeframe={timeframe} previousDay={previousDay}
        previousSessions={previousSessions} dailyVwap={dailyVwap}
        orderbook={liquidity.status==='ready'?liquidity.snapshot:undefined}
        showBook={settings.book} showStops={settings.stops}
        tpo={liveMetrics.tpo.status==='ready'?liveMetrics.tpo.data:undefined} showTpo={settings.tpo}
        fvgZones={shownFvg} showFvg={settings.fvg} fvgAppearance={fvgAppearance}
        focusRequest={focusRequest}
        showVolume={settings.volume} showVwap={settings.vwap}
        showSessions={settings.sessions} showSessionClock={settings.sessionClock}
        showDayLevels={settings.dayLevels} showSessionLevels={settings.sessionLevels}/>
      {candles.length<20&&<div className="asc-lite-loading" role="status">
        <strong>{error?'Не удалось получить историю':'Загружаем реальные свечи…'}</strong>
        <span>{error??'График появится после получения истории Bybit REST'}</span>
      </div>}
        </div>
        {settings.cvd&&<ContinuousCvdPanel symbol={symbol} live={cvdStream}
          interval={settings.cvdInterval} onInterval={tf=>onUpdate({cvdInterval:tf})}/>}
        {settings.participation&&<ParticipationMicroCharts journal={participation.journal}/>}
      </div>
      {settings.participation&&<MarketParticipationPanel symbol={symbol}
        snapshot={participation.snapshot} journal={participation.journal}
        fvgs={fvgResearch.zones}/>}
    </div>
    {settings.fvg&&<FvgDetailsPanel symbol={symbol}
      records={fvgResearch.zones} journal={fvgResearch.journal}
      selectedId={selectedFvgId} onSelect={setSelectedFvgId}
      price={displayPrice} zoneTimeframes={fvgResearch.loadedTimeframes}
      errors={fvgResearch.errors}/>}
    {settings.week&&<WeekOverlayCompare symbol={symbol}/>}
    <LiveMarketPanels symbol={symbol} {...liveMetrics} visibility={settings}
      continuousCvd={cvdStream}/>
    {settings.sessionLevels&&<div className="asc-prev-session-strip" aria-label="Максимумы и минимумы вчерашних сессий">
      <div className="asc-prev-session-title">
        <b>ВЧЕРА · СЕССИИ</b>
        <small>{previousSessions?
          new Date(previousSessions.dayStartUtc).toLocaleDateString('ru-RU',{timeZone:'UTC',day:'2-digit',month:'2-digit'})+' · UTC · 5m Bybit':
          previousSessionsStatus==='error'?'Ожидание полной истории Bybit · повтор автоматически':'Загрузка уровней…'}</small>
      </div>
      {previousSessions&&<div className="asc-prev-session-list">
        {previousSessions.sessions.map(session=><div key={session.id}
          className={'asc-prev-session-item '+session.id.toLowerCase()}>
          <b>{session.name}</b>
          <span><em>H</em> {fmtPrice(session.high)}</span>
          <span><em>L</em> {fmtPrice(session.low)}</span>
          <small>{String(session.from).padStart(2,'0')}:00–{String(session.to).padStart(2,'0')}:00</small>
        </div>)}
      </div>}
    </div>}
    <footer className="asc-lite-chart-footer">
      <span>СВЕЧИ · ОБЪЁМ · VWAP UTC · СЕССИИ · ASCEND STABLE</span>
      <span>{lastUpdate?'Последнее обновление: '+new Date(lastUpdate).toLocaleTimeString('ru-RU'):'Ожидание данных'}</span>
    </footer>
    {error&&candles.length>=20&&<p className="asc-lite-note" role="status">{error} · график продолжает показывать последние полученные свечи</p>}
  </main>;
}

export default function StableMarketApp(){
  const[settings,setSettings]=useState<IndicatorSettings>(loadIndicatorSettings);
  useEffect(()=>{
    try{window.localStorage.setItem(STORAGE_KEY,JSON.stringify(settings))}catch{/* private mode */}
  },[settings]);
  const toggleIndicator=(key:IndicatorKey)=>
    setSettings(previous=>({...previous,[key]:!previous[key]}));
  const updateIndicators=(patch:Partial<IndicatorSettings>)=>
    setSettings(previous=>({...previous,...patch}));
  const resetIndicators=()=>setSettings({...DEFAULT_INDICATORS});
  const[symbol,setSymbol]=useState('BTCUSDT');
  const[timeframe,setTimeframe]=useState<StableTimeframe>('15m');
  const previousDay=usePreviousDayLevels(symbol);
  const previousSessions=usePreviousSessionLevels(symbol);
  const vwap=useDailyVwap(symbol);
  const cvdStream=useContinuousCvd(symbol,settings.cvd||settings.participation,
    settings.cvdInterval);
  const liveMetrics=useLiveMarketMetrics(symbol,{
    tpo:settings.tpo||settings.participation,
    oi:settings.oi||settings.participation,
    longShort:settings.longShort,
    cvd:false // legacy 1000-trade sample, replaced by connected WS CVD
  });
  const[search,setSearch]=useState('');
  const[inputError,setInputError]=useState('');
  const matches=useMemo(()=>{
    const q=search.trim().toUpperCase();
    const list=FAVORITES.includes(symbol)?FAVORITES:[symbol,...FAVORITES];
    return list.filter(item=>item.includes(q));
  },[search,symbol]);

  const choose=(value:string)=>{
    setSymbol(value);
    setSearch('');
    setInputError('');
  };
  const useSearchSymbol=()=>{
    const upper=search.toUpperCase().trim().replace(/[\s/\-_]/g,'');
    const candidate=upper.endsWith('USDT')?upper:upper+'USDT';
    if(!/^[A-Z0-9]{2,20}USDT$/.test(candidate)){
      setInputError('Введите пару, например BTC или BTCUSDT');
      return;
    }
    choose(candidate);
  };

  return <div className={'asc-lite-app'+(settings.coins?'':' asc-hide-coins')}>
    <header className="asc-lite-header">
      <div className="asc-lite-brand"><span className="asc-lite-logo">A</span><div><strong>ASCEND</strong><small>MARKET · STABLE BASE V1</small></div></div>
      <div className="asc-lite-header-right"><span>РЫНОК / MARKET</span><b>ГРАФИК + МОНЕТЫ</b></div>
    </header>

    <div className="asc-lite-layout">
      <aside className="asc-lite-sidebar">
        <div className="asc-lite-side-heading"><strong>МОНЕТЫ</strong><small>BYBIT USDT FUTURES</small></div>
        <div className="asc-lite-search">
          <input aria-label="Поиск монеты" value={search} onChange={e=>{setSearch(e.target.value);setInputError('')}}
            onKeyDown={e=>{if(e.key==='Enter')useSearchSymbol()}}
            placeholder="BTC, ETH, SOL…"/>
          <button type="button" onClick={useSearchSymbol} title="Открыть пару">↗</button>
        </div>
        {inputError&&<p className="asc-lite-search-error">{inputError}</p>}
        <div className="asc-lite-coin-list">
          {matches.map(item=><button key={item} type="button" onClick={()=>choose(item)}
            className={'asc-lite-coin '+(symbol===item?'active':'')}>
            <span className="asc-lite-coin-icon">{item.slice(0,2)}</span>
            <span><b>{item.replace('USDT','')}</b><small>USDT PERP</small></span>
            {symbol===item&&<em>●</em>}
          </button>)}
          {!matches.length&&<p className="asc-lite-empty">Нет в избранном. Нажми Enter, чтобы открыть введённую пару.</p>}
        </div>
        <div className="asc-lite-side-note">Подписываемся только на выбранную пару. Остальные монеты не загружаются в фоне.</div>
      </aside>

      <section className="asc-lite-main">
        <div className="asc-lite-timeframe-bar">
          <div><strong>ТАЙМФРЕЙМ</strong><small>TIMEFRAME</small></div>
          <div className="asc-lite-timeframes">
            {STABLE_TIMEFRAMES.map(tf=><button key={tf} type="button"
              className={tf===timeframe?'active':''} onClick={()=>setTimeframe(tf)}>{tf}</button>)}
          </div>
        </div>
        <Workspace key={symbol+':'+timeframe} symbol={symbol} timeframe={timeframe}
          previousDay={previousDay.levels} previousDayStatus={previousDay.status}
          previousSessions={previousSessions.levels} previousSessionsStatus={previousSessions.status}
          dailyVwap={vwap.daily} vwapStatus={vwap.status} liveMetrics={liveMetrics}
          cvdStream={cvdStream}
          settings={settings} onToggle={toggleIndicator}
          onUpdate={updateIndicators} onReset={resetIndicators}/>
      </section>
    </div>
  </div>;
}
