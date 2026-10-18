import {useEffect,useMemo,useRef,useState} from 'react';
import StableCandleChart from './components/StableCandleChart';
import {MarketStateStrip} from './components/MarketBiasOverlay';
import {useGlobalTrendPreview} from './market/useGlobalTrendPreview';
import RadarView from './components/RadarView';
import MexcWorkspace from './components/MexcWorkspace';
import {MEXC_TIMEFRAMES,type MexcTimeframe} from './market/useMexcMarket';
import {useExchangeCatalog} from './market/useExchangeCatalog';
import {searchContracts,type FuturesExchange} from './market/exchangeCatalog';
import {PLANNED_VENUES,type PlannedVenue} from './market/crossExchangeSpread';
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
import {useAscendStructureResearch} from './market/useAscendStructureResearch';
import AscendStructurePanel from './components/AscendStructurePanel';
import FvgDetailsPanel from './components/FvgDetailsPanel';
import MarketParticipationPanel,{ParticipationMicroCharts} from './components/MarketParticipationPanel';
import {useMarketParticipation} from './market/useMarketParticipation';
import {useContinuousCvd,type ContinuousCvd} from './market/useContinuousCvd';
import ContinuousCvdPanel from './components/ContinuousCvdPanel';
import IndicatorManager from './components/IndicatorManager';
import MarketStudiesRow from './components/MarketStudiesRow';
import {StructureStatusRibbon,LevelChronologyPanel} from './components/StructureOverview';
import {buildMarketLiquidity,buildDecisionResearch} from './market/liquidityDecisionResearch';
import {LiquidityMapPanel,DecisionResearchPanel} from './components/LiquidityDecisionPanel';
import {buildTrendStructure} from './market/trendStructureResearch';
import {useExpandedTrendResearch} from './market/useExpandedTrendResearch';
import TrendStructurePanel from './components/TrendStructurePanel';
import FocusSessionStrip from './components/FocusSessionStrip';
import FocusStudiesStrip from './components/FocusStudiesStrip';
import FocusDecisionPanel from './components/FocusDecisionPanel';
import {focusEarlyOnResearch} from './market/focusEarlyResearch';
import {buildChartNarrative} from './market/chartNarrativeResearch';
import {loadIndicatorSettings,DEFAULT_INDICATORS,STORAGE_KEY,
  type IndicatorSettings,type IndicatorKey} from './market/indicatorSettings';


function fmtPrice(value?:number){
  if(value===undefined||!Number.isFinite(value))return '—';
  const decimals=value>=1000?2:value>=1?4:value>=.01?6:9;
  return value.toLocaleString('en-US',{maximumFractionDigits:decimals});
}

function fmtVolume(value?:number){
  if(value===undefined||!Number.isFinite(value))return '—';
  return value.toLocaleString('ru-RU',{maximumFractionDigits:2});
}

function Workspace({symbol,timeframe,previousDay,previousDayStatus,previousSessions,previousSessionsStatus,dailyVwap,vwapStatus,liveMetrics,cvdStream,settings,onToggle,onUpdate,onReset,focusMode,plannedVenue}:{
  symbol:string;timeframe:StableTimeframe;
  previousDay?:PreviousDayLevels;previousDayStatus:'loading'|'ready'|'error';
  previousSessions?:PreviousSessionLevels;previousSessionsStatus:'loading'|'ready'|'error';
  dailyVwap?:DailyVwap;vwapStatus:'loading'|'ready'|'error';
  liveMetrics:ReturnType<typeof useLiveMarketMetrics>;
  cvdStream:ContinuousCvd;
  settings:IndicatorSettings;onToggle:(key:IndicatorKey)=>void;
  onUpdate:(patch:Partial<IndicatorSettings>)=>void;onReset:()=>void;
  focusMode:boolean;plannedVenue:PlannedVenue;
}){
  const{candles,status,error,lastPrice,lastUpdate}=useStableMarket(symbol,timeframe);
  const globalBias=useGlobalTrendPreview(symbol);
  const[focusRequest,setFocusRequest]=useState(0);
  const[selectedFvgId,setSelectedFvgId]=useState<string>();
  const[expandedOverlays,setExpandedOverlays]=useState(false);
  const[showChartNarrative,setShowChartNarrative]=useState(true);
  // Participation is a separate read-only consumer; hiding book rectangles
  // must not stop its selected-symbol snapshots when this panel is enabled.
  const liquidity=useOrderbookClusters(symbol,!focusMode&&(settings.book||settings.participation));
  const engineSettings=useMemo(()=>({
    atrLength:settings.fvgAtrLength,fillMode:settings.fvgFillMode,
    minGapPercent:settings.fvgThreshold
  }),[settings.fvgAtrLength,settings.fvgFillMode,settings.fvgThreshold]);
  const fvgResearch=useFvgResearch(symbol,timeframe,candles,settings.fvgTimeframes,
    engineSettings,previousDay,previousSessions);
  const structure=useAscendStructureResearch(symbol,previousDay);
  const liquidityMap=useMemo(()=>buildMarketLiquidity({
    symbol,bars:structure.closed1m??[],asOf:structure.report?.asOf??0,
    previousDay,onh:structure.report?.onh,onl:structure.report?.onl
  }),[symbol,structure.closed1m,structure.report,previousDay]);
  const trendStructure=useMemo(()=>buildTrendStructure({
    symbol,closed1m:structure.closed1m??[],asOf:structure.report?.asOf??0,
    freshAt:structure.updatedAt,now:Date.now(),setupDirection:structure.report?.direction
  }),[symbol,structure.closed1m,structure.updatedAt,structure.report]);
  const researchDecision=useMemo(()=>buildDecisionResearch({
    symbol,bars:structure.closed1m??[],report:structure.report,liquidity:liquidityMap,
    now:Date.now(),freshAt:structure.updatedAt
  }),[symbol,structure.closed1m,structure.report,structure.updatedAt,liquidityMap]);
  const extendedTrend=useExpandedTrendResearch(symbol,trendStructure);
  const earlyResearch=useMemo(()=>focusEarlyOnResearch(
    symbol,structure.closed1m??[],structure.report?.asOf??0,structure.updatedAt
  ),[symbol,structure.closed1m,structure.report?.asOf,structure.updatedAt]);
  const chartNarrative=useMemo(()=>buildChartNarrative({
    symbol,bars:structure.closed1m??[],trend:trendStructure,decision:researchDecision,
    now:Date.now(),freshAt:structure.updatedAt
  }),[symbol,structure.closed1m,structure.updatedAt,trendStructure,researchDecision]);
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
  const chartFvgAppearance=useMemo<FvgAppearance>(()=>expandedOverlays?fvgAppearance:{
    ...fvgAppearance,opacity:Math.min(fvgAppearance.opacity,20),
    maxZones:Math.min(fvgAppearance.maxZones,2),
    showCreated:false,showRetest:false,showFill:false,midline:false
  },[fvgAppearance,expandedOverlays]);
  const chartFvg=useMemo(()=>selectFvgZones(
    fvgResearch.zones,displayPrice??0,'near',chartFvgAppearance
  ),[fvgResearch.zones,displayPrice,chartFvgAppearance]);
  const participation=useMarketParticipation({
    enabled:!focusMode&&settings.participation,symbol,timeframe,candles,price:displayPrice,
    priceAt:lastUpdate,dailyVwap,tpo:liveMetrics.tpo,oi:liveMetrics.oi,
    cvd:liveMetrics.cvd,continuousCvd:cvdStream,
    book:liquidity.status==='ready'?liquidity.snapshot:undefined,
    previousDay,previousSessions,fvgs:fvgResearch.zones
  });

  const chartNode=<div className="asc-lite-chart-box">
      <StableCandleChart candles={candles} timeframe={timeframe} previousDay={previousDay}
        previousSessions={previousSessions} dailyVwap={dailyVwap}
        orderbook={liquidity.status==='ready'?liquidity.snapshot:undefined}
        showBook={!focusMode&&settings.book} showStops={!focusMode&&settings.stops}
        tpo={liveMetrics.tpo.status==='ready'?liveMetrics.tpo.data:undefined}
        showTpo={!focusMode&&settings.tpo&&expandedOverlays}
        fvgZones={chartFvg} showFvg={!focusMode&&settings.fvg} fvgAppearance={chartFvgAppearance}
        focusRequest={focusRequest} viewMode={settings.chartViewMode}
        showVolume={focusMode||settings.volume} showVwap={focusMode||settings.vwap}
        showSessions={settings.sessions} showSessionClock={!focusMode&&settings.sessionClock}
        showDayLevels={settings.dayLevels} showSessionLevels={settings.sessionLevels}
        showSma={!focusMode&&settings.sma}
        overnightLevels={settings.overnightLevels&&structure.status==='ready'&&structure.report?.onh!==undefined&&structure.report?.onl!==undefined
          ?{high:structure.report.onh,low:structure.report.onl,availableFrom:structure.report.dayStart+6*3600000}:undefined}
        researchLiquidity={structure.status==='ready'?liquidityMap:undefined}
        chartNarrative={chartNarrative} showChartNarrative={focusMode||showChartNarrative}/>
      {candles.length<20&&<div className="asc-lite-loading" role="status">
        <strong>{error?'Не удалось получить историю':'Загружаем реальные свечи…'}</strong>
        <span>{error??'График появится после получения истории Bybit REST'}</span>
      </div>}
        </div>;
  return <main className={'asc-lite-workspace'+(focusMode?' asc-focus-workspace':'')}>
    <div className="asc-lite-toolbar">
      <div className="asc-lite-pair">
        <strong>{symbol}</strong>
        {focusMode&&<b className="asc-focus-current-price">{fmtPrice(displayPrice)}</b>}
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
      {focusMode&&<button type="button" className="asc-focus-to-price"
        onClick={()=>setFocusRequest(v=>v+1)} aria-label="Вернуться к последней свече">
        ↗ К ЦЕНЕ</button>}
      <div className="asc-lite-feed">
        <i className={status==='LIVE'?'is-live':'is-wait'}/>
        <b>{status==='LIVE'?'Поток LIVE':status==='RECONNECTING'?'Переподключение':'Подключение'}</b>
        <small>{candles.length} свечей</small>
      </div>
    </div>
    <MarketStateStrip data={globalBias.snapshot} symbol={symbol}/>
    {focusMode?<div className="asc-focus-root">
      <FocusSessionStrip narrative={chartNarrative}/>
      <div className="asc-focus-stage">
        <section className="asc-focus-chart-column" aria-label="Главный график и индикаторы">
          <div className="asc-focus-chart-container">{chartNode}</div>
          <FocusStudiesStrip symbol={symbol} candles={candles} timeframe={timeframe}
            cvd={cvdStream} oi={liveMetrics.oi} plannedVenue={plannedVenue}/>
        </section>
        <FocusDecisionPanel trend={trendStructure} extended={extendedTrend} decision={researchDecision}
          liquidity={liquidityMap} narrative={chartNarrative} early={earlyResearch} plannedVenue={plannedVenue}/>
      </div>
      {error&&<p className="asc-focus-error" role="status">{error}</p>}
    </div>:<>
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
    <div className="asc-chart-focus-controls">
      <span>Рабочий график · свечи, ликвидность, VWAP</span>
      <button type="button" aria-pressed={showChartNarrative}
        onClick={()=>setShowChartNarrative(visible=>!visible)}>
        {showChartNarrative?'Пояснения · ВКЛ':'Пояснения · ВЫКЛ'}
      </button>
      <button type="button" aria-pressed={expandedOverlays}
        onClick={()=>setExpandedOverlays(value=>!value)}>
        {expandedOverlays?'Свернуть дополнительные слои':'Раскрыть FVG / TPO / Participation'}
      </button>
    </div>
    <details className="asc-chart-trend-details">
      <summary>Структура 1m → 1D (13 TF) · CORE: {trendStructure.alignment}
        {' · '}подробные HH/HL, LH/LL (на графике — краткая сводка)</summary>
      <TrendStructurePanel snapshot={trendStructure} extended={extendedTrend}/>
    </details>
    <StructureStatusRibbon feed={structure} decision={researchDecision}/>
    <div className={'asc-mp-layout'+(settings.participation&&expandedOverlays?' visible':'')}>

      <div className="asc-mp-chart-column">
        {chartNode}
        <LiquidityMapPanel data={liquidityMap} price={displayPrice}/>
        <LevelChronologyPanel feed={structure} previousDay={previousDay} lastPrice={displayPrice}
          extraLevels={liquidityMap.levels}/>
        <DecisionResearchPanel key={symbol} decision={researchDecision} asOf={structure.report?.asOf??0}/>
        <MarketStudiesRow symbol={symbol} candles={candles} timeframe={timeframe}
          cvd={cvdStream} oi={liveMetrics.oi} showRsi={settings.rsi}
          showSma={settings.sma} showCvd={settings.cvd} showOi={settings.oi}/>
        {settings.cvd&&expandedOverlays&&<ContinuousCvdPanel symbol={symbol} live={cvdStream}
          interval={settings.cvdInterval} onInterval={tf=>onUpdate({cvdInterval:tf})}/>}
        {settings.participation&&expandedOverlays&&<ParticipationMicroCharts journal={participation.journal}/>}
      </div>
      {settings.participation&&expandedOverlays&&<MarketParticipationPanel symbol={symbol}
        snapshot={participation.snapshot} journal={participation.journal}
        fvgs={fvgResearch.zones}/>}
    </div>
    {expandedOverlays&&<AscendStructurePanel feed={structure} symbol={symbol}/>}
    {settings.fvg&&expandedOverlays&&<FvgDetailsPanel symbol={symbol}
      records={fvgResearch.zones} journal={fvgResearch.journal}
      selectedId={selectedFvgId} onSelect={setSelectedFvgId}
      price={displayPrice} zoneTimeframes={fvgResearch.loadedTimeframes}
      errors={fvgResearch.errors} structure={structure.report}/>}
    {settings.week&&<WeekOverlayCompare symbol={symbol}/>}
    {expandedOverlays&&<LiveMarketPanels symbol={symbol} {...liveMetrics} visibility={settings}
      continuousCvd={cvdStream}/>}
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
    </>}
  </main>;
}


function BybitDataWorkspace({symbol,timeframe,settings,onToggle,onUpdate,onReset,focusMode,plannedVenue}:{
  symbol:string;timeframe:StableTimeframe;settings:IndicatorSettings;
  onToggle:(key:IndicatorKey)=>void;onUpdate:(patch:Partial<IndicatorSettings>)=>void;
  onReset:()=>void;focusMode:boolean;plannedVenue:PlannedVenue;
}){
  // Bybit-specific hooks run only when the selected exchange is Bybit.
  const previousDay=usePreviousDayLevels(symbol);
  const previousSessions=usePreviousSessionLevels(symbol);
  const vwap=useDailyVwap(symbol);
  const cvdStream=useContinuousCvd(symbol,focusMode||settings.cvd||settings.participation,
    settings.cvdInterval);
  const liveMetrics=useLiveMarketMetrics(symbol,{
    tpo:!focusMode&&(settings.tpo||settings.participation),
    oi:focusMode||settings.oi||settings.participation,
    longShort:!focusMode&&settings.longShort,
    cvd:false
  });
  return <Workspace key={symbol+':'+timeframe} symbol={symbol} timeframe={timeframe}
    previousDay={previousDay.levels} previousDayStatus={previousDay.status}
    previousSessions={previousSessions.levels} previousSessionsStatus={previousSessions.status}
    dailyVwap={vwap.daily} vwapStatus={vwap.status} liveMetrics={liveMetrics}
    cvdStream={cvdStream} settings={settings} onToggle={onToggle}
    onUpdate={onUpdate} onReset={onReset} focusMode={focusMode}
     plannedVenue={plannedVenue}/>;
}

export default function StableMarketApp(){
  const[page,setPage]=useState<'MARKET'|'RADAR'>('MARKET');
  const[focusMode,setFocusMode]=useState<boolean>(()=>{
    try{return window.localStorage.getItem('ascend.focus.mode.v1')!=='DETAIL'}
    catch{return true}
  });
  useEffect(()=>{
    try{window.localStorage.setItem('ascend.focus.mode.v1',focusMode?'FOCUS':'DETAIL')}
    catch{/* private mode */}
  },[focusMode]);
  const[settings,setSettings]=useState<IndicatorSettings>(loadIndicatorSettings);
  useEffect(()=>{
    try{window.localStorage.setItem(STORAGE_KEY,JSON.stringify(settings))}catch{/* private mode */}
  },[settings]);
  const toggleIndicator=(key:IndicatorKey)=>
    setSettings(previous=>({...previous,[key]:!previous[key]}));
  const updateIndicators=(patch:Partial<IndicatorSettings>)=>
    setSettings(previous=>({...previous,...patch}));
  const resetIndicators=()=>setSettings({...DEFAULT_INDICATORS});

  const[exchange,setExchange]=useState<FuturesExchange>('BYBIT');
  const[plannedVenue,setPlannedVenue]=useState<PlannedVenue>(()=>{
    try{const found=window.localStorage.getItem('ascend.planned.venue.v1');
      return PLANNED_VENUES.find(v=>v===found)??'BYBIT'}catch{return 'BYBIT'}
  });
  useEffect(()=>{
    try{window.localStorage.setItem('ascend.planned.venue.v1',plannedVenue)}catch{/* private mode */}
  },[plannedVenue]);
  const[bybitSymbol,setBybitSymbol]=useState('BTCUSDT');
  const[mexcSymbol,setMexcSymbol]=useState('BTC_USDT');
  const[timeframe,setTimeframe]=useState<StableTimeframe>('15m');
  const mexcTimeframe:MexcTimeframe=MEXC_TIMEFRAMES.some(tf=>tf===timeframe)?
    timeframe as MexcTimeframe:'15m';
  const[search,setSearch]=useState('');
  const[inputError,setInputError]=useState('');
  const[visibleCount,setVisibleCount]=useState(80);
  const[quickOpen,setQuickOpen]=useState(false);
  const quickRef=useRef<HTMLDivElement|null>(null);
  useEffect(()=>{
    if(!quickOpen)return;
    const onPointer=(event:PointerEvent)=>{
      if(quickRef.current&&!quickRef.current.contains(event.target as Node))
        setQuickOpen(false);
    };
    document.addEventListener('pointerdown',onPointer);
    return()=>document.removeEventListener('pointerdown',onPointer);
  },[quickOpen]);

  const catalog=useExchangeCatalog(exchange);
  const symbol=exchange==='BYBIT'?bybitSymbol:mexcSymbol;
  const contract=catalog.contracts.find(x=>x.symbol===symbol);
  const matches=useMemo(()=>searchContracts(catalog.contracts,search),
    [catalog.contracts,search]);
  const visible=matches.slice(0,visibleCount);
  const quickResults=matches.slice(0,12);
  const toggleCatalog=()=>setSettings(previous=>({...previous,coins:!previous.coins}));

  const changeExchange=(next:FuturesExchange)=>{
    if(exchange===next)return;
    setExchange(next);setSearch('');setInputError('');setVisibleCount(80);
    setQuickOpen(false);
  };
  const choose=(value:string)=>{
    if(!catalog.contracts.some(x=>x.symbol===value)){
      setInputError('Контракт отсутствует в загруженном каталоге '+exchange);
      return;
    }
    if(exchange==='BYBIT')setBybitSymbol(value);
    else setMexcSymbol(value);
    setSearch('');setInputError('');
    setVisibleCount(80);setQuickOpen(false);
  };
  const useSearchSymbol=()=>{
    if(!catalog.contracts.length){
      setInputError('Каталог не загружен. Проверь подключение и обнови список.');
      return;
    }
    const query=search.toUpperCase().replace(/[\s/_-]/g,'');
    if(!query){setInputError('Введи тикер, например BTC или ETHUSDT');return;}
    const withQuote=query.endsWith('USDT')?query:query+'USDT';
    const found=catalog.contracts.find(item=>
      item.symbol.replace(/_/g,'')===withQuote);
    if(!found){
      setInputError('USDT-фьючерс не найден на '+exchange+'. Проверь название.');
      return;
    }
    choose(found.symbol);
  };
  const openRadarPair=(next:string)=>{
    setExchange('BYBIT');setBybitSymbol(next);setTimeframe('5m');
    setSearch('');setQuickOpen(false);setPage('MARKET');
    window.scrollTo({top:0,behavior:'smooth'});
  };
  return <div className={'asc-lite-app'+(settings.coins?'':' asc-hide-coins')+
    (page==='MARKET'&&exchange==='BYBIT'&&focusMode?' asc-mode-focus':'')}>
    <header className="asc-lite-header">
      <div className="asc-lite-brand"><span className="asc-lite-logo">A</span>
        <div><strong>ASCEND</strong><small>MARKET · USDT FUTURES · TWO EXCHANGES</small></div>
      </div>
      <div className="asc-lite-header-right"><span>РЫНОК / MARKET</span>
        <b>BYBIT + MEXC</b></div>
    </header>
    <nav className="asc-app-pages" aria-label="Разделы ASCEND">
      <button type="button" className={page==='MARKET'?'active':''}
        aria-current={page==='MARKET'?'page':undefined}
        onClick={()=>setPage('MARKET')}>▣ РЫНОК</button>
      <button type="button" className={page==='RADAR'?'active':''}
        aria-current={page==='RADAR'?'page':undefined}
        onClick={()=>setPage('RADAR')}>◉ РАДАР <small>20 / 40 МОНЕТ</small></button>
      <div className="asc-focus-switch" role="group" aria-label="Режим интерфейса ASCEND">
        <button type="button" className={focusMode?'active':''}
          aria-pressed={focusMode} disabled={page!=='MARKET'||exchange!=='BYBIT'}
          onClick={()=>setFocusMode(true)}>◫ FOCUS · 1 ЭКРАН</button>
        <button type="button" className={!focusMode?'active':''}
          aria-pressed={!focusMode} disabled={page!=='MARKET'||exchange!=='BYBIT'}
          onClick={()=>setFocusMode(false)}>≡ DETAIL · АНАЛИТИКА</button>
      </div>
      <span>Только исследования · автоордера отключены</span>
    </nav>
    {page==='RADAR'?<RadarView onOpen={openRadarPair}/>:<>
    <nav className="asc-exchange-switch" aria-label="Выбор фьючерсной биржи">
      {(['BYBIT','MEXC'] as FuturesExchange[]).map(venue=>
        <button type="button" key={venue} className={exchange===venue?'active':''}
          aria-pressed={exchange===venue} onClick={()=>changeExchange(venue)}>
          {venue} <small>USDT FUTURES</small>
        </button>)}
      <span>Источники данных бирж разделены · только публичные рыночные данные</span>
    </nav>
    <div className="asc-planned-venue-picker" role="group" aria-label="Выбор биржи планируемой сделки">
      <label htmlFor="asc-planned-venue">БИРЖА СДЕЛКИ</label>
      <select id="asc-planned-venue" value={plannedVenue}
        onChange={event=>setPlannedVenue(event.target.value as PlannedVenue)}>
        {PLANNED_VENUES.map(venue=><option key={venue} value={venue}>{venue}</option>)}
      </select>
      <small>План · данные Bid/Ask без автоордеров · источник графика не меняется</small>
    </div>
    <div className="asc-quick-search" ref={quickRef} role="search"
      aria-label={'Поиск фьючерсов '+exchange}>
      <div className="asc-quick-search-title">
        <label htmlFor="asc-quick-input">ПОИСК ФЬЮЧЕРСОВ · {exchange}</label>
        <span>{catalog.status==='ready'?
          catalog.contracts.length.toLocaleString('ru-RU')+' контрактов из API':
          catalog.status==='error'?'ОШИБКА КАТАЛОГА':'ЗАГРУЗКА КАТАЛОГА'}</span>
      </div>
      <div className="asc-quick-search-controls">
        <div className="asc-quick-search-input-wrap">
          <span aria-hidden="true" className="asc-quick-search-glass">⌕</span>
          <input id="asc-quick-input" type="search" aria-controls="asc-quick-results"
            aria-expanded={quickOpen} aria-label="Найти USDT-фьючерс"
            autoComplete="off" spellCheck={false}
            placeholder="Введите монету: BTC, ETH, SOL, DOGE…"
            value={search} onFocus={()=>setQuickOpen(true)}
            onChange={event=>{
              setSearch(event.target.value);setInputError('');
              setVisibleCount(80);setQuickOpen(true);
            }}
            onKeyDown={event=>{
              if(event.key==='Escape')setQuickOpen(false);
              if(event.key==='Enter'){
                event.preventDefault();
                useSearchSymbol();
              }
              if(event.key==='ArrowDown'&&quickResults.length){
                event.preventDefault();
                document.getElementById('asc-quick-result-0')?.focus();
              }
            }}/>
          <button type="button" onClick={useSearchSymbol}
            className="asc-quick-search-submit">Найти ↗</button>
        </div>
        <button type="button" className={'asc-quick-catalog-button'+(settings.coins?' active':'')}
          onClick={toggleCatalog} aria-pressed={settings.coins}>
          {settings.coins?'Скрыть список монет':'Показать все монеты'}
        </button>
        <button type="button" className="asc-quick-refresh" onClick={()=>catalog.retry()}
          aria-label="Повторно загрузить каталог биржи" title="Обновить каталог">↻</button>
      </div>
      {(inputError||catalog.status==='error')&&<p className="asc-quick-search-error" role="status">
        {inputError||('Не удалось загрузить каталог '+exchange+': '+catalog.error)}
      </p>}
      {quickOpen&&catalog.contracts.length>0&&<div id="asc-quick-results"
        className="asc-quick-search-results" role="listbox"
        aria-label={'Доступные USDT-фьючерсы '+exchange}>
        <div className="asc-quick-results-head">
          {search.trim()?'Совпадения: '+matches.length.toLocaleString('ru-RU'):'Популярные контракты'}
          <small>Источник: {exchange} Futures API</small>
        </div>
        {quickResults.map((item,index)=>
          <button type="button" key={item.symbol} role="option"
            id={'asc-quick-result-'+index}
            aria-selected={symbol===item.symbol}
            onClick={()=>choose(item.symbol)}
            onKeyDown={event=>{
              if(event.key==='Escape'){event.preventDefault();setQuickOpen(false)}
              if(event.key==='ArrowDown'){
                event.preventDefault();
                document.getElementById('asc-quick-result-'+(index+1))?.focus();
              }
              if(event.key==='ArrowUp'){
                event.preventDefault();
                if(index===0)document.getElementById('asc-quick-input')?.focus();
                else document.getElementById('asc-quick-result-'+(index-1))?.focus();
              }
            }}>
            <strong>{item.base}<span>/USDT</span></strong>
            <small>{item.symbol} · {item.kind}</small>
            {symbol===item.symbol&&<em>●</em>}
          </button>
        )}
        {!quickResults.length&&<div className="asc-quick-empty">
          Нет совпадений. Проверь тикер или переключи биржу.
        </div>}
        {matches.length>quickResults.length&&<div className="asc-quick-more">
          Показаны первые {quickResults.length} из {matches.length}. Уточни поиск
          или нажми «Показать все монеты».
        </div>}
      </div>}
    </div>
    <div className="asc-lite-layout">
      <aside className="asc-lite-sidebar">
        <div className="asc-lite-side-heading"><strong>USDT ФЬЮЧЕРСЫ</strong>
          <small>{exchange} · {catalog.status==='ready'?'ЗАГРУЖЕНО':catalog.status==='loading'?'ЗАГРУЗКА':'ОШИБКА'}</small>
        </div>
        <div className="asc-exchange-count">
          <b>{catalog.contracts.length.toLocaleString('ru-RU')}</b>
          <span>контрактов из API {exchange}</span>
          <button type="button" onClick={catalog.retry} title="Обновить список биржи">↻</button>
        </div>
        <div className="asc-lite-search">
          <input aria-label={'Поиск USDT-фьючерса '+exchange} value={search}
            onChange={e=>{setSearch(e.target.value);setInputError('');setVisibleCount(80)}}
            onKeyDown={e=>{if(e.key==='Enter')useSearchSymbol()}}
            placeholder="BTC, ETH, SOL, XRP…"/>
          <button type="button" onClick={useSearchSymbol} title="Открыть найденный контракт">↗</button>
        </div>
        {inputError&&<p className="asc-lite-search-error">{inputError}</p>}
        {catalog.status==='error'&&<p className="asc-lite-search-error" role="alert">
          Ошибка API {exchange}: {catalog.error??'нет данных'}. Повтори загрузку.
        </p>}
        <div className="asc-exchange-results">
          Найдено {matches.length.toLocaleString('ru-RU')} · показано {visible.length}
        </div>
        <div className="asc-lite-coin-list">
          {visible.map(item=><button key={item.symbol} type="button"
            onClick={()=>choose(item.symbol)}
            className={'asc-lite-coin '+(symbol===item.symbol?'active':'')}>
            <span className="asc-lite-coin-icon">{item.base.slice(0,2)}</span>
            <span><b>{item.base}</b><small>{item.quote} · {exchange}</small></span>
            {symbol===item.symbol&&<em>●</em>}
          </button>)}
          {matches.length>visible.length&&<button type="button"
            className="asc-exchange-more" onClick={()=>setVisibleCount(v=>v+80)}>
            Показать ещё {Math.min(80,matches.length-visible.length)} ↘
          </button>}
          {!matches.length&&<p className="asc-lite-empty">
            {catalog.status==='loading'?'Загружаем полный список с биржи…':
              'Нет совпадений в текущем каталоге '+exchange+'.'}
          </p>}
        </div>
        <div className="asc-lite-side-note">
          Список загружается из API выбранной биржи и обновляется каждые 10 минут.
          Выбор пары не включает автоторговлю.
        </div>
      </aside>
      <section className="asc-lite-main">
        <div className="asc-lite-timeframe-bar">
          <div><strong>ТАЙМФРЕЙМ</strong><small>{exchange} / {symbol}</small></div>
          <div className="asc-lite-timeframes">
            {(exchange==='BYBIT'?STABLE_TIMEFRAMES:MEXC_TIMEFRAMES).map(tf=><button key={tf} type="button"
              className={tf===(exchange==='BYBIT'?timeframe:mexcTimeframe)?'active':''}
              onClick={()=>setTimeframe(tf)}>{tf}</button>)}
          </div>
        </div>
        {contract?
          (exchange==='BYBIT'?
            <BybitDataWorkspace symbol={symbol} timeframe={timeframe}
              settings={settings} onToggle={toggleIndicator}
              onUpdate={updateIndicators} onReset={resetIndicators}
              focusMode={focusMode}/>:
            <MexcWorkspace key={exchange+':'+symbol+':'+mexcTimeframe}
              contract={contract} timeframe={mexcTimeframe} settings={settings}
              onViewMode={chartViewMode=>updateIndicators({chartViewMode})}/>)
          :<div className="asc-exchange-wait" role="status">
            <strong>{catalog.status==='loading'?'Загружаем фьючерсы '+exchange+'…':
              catalog.status==='error'?'API '+exchange+' не отвечает':
              'Контракт '+symbol+' недоступен на '+exchange}</strong>
            <span>Выбери доступный USDT-фьючерс из каталога.
              Свечи другой биржи подставляться не будут.</span>
          </div>}
      </section>
    </div>
    </>}
  </div>;
}
