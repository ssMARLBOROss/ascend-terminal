import {useMemo,useState} from 'react';
import StableCandleChart from './components/StableCandleChart';
import {STABLE_TIMEFRAMES,useStableMarket,type StableTimeframe} from './market/useStableMarket';
import {usePreviousDayLevels,type PreviousDayLevels} from './market/usePreviousDayLevels';

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

function Workspace({symbol,timeframe,previousDay,previousDayStatus}:{
  symbol:string;timeframe:StableTimeframe;
  previousDay?:PreviousDayLevels;previousDayStatus:'loading'|'ready'|'error';
}){
  const{candles,status,error,lastPrice,lastUpdate}=useStableMarket(symbol,timeframe);
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
    <div className="asc-lite-chart-box">
      <StableCandleChart candles={candles} timeframe={timeframe} previousDay={previousDay}/>
      {candles.length<20&&<div className="asc-lite-loading" role="status">
        <strong>{error?'Не удалось получить историю':'Загружаем реальные свечи…'}</strong>
        <span>{error??'График появится после получения истории Bybit REST'}</span>
      </div>}
    </div>
    <footer className="asc-lite-chart-footer">
      <span>СВЕЧИ · ОБЪЁМ · СЕССИИ UTC · ASCEND STABLE</span>
      <span>{lastUpdate?'Последнее обновление: '+new Date(lastUpdate).toLocaleTimeString('ru-RU'):'Ожидание данных'}</span>
    </footer>
    {error&&candles.length>=20&&<p className="asc-lite-note" role="status">{error} · график продолжает показывать последние полученные свечи</p>}
  </main>;
}

export default function StableMarketApp(){
  const[symbol,setSymbol]=useState('BTCUSDT');
  const[timeframe,setTimeframe]=useState<StableTimeframe>('15m');
  const previousDay=usePreviousDayLevels(symbol);
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
          previousDay={previousDay.levels} previousDayStatus={previousDay.status}/>
      </section>
    </div>
  </div>;
}
