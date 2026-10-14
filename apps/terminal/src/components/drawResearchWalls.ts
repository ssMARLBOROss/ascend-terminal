import type {IChartApi,ISeriesApi} from 'lightweight-charts';
import type {MarketLiquidity} from '../market/liquidityDecisionResearch';

/** Low-opacity overlay, only nearest genuinely frozen BSL/SSL walls.
 * The source price axis and indicator calculations remain unchanged.
 */
export function drawResearchWalls(chart:IChartApi,
  price:ISeriesApi<'Candlestick'>,host:HTMLElement,canvas:HTMLCanvasElement,
  data?:MarketLiquidity){
  const width=host.clientWidth,height=host.clientHeight;
  if(width<=0||height<=0)return;
  const ratio=Math.min(2,Math.max(1,window.devicePixelRatio||1));
  const pw=Math.round(width*ratio),ph=Math.round(height*ratio);
  if(canvas.width!==pw)canvas.width=pw;
  if(canvas.height!==ph)canvas.height=ph;
  const ctx=canvas.getContext('2d');if(!ctx)return;
  ctx.setTransform(ratio,0,0,ratio,0,0);
  ctx.clearRect(0,0,width,height);
  if(!data)return;
  const right=Math.max(0,Math.min(chart.timeScale().width()-64,width-65));
  const paint=(item:MarketLiquidity['bsl'],color:string)=>{
    if(!item||right<80)return;
    const hi=price.priceToCoordinate(item.high);
    const lo=price.priceToCoordinate(item.low);
    if(hi===null||lo===null)return;
    const top=Math.max(0,Math.min(hi,lo));
    const band=Math.max(2,Math.abs(hi-lo));
    ctx.fillStyle=color;
    ctx.fillRect(0,top,right,band);
    ctx.lineWidth=1;
    ctx.strokeStyle=color.replace('.11)', '.40)');
    ctx.setLineDash([5,6]);
    ctx.beginPath();ctx.moveTo(0,top);ctx.lineTo(right,top);ctx.stroke();
    ctx.setLineDash([]);
    const label=item.id+' · '+item.anchor.id+' · '+item.distancePct.toFixed(2)+'%';
    ctx.font='800 10px Inter,system-ui,sans-serif';
    const w=Math.min(165,ctx.measureText(label).width+12);
    const y=Math.max(22,Math.min(height-42,top-17));
    ctx.fillStyle='rgba(6,18,28,.88)';
    ctx.fillRect(Math.max(0,right-w),y,w,15);
    ctx.fillStyle=item.id==='BSL'?'#e99398':'#78d3b4';
    ctx.fillText(label,Math.max(0,right-w)+6,y+11);
  };
  paint(data.bsl,'rgba(223,103,126,.11)');
  paint(data.ssl,'rgba(64,190,147,.11)');
}
