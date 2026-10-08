import {useMemo,useState} from 'react';
import StableCandleChart from './components/StableCandleChart';
import {STABLE_TIMEFRAMES,useStableMarket,type StableTimeframe} from './market/useStableMarket';
import {usePreviousDayLevels,type PreviousDayLevels} from './market/usePreviousDayLevels';
import {usePreviousSessionLevels,type PreviousSessionLevels} from './market/usePreviousSessionLevels';
import {useDailyVwap,type DailyVwap} from './market/useDailyVwap';
import {useOrderbookClusters} from './market/useOrderbookClusters';
import WeekOverlayCompare from './components/WeekOverlayCompare';
import LiveMarketPanels from './components/LiveMarketPanels';
import {useLiveMarketMetrics} from './market/useLiveMarketMetrics';

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

function Workspace({symbol,timeframe,previousDay,previousDayStatus,previousSessions,previousSessionsStatus,dailyVwap,vwapStatus,liveMetrics}:{
  symbol:string;timeframe:StableTimeframe;
  previousDay?:PreviousDayLevels;previousDayStatus:'loading'|'ready'|'error';
  previousSessions?:PreviousSessionLevels;previousSessionsStatus:'loading'|'ready'|'error';
  dailyVwap?:DailyVwap;vwapStatus:'loading'|'ready'|'error';
  liveMetrics:ReturnType<typeof useLiveMarketMetrics>;
}){
  const{candles,status,error,lastPrice,lastUpdate}=useStableMarket(symbol,timeframe);
  const[showBook,setShowBook]=useState(true);
  const[showStops,setShowStops]=useState(true);
  const[showTpo,setShowTpo]=useState(true);
  const[showWeekCompare,setShowWeekCompare]=useState(false);
  const liquidity=useOrderbookClusters(symbol,showBook);
  const latest=candles[candles.length-1];
  const displayPrice=lastPrice??latest?.close;

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
    <div className="asc-lite-stats">
      <div><small>ПОСЛЕДНЯЯ ЦЕНА</small><strong>{fmtPrice(displayPrice)}</strong></div>
      <div><small>O / ОТКРЫТИЕ СВЕЧИ</small><b>{fmtPrice(latest?.open)}</b></div>
      <div><small>H / МАКСИМУМ СВЕЧИ</small><b>{fmtPrice(latest?.high)}</b></div>
      <div><small>L / МИНИМУМ СВЕЧИ</small><b>{fmtPrice(latest?.low)}</b></div>
      <div><small>ОБЪЁМ СВЕЧИ</small><b>{fmtVolume(latest?.volume)}</b></div>
    </div>
    <div className="asc-liquidity-controls" aria-label="Отображение кластеров ликвидности">
      <div className="asc-liquidity-buttons">
        <button type="button" aria-pressed={showBook} className={showBook?'active':''}
          onClick={()=>setShowBook(value=>!value)}>BID / ASK · РЕАЛЬНЫЙ СТАКАН</button>
        <button type="button" aria-pressed={showStops} className={showStops?'active stops':''}
          onClick={()=>setShowStops(value=>!value)}>STOP? · РАСЧЁТНЫЕ ЗОНЫ</button>
        <button type="button" aria-pressed={showTpo} className={showTpo?'active tpo':''}
          onClick={()=>setShowTpo(value=>!value)}>TPO · POC / VAH / VAL</button>
      </div>
      <div className="asc-liquidity-source">
        {showBook?(liquidity.status==='ready'&&liquidity.snapshot?
          'BYBIT · СРЕЗ '+new Date(liquidity.snapshot.receivedAt).toLocaleTimeString('ru-RU')+
          ' · '+liquidity.snapshot.levelsPerSide+' ур./сторону':
          liquidity.status==='error'?'Bybit: нет стакана · повтор через 20 сек':'Загрузка стакана Bybit…'):
          'Стакан отключён'}
      </div>
    </div>
    <div className="asc-lite-chart-box">
      <StableCandleChart candles={candles} timeframe={timeframe} previousDay={previousDay}
        previousSessions={previousSessions} dailyVwap={dailyVwap}
        orderbook={liquidity.status==='ready'?liquidity.snapshot:undefined}
        showBook={showBook} showStops={showStops}
        tpo={liveMetrics.tpo.status==='ready'?liveMetrics.tpo.data:undefined} showTpo={showTpo}/>
      {candles.length<20&&<div className="asc-lite-loading" role="status">
        <strong>{error?'Не удалось получить историю':'Загружаем реальные свечи…'}</strong>
        <span>{error??'График появится после получения истории Bybit REST'}</span>
      </div>}
    </div>
    <div className="asc-week-toggle">
      <div><strong>НАЛОЖЕНИЕ 7 ДНЕЙ × 7 ДНЕЙ</strong>
        <small>Две полные недели UTC, одинаковые часы и масштаб в процентах</small>
      </div>
      <button type="button" aria-expanded={showWeekCompare}
        onClick={()=>setShowWeekCompare(value=>!value)}>
        {showWeekCompare?'СКРЫТЬ СРАВНЕНИЕ −':'ПОКАЗАТЬ СРАВНЕНИЕ +'}
      </button>
    </div>
    {showWeekCompare&&<WeekOverlayCompare symbol={symbol}/>}
    <LiveMarketPanels symbol={symbol} {...liveMetrics}/>
    <div className="asc-prev-session-strip" aria-label="Максимумы и минимумы вчерашних сессий">
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
    </div>
    <div className="asc-liquidity-explain">
      <span><b>BID / ASK</b> — крупнейшие видимые скопления лимитных заявок в текущем снимке стакана (до 200 уровней на сторону). Заявки могут быть отменены.</span>
      <span><b>STOP?</b> — оценочные зоны рядом с YH/YL и экстремумами вчерашних сессий. Это не подтверждённые стоп-ордера и не данные ликвидаций.</span>
    </div>
    <footer className="asc-lite-chart-footer">
      <span>СВЕЧИ · ОБЪЁМ · VWAP UTC · СЕССИИ · ASCEND STABLE</span>
      <span>{lastUpdate?'Последнее обновление: '+new Date(lastUpdate).toLocaleTimeString('ru-RU'):'Ожидание данных'}</span>
    </footer>
    {error&&candles.length>=20&&<p className="asc-lite-note" role="status">{error} · график продолжает показывать последние полученные свечи</p>}
  </main>;
}

export default function StableMarketApp(){
  const[symbol,setSymbol]=useState('BTCUSDT');
  const[timeframe,setTimeframe]=useState<StableTimeframe>('15m');
  const previousDay=usePreviousDayLevels(symbol);
  const previousSessions=usePreviousSessionLevels(symbol);
  const vwap=useDailyVwap(symbol);
  const liveMetrics=useLiveMarketMetrics(symbol);
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

  return <div className="asc-lite-app">
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
          dailyVwap={vwap.daily} vwapStatus={vwap.status} liveMetrics={liveMetrics}/>
      </section>
    </div>
  </div>;
}
