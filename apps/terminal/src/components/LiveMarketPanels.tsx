import type {OpenInterest,LongShort,TradeDelta,TpoProfile,Metric} from '../market/useLiveMarketMetrics';
import type {ContinuousCvd} from '../market/useContinuousCvd';

function money(n:number){
  const max=n>=1000?2:n>=1?4:8;
  return n.toLocaleString('en-US',{maximumFractionDigits:max});
}
function pct(n:number){return (n>0?'+':'')+n.toFixed(2)+'%'}
function timestamp(t?:number){
  if(!t)return '—';
  return new Date(t).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
}
function Status<T>({metric}:{metric:Metric<T>}){
  return <small className={'asc-live-status '+metric.status}>
    {metric.status==='ready'?'● ONLINE · '+timestamp(metric.updatedAt):
      metric.status==='loading'?'○ ПОДКЛЮЧЕНИЕ':'! ДАННЫЕ НЕДОСТУПНЫ'}
  </small>;
}
function Sparkline({values,color,zero}:{
  values:number[];color:string;zero?:boolean;
}){
  if(values.length<2)return <span className="asc-live-no-plot">Нет истории</span>;
  const min=Math.min(...values,...(zero?[0]:[]));
  const max=Math.max(...values,...(zero?[0]:[]));
  const span=Math.max((max-min)*1.20,1e-8);
  const center=(max+min)/2;
  const floor=center-span/2,ceil=center+span/2;
  const y=(v:number)=>40-(v-floor)/(ceil-floor)*34;
  const points=values.map((v,i)=>
    (6+i/(values.length-1)*188).toFixed(1)+','+y(v).toFixed(1)).join(' ');
  return <svg className="asc-live-sparkline" viewBox="0 0 200 48" preserveAspectRatio="none"
    aria-hidden="true">
    {zero&&<line x1="6" y1={y(0)} x2="194" y2={y(0)}
      stroke="#587182" strokeWidth="1" strokeDasharray="4 4"/>}
    <polyline fill="none" stroke={color} strokeWidth="2.1" strokeLinejoin="round"
      strokeLinecap="round" points={points}/>
  </svg>;
}
function Unavailable<T>({metric}:{metric:Metric<T>}){
  return <div className="asc-live-unavailable">
    {metric.status==='error'?'Нет подтверждённых данных Bybit — повтор автоматически':
      'Получаем данные Bybit…'}
  </div>;
}

export default function LiveMarketPanels({symbol,tpo,oi,longShort,cvd,visibility,continuousCvd}:{
  symbol:string;tpo:Metric<TpoProfile>;oi:Metric<OpenInterest>;
  longShort:Metric<LongShort>;cvd:Metric<TradeDelta>;
  visibility:{tpo:boolean;oi:boolean;longShort:boolean;cvd:boolean};
  continuousCvd:ContinuousCvd;
}){
  if(!visibility.tpo&&!visibility.oi&&!visibility.longShort&&!visibility.cvd)return null;
  return <section className="asc-live-metrics" aria-label="Онлайн-индикаторы TPO OI Long Short CVD">
    <div className="asc-live-metrics-head">
      <div><b>РЫНОК · ОНЛАЙН-ИНДИКАТОРЫ</b>
        <small>{symbol} · BYBIT USDT PERPETUAL · ИССЛЕДОВАНИЕ БЕЗ ВХОДОВ</small>
      </div>
      <span className="asc-live-context-only">БЕЗ ПРИВЯЗКИ К СЕССИЯМ</span>
    </div>
    <div className="asc-live-metrics-grid">
      {visibility.tpo&&<article className="asc-live-metric-card tpo">
        <header><strong>TPO · MARKET PROFILE</strong><Status metric={tpo}/></header>
        {tpo.status==='ready'&&tpo.data?<div className="asc-live-body">
          <div className="asc-live-main"><span>POC</span><b>{money(tpo.data.poc)}</b></div>
          <div className="asc-live-values">
            <span>VAH <b>{money(tpo.data.vah)}</b></span>
            <span>VAL <b>{money(tpo.data.val)}</b></span>
          </div>
          <div className="asc-live-area-bar">
            <span>VAL</span><div/><span>POC</span><div/><span>VAH</span>
          </div>
          <small>48 закрытых 30m свечей · скользящие 24ч</small>
        </div>:<Unavailable metric={tpo}/>}
        <footer>Приближённый профиль по касаниям ценовых корзин; не объём торгов.</footer>
      </article>}
      {visibility.oi&&<article className="asc-live-metric-card oi">
        <header><strong>OPEN INTEREST · OI</strong><Status metric={oi}/></header>
        {oi.status==='ready'&&oi.data?<div className="asc-live-body">
          <div className="asc-live-main"><span>Открытые позиции, {symbol.replace(/USDT$/,'')}</span>
            <b>{money(oi.data.value)}</b>
          </div>
          <div className="asc-live-values">
            <span>Δ последнего 5m интервала</span>
            <b className={oi.data.deltaPercent>=0?'asc-live-up':'asc-live-down'}>
              {pct(oi.data.deltaPercent)}</b>
          </div>
          <Sparkline values={oi.data.history} color="#55bfdc"/>
          <small>Последние точки OI Bybit · {timestamp(oi.data.timestamp)}</small>
        </div>:<Unavailable metric={oi}/>}
        <footer>Рост OI не означает автоматически LONG; направление определяет цена.</footer>
      </article>}
      {visibility.longShort&&<article className="asc-live-metric-card ls">
        <header><strong>NET LONG / SHORT · ACCOUNTS</strong><Status metric={longShort}/></header>
        {longShort.status==='ready'&&longShort.data?<div className="asc-live-body">
          <div className="asc-live-ls-split">
            <div><span>LONG</span><b>{longShort.data.longPercent.toFixed(1)}%</b></div>
            <div><span>SHORT</span><b>{longShort.data.shortPercent.toFixed(1)}%</b></div>
          </div>
          <div className="asc-live-ls-bar">
            <div style={{width:longShort.data.longPercent+'%'}}/>
          </div>
          <div className="asc-live-values">
            <span>Δ доли LONG</span>
            <b className={longShort.data.deltaLongPp>=0?'asc-live-up':'asc-live-down'}>
              {(longShort.data.deltaLongPp>0?'+':'')+longShort.data.deltaLongPp.toFixed(2)+' п.п.'}
            </b>
          </div>
          <Sparkline values={longShort.data.history} color="#ad99ed"/>
          <small>Доля аккаунтов за 5m · {timestamp(longShort.data.timestamp)}</small>
        </div>:<Unavailable metric={longShort}/>}
        <footer>Это количество long/short-аккаунтов, а не чистый объём позиций.</footer>
      </article>}
      {visibility.cvd&&<article className="asc-live-metric-card cvd">
        <header><strong>CVD · BYBIT PUBLIC TRADES</strong>
          <small className={'asc-live-status '+(continuousCvd.status==='LIVE'?'ready':'error')}>
            {continuousCvd.status==='LIVE'?'● LIVE · CONNECTED SEGMENT':
              continuousCvd.status==='CONNECTING'?'○ CONNECTING':'! '+continuousCvd.status}
          </small>
        </header>
        {continuousCvd.data?.trades?<div className="asc-live-body">
          <div className="asc-live-main"><span>Накопительная Delta · {symbol.replace(/USDT$/,'')}</span>
            <b className={continuousCvd.data.volumeDelta>=0?'asc-live-up':'asc-live-down'}>
              {(continuousCvd.data.volumeDelta>0?'+':'')+money(continuousCvd.data.volumeDelta)}</b>
          </div>
          <div className="asc-live-values"><span>BUY {money(continuousCvd.data.buyVolume)}</span>
            <span>SELL {money(continuousCvd.data.sellVolume)}</span></div>
          <Sparkline values={continuousCvd.data.points.map(p=>p.cumulative)} color="#e8b76e" zero/>
          <small>{continuousCvd.data.trades.toLocaleString('ru-RU')} сделок ·
            {timestamp(continuousCvd.data.startedAt)}–{timestamp(continuousCvd.data.lastTradeAt)}</small>
        </div>:<div className="asc-live-unavailable">Ожидаем публичные сделки по WebSocket</div>}
        <footer>Только полученные сделки текущего сегмента; при обрыве история не сшивается.</footer>
      </article>}
    </div>
  </section>;
}
