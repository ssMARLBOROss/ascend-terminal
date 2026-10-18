import type {Candle} from '@ascend/contracts';
import {closedMarketCandles,rsi14,rsiZone} from '../market/cloudflareIndicators';
import type {ContinuousCvd} from '../market/useContinuousCvd';
import type {Metric,OpenInterest} from '../market/useLiveMarketMetrics';
import {useCrossExchangeSpread} from '../market/useCrossExchangeSpread';

const fmt=(v?:number,digits=2)=>v===undefined||!Number.isFinite(v)?'—':
  v.toLocaleString('ru-RU',{maximumFractionDigits:digits});
function MiniLine({points}:{points:number[]}){
  const values=points.filter(Number.isFinite).slice(-24);
  if(values.length<2)return <span className="asc-focus-mini-empty">Нет истории</span>;
  const min=Math.min(...values),max=Math.max(...values),range=Math.max(max-min,1e-9);
  const line=values.map((v,i)=>
    (i/(values.length-1)*100).toFixed(1)+','+(26-(v-min)/range*22).toFixed(1)).join(' ');
  return <svg viewBox="0 0 100 28" preserveAspectRatio="none"
    className="asc-focus-mini-plot" aria-hidden="true">
    <polyline points={line} stroke="currentColor" fill="none" strokeWidth="1.8"
      vectorEffect="non-scaling-stroke"/>
  </svg>;
}
/** Always show all three compact studies in FOCUS; no fallback fake numbers. */
export default function FocusStudiesStrip({symbol,candles,timeframe,cvd,oi}:{
  symbol:string;candles:Candle[];timeframe:string;
  cvd:ContinuousCvd;oi:Metric<OpenInterest>;
}){
  const spread=useCrossExchangeSpread(symbol);
  const closed=closedMarketCandles(candles,timeframe);
  const rsiPoints=rsi14(closed),rsi=rsiPoints.at(-1)?.value;
  const cvdOK=cvd.symbol===symbol&&cvd.status==='LIVE'&&
    cvd.data?.health==='LIVE'&&cvd.data.trades>0&&
    !!cvd.updatedAt&&Date.now()-cvd.updatedAt<20000;
  const oiOK=oi.symbol===symbol&&oi.status==='ready'&&!!oi.data&&
    !!oi.updatedAt&&Date.now()-oi.updatedAt<600000;
  return <section className="asc-focus-studies" aria-label="Компактные RSI, CVD, Open Interest и межбиржевой спред">
    <div className="asc-focus-study" title="RSI14 на закрытых свечах выбранного таймфрейма">
      <div><strong>RSI 14 · {timeframe}</strong><b>{fmt(rsi,1)}</b>
        <small>{rsi===undefined?'NO DATA':rsiZone(rsi)}</small></div>
      <MiniLine points={rsiPoints.map(p=>p.value)}/>
    </div>
    <div className="asc-focus-study" title="CVD Bybit: только непрерывный отрезок WebSocket">
      <div><strong>CVD · Bybit</strong><b>{cvdOK?fmt(cvd.data!.volumeDelta):'—'}</b>
        <small>{cvdOK?'WS LIVE':cvd.status==='GAP'?'GAP':'NO DATA'}</small></div>
      <MiniLine points={cvdOK?cvd.data!.points.map(p=>p.cumulative):[]}/>
    </div>
    <div className="asc-focus-study" title="Open Interest Bybit: изменение не означает направление">
      <div><strong>OPEN INTEREST</strong><b>{oiOK?fmt(oi.data!.value,0):'—'}</b>
        <small>{oiOK?'Δ '+fmt(oi.data!.deltaPercent)+'%':'NO DATA'}</small></div>
      <MiniLine points={oiOK?oi.data!.history:[]}/>
    </div>
    <div className={'asc-focus-study asc-focus-spread '+
      (spread.status==='READY'&&spread.grossPct!==undefined&&spread.grossPct>0?
        'asc-focus-spread-positive':'')}
      title={spread.status==='READY'
        ?'Buy '+spread.buyVenue+' Ask: '+fmt(spread.buyAsk,7)+
          ' → Sell '+spread.sellVenue+' Bid: '+fmt(spread.sellBid,7)+
          ' | Внутренний спред Bybit: '+fmt(spread.bybitInsidePct,4)+
          '%; MEXC: '+fmt(spread.mexcInsidePct,4)+
          '%. БЕЗ комиссий, глубины стакана, проскальзывания и funding.'
        :spread.reason}>
      <div>
        <strong>СПРЕД · 2 БИРЖИ</strong>
        <b>{spread.status==='READY'&&spread.grossPct!==undefined
          ?(spread.grossPct>0?'+':'')+fmt(spread.grossPct,4)+'%':'—'}</b>
        <small>{spread.status==='READY'
          ?spread.grossPct!==undefined&&spread.grossPct>0?
            spread.buyVenue+' → '+spread.sellVenue:
            'Нет положит. разницы'
          :'NO DATA'}</small>
      </div>
      <span className="asc-spread-caption">Bid/Ask · брутто</span>
    </div>
  </section>;
}
