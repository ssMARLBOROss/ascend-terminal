import {useMemo} from 'react';
import type {Candle} from '@ascend/contracts';
import {closedMarketCandles,rsi14,rsiZone,smaAt,volumeRatio} from '../market/cloudflareIndicators';

type Props={candles:Candle[];timeframe:string;showRsi:boolean;showSma:boolean};
function fmt(value:number|undefined){
  if(value===undefined||!Number.isFinite(value))return '—';
  const digits=value>=1000?2:value>=1?4:value>=.01?6:9;
  return value.toLocaleString('en-US',{maximumFractionDigits:digits});
}
function percent(price:number,level:number|undefined){
  return level&&level>0?((price/level-1)*100).toFixed(2)+'%':'—';
}

/** Chart companion copied from the Cloudflare market's RSI/SMA display concepts.
 * It only interprets the selected exchange's already loaded CLOSED candles.
 * Context only: no order creation, CORE gates, or simulated fills.
 */
export default function CloudflareMarketIndicators({candles,timeframe,showRsi,showSma}:Props){
  const closed=useMemo(()=>closedMarketCandles(candles,timeframe),[candles,timeframe]);
  const rsi=useMemo(()=>rsi14(closed),[closed]);
  if(!showRsi&&!showSma)return null;
  const last=closed.at(-1);
  const recent=rsi.slice(-90);
  const latest=recent.at(-1)?.value;
  const zone=rsiZone(latest);
  const path=recent.map((v,i)=>{
    const x=6+i/(Math.max(1,recent.length-1))*988;
    const y=7+(100-v.value)*1.26;
    return (i?'L':'M')+x.toFixed(1)+' '+y.toFixed(1);
  }).join(' ');
  const guide=(val:number)=>7+(100-val)*1.26;
  const sma=([20,50,200] as const).map(n=>({length:n,value:smaAt(closed,n)}));
  const vol=volumeRatio(closed);
  return <section className="asc-cloudflare-indicators" aria-label="ASCEND RSI и скользящие средние">
    <header className="asc-cloudflare-indicators-head">
      <strong>ASCEND · RSI / SMA</strong>
      <span>{timeframe} · закрытые свечи · исследовательский контекст</span>
    </header>
    {showRsi&&<div className="asc-cloudflare-rsi">
      <div className="asc-cloudflare-rsi-head">
        <b>RSI(14) · {latest===undefined?'—':latest.toFixed(1)}</b>
        <span className={zone==='RC30'?'lower':zone==='RC70'?'upper':'neutral'}>
          {zone==='RC30'?'RC30 · нижняя зона':zone==='RC70'?'RC70 · верхняя зона':'30–70 · рабочая зона'}
        </span>
        <small>37 / 63 — исследовательские пороги восстановления</small>
      </div>
      <svg viewBox="0 0 1000 140" preserveAspectRatio="none" role="img" aria-label="RSI 14, зоны 30, 50, 70">
        <rect x="0" y={guide(100)} width="1000" height={guide(70)-guide(100)} fill="#d36c73" fillOpacity=".065"/>
        <rect x="0" y={guide(30)} width="1000" height={guide(0)-guide(30)} fill="#39be98" fillOpacity=".065"/>
        {[30,50,70].map(v=><g key={v}>
          <line x1="0" x2="1000" y1={guide(v)} y2={guide(v)} stroke={v===50?'#92a8b7':'#648398'} strokeDasharray="5 7" strokeOpacity=".6"/>
          <text x="8" y={guide(v)-3} fill="#9bb4c5" fontSize="15">{v}</text>
        </g>)}
        {path&&<path d={path} fill="none" stroke="#e2be69" strokeWidth="3" vectorEffect="non-scaling-stroke"/>}
        {latest!==undefined&&<circle cx="994" cy={guide(latest)} r="4" fill="#efdb90"/>}
      </svg>
    </div>}
    {showSma&&<div className="asc-cloudflare-sma">
      {sma.map(({length,value})=><div key={length}>
        <small>SMA {length}</small>
        <b>{fmt(value)}</b>
        <span>{last&&value?percent(last.close,value):'Нет полной истории'}</span>
      </div>)}
      <div><small>VOLUME / SMA20</small><b>{vol===undefined?'—':vol.toFixed(2)+'×'}</b>
        <span>Объём закрытой свечи</span></div>
    </div>}
    <footer>RSI и SMA отображают контекст выбранной биржи. Не являются сигналом ENTRY READY.</footer>
  </section>;
}
