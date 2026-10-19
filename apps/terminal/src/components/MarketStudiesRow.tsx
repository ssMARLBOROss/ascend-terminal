import type {Candle} from '@ascend/contracts';
import CloudflareMarketIndicators from './CloudflareMarketIndicators';
import type {ContinuousCvd} from '../market/useContinuousCvd';
import type {Metric,OpenInterest} from '../market/useLiveMarketMetrics';

function number(v:number|undefined,dp=2){
  return v===undefined||!Number.isFinite(v)?'—':
    v.toLocaleString('en-US',{maximumFractionDigits:dp});
}
function clock(at?:number){
  return at?new Date(at).toLocaleTimeString('ru-RU',{
    timeZone:'UTC',hour:'2-digit',minute:'2-digit'}):'—';
}
function Spark({values,color}:{values:number[];color:string}){
  const points=values.filter(Number.isFinite).slice(-48);
  if(points.length<2)return <div className="asc-study-no-data">Недостаточно точек</div>;
  const lo=Math.min(...points),hi=Math.max(...points),range=Math.max(hi-lo,Math.abs(hi)*.000001,1e-8);
  const path=points.map((v,i)=>{
    const x=2+i/(points.length-1)*216;
    const y=36-(v-lo)/range*32;
    return x.toFixed(1)+','+y.toFixed(1);
  }).join(' ');
  return <svg className="asc-study-spark" viewBox="0 0 220 40"
    preserveAspectRatio="none" role="img" aria-label="Последние доступные значения">
    <polyline fill="none" stroke={color} strokeWidth="2"
      vectorEffect="non-scaling-stroke" points={path}/>
  </svg>;
}

/** Three concise read-only studies below the price chart.
 * CVD covers only the current uninterrupted websocket segment;
 * OI does not encode long/short direction.
 */
export default function MarketStudiesRow({symbol,candles,timeframe,cvd,oi,
  showRsi,showSma,showCvd,showOi}:{
  symbol:string;candles:Candle[];timeframe:string;
  cvd:ContinuousCvd;oi:Metric<OpenInterest>;
  showRsi:boolean;showSma:boolean;showCvd:boolean;showOi:boolean;
}){
  if(!showRsi&&!showSma&&!showCvd&&!showOi)return null;
  const cvdReady=cvd.symbol===symbol&&cvd.status==='LIVE'&&
    cvd.data?.health==='LIVE'&&cvd.data.trades>0;
  const oiReady=oi.symbol===symbol&&oi.status==='ready'&&!!oi.data&&
    !!oi.updatedAt&&Date.now()-oi.updatedAt<10*60000;
  return <section className="asc-market-studies" aria-label="Индикаторы под графиком">
    <header><strong>РЫНОЧНЫЕ ИНДИКАТОРЫ</strong>
      <small>RSI / CVD / OI · вспомогательный контекст, не разрешение на сделку</small>
    </header>
    <div className="asc-market-studies-grid">
      {(showRsi||showSma)&&<CloudflareMarketIndicators candles={candles} timeframe={timeframe}
        showRsi={showRsi} showSma={showSma}/>}
      {showCvd&&<section className="asc-market-study-card" aria-label="CVD">
        <header><strong>CVD · сделки Bybit</strong><small>{cvdReady?'ПОТОК АКТИВЕН':'НЕТ ДАННЫХ'}</small></header>
        <b className={cvdReady&&cvd.data!.volumeDelta>=0?'positive':'negative'}>
          {cvdReady?number(cvd.data!.volumeDelta,3):'—'}</b>
        <span>Покупки − продажи · только непрерывный отрезок потока</span>
        <Spark values={cvdReady?cvd.data!.points.map(p=>p.cumulative):[]} color="#e6b971"/>
        <footer>{cvdReady?number(cvd.data!.trades,0)+' сделок · '+clock(cvd.data!.lastTradeAt)+' UTC':
          cvd.status==='GAP'?'Разрыв данных · требуется новый сегмент':
          'Ожидаем непрерывный поток сделок'}</footer>
      </section>}
      {showOi&&<section className="asc-market-study-card" aria-label="OI">
        <header><strong>ОТКРЫТЫЙ ИНТЕРЕС · Bybit</strong><small>{oiReady?'ДАННЫЕ':'НЕТ ДАННЫХ'}</small></header>
        <b>{oiReady?number(oi.data!.value,0):'—'}</b>
        <span>Изменение OI: {oiReady?number(oi.data!.deltaPercent)+'%':'—'}</span>
        <Spark values={oiReady?oi.data!.history:[]} color="#69bbdc"/>
        <footer>{oiReady?'Обновлено '+clock(oi.updatedAt)+' UTC · не направление сделки':
          'Нет актуальных данных OI'}</footer>
      </section>}
    </div>
  </section>;
}
