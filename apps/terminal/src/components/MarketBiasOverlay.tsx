import type {GlobalBiasSnapshot} from '../market/globalTrendPreview';
const arrow=(v:string)=>v==='BULLISH'?'↗':v==='BEARISH'?'↘':v==='CORRECTION'?'↘':v==='SHIFTING'?'⇄':'—';
const tone=(v:string)=>v==='BULLISH'||v==='ALIGNED'?'up':v==='BEARISH'||v==='CONFLICT'?'down':
 v==='SHIFTING'||v==='CORRECTION'?'warn':'neutral';
export default function MarketBiasOverlay({data,symbol}:{
 data:GlobalBiasSnapshot;symbol:string;
}){
 return <aside className="asc-global-bias" aria-label="Направление рынка и выбранной монеты">
  <div className="asc-global-bias-heading"><b>MARKET BIAS</b><small>PROXY · V1</small></div>
  <div className="asc-global-bias-row">
   <span>🌐 GLOBAL <small>30m / 1H</small></span>
   <b className={tone(data.market)}>{arrow(data.market)} {data.market}</b>
  </div>
  <div className="asc-global-bias-row">
   <span>🪙 {symbol.replace('_','/')} <small>15m / 30m</small></span>
   <b className={tone(data.coin)}>{arrow(data.coin)} {data.coin}</b>
  </div>
  <div className="asc-global-bias-row">
   <span>ALIGNMENT</span>
   <b className={tone(data.alignment)}>{data.alignment}</b>
  </div>
  <p>BYBIT FUTURES · НЕ ГЛОБАЛЬНЫЙ ИНДЕКС<br/>
    Покрытие {Math.round(data.coverage*100)}% · SPOT / BREADTH ещё не подключены</p>
 </aside>;
}
export function MarketStateStrip({data,symbol}:{
 data:GlobalBiasSnapshot;symbol:string;
}){
 return <div className="asc-global-state-strip" role="status">
  <strong>MARKET STATE</strong>
  <span className={tone(data.market)}>🌐 {data.market} <small>PROXY</small></span>
  <span className={tone(data.coin)}>🪙 {symbol.replace('_','/')} · {data.coin}</span>
  <b className={tone(data.alignment)}>{data.alignment}</b>
  <em>{data.description}</em>
 </div>;
}