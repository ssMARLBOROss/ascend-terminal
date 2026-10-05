import type { Candle } from '@ascend/contracts';
import type { DisplayLevel } from '../market/engine';

const fmt=(v:number)=>v>=1000?v.toLocaleString('en-US',{maximumFractionDigits:2}):v.toLocaleString('en-US',{maximumFractionDigits:6});

export default function LiveCandleChart({
  candles,levels,lastPrice,status,source,latencyMs
}:{candles:Candle[];levels:DisplayLevel[];lastPrice?:number;status:string;source:string;latencyMs?:number}){
  const data=candles.slice(-110);
  if(!data.length)return <div className="live-candle-root loading"><b>ЗАГРУЖАЕМ РЕАЛЬНЫЕ СВЕЧИ · LOADING LIVE CANDLES</b><small>{source} PUBLIC MARKET DATA</small></div>;

  const high=Math.max(...data.map(c=>c.high),...levels.map(l=>l.price));
  const low=Math.min(...data.map(c=>c.low),...levels.map(l=>l.price));
  const span=Math.max(high-low,high*0.001);
  const width=1000,height=430,chartTop=22,chartBottom=350,volTop=365,volBottom=420;
  const xStep=width/data.length;
  const y=(p:number)=>chartTop+(high-p)/span*(chartBottom-chartTop);
  const maxVol=Math.max(...data.map(c=>c.volume),1);

  return <div className="live-candle-root">
    <div className="live-chart-status">
      <span className={status==='LIVE'?'ok':'wait'}>● {status}</span>
      <b>{source} PUBLIC</b>
      <small>{lastPrice!==undefined?fmt(lastPrice):'—'} {latencyMs!==undefined?'· '+latencyMs+' ms':''}</small>
    </div>
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="live-candle-svg">
      <defs>
        <linearGradient id="volFade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity=".5"/>
          <stop offset="100%" stopColor="currentColor" stopOpacity=".08"/>
        </linearGradient>
      </defs>

      {[0,.25,.5,.75,1].map((r,i)=>{
        const py=chartTop+r*(chartBottom-chartTop);
        const price=high-r*span;
        return <g key={i}><line x1="0" x2={width} y1={py} y2={py} className="live-grid"/><text x={width-8} y={py-4} textAnchor="end" className="live-axis">{fmt(price)}</text></g>
      })}

      {levels.map(level=>{
        const py=y(level.price);
        if(py<chartTop||py>chartBottom)return null;
        return <g key={level.id} className={'live-level '+level.status.toLowerCase()}>
          <line x1="0" x2={width} y1={py} y2={py}/>
          <rect x="5" y={py-14} width={Math.max(70,level.label.length*7+42)} height="18" rx="4"/>
          <text x="11" y={py-2}>{level.label} · {fmt(level.price)}</text>
        </g>
      })}

      {data.map((c,i)=>{
        const x=i*xStep+xStep/2;
        const up=c.close>=c.open;
        const yo=y(c.open),yc=y(c.close),yh=y(c.high),yl=y(c.low);
        const bodyTop=Math.min(yo,yc),bodyH=Math.max(1.5,Math.abs(yc-yo));
        const barW=Math.max(2,Math.min(7,xStep*.62));
        const volH=(c.volume/maxVol)*(volBottom-volTop);
        return <g key={c.timestamp} className={up?'candle up':'candle down'}>
          <line x1={x} x2={x} y1={yh} y2={yl} className="wick"/>
          <rect x={x-barW/2} y={bodyTop} width={barW} height={bodyH} rx=".7" className="body"/>
          <rect x={x-barW/2} y={volBottom-volH} width={barW} height={volH} className="volume"/>
        </g>
      })}

      {lastPrice!==undefined&&(()=>{
        const py=y(lastPrice);
        if(py<chartTop||py>chartBottom)return null;
        return <g className="last-price"><line x1="0" x2={width} y1={py} y2={py}/><rect x={width-82} y={py-10} width="78" height="20" rx="4"/><text x={width-43} y={py+4} textAnchor="middle">{fmt(lastPrice)}</text></g>
      })()}
    </svg>
    <div className="live-chart-foot">
      <span>{new Date(data[0].timestamp).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</span>
      <span>REAL CANDLES · PUBLIC FEED · NO API KEY</span>
      <span>{new Date(data[data.length-1].timestamp).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</span>
    </div>
  </div>
}
