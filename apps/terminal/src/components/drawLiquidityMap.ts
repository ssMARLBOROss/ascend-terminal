import type {IChartApi,ISeriesApi} from 'lightweight-charts';
import type {LiquidityMap,LiquidityLevel} from '../market/liquidityMapEngine';

const fmt=(x:number)=>x>=1000?x.toFixed(2):x>=1?x.toFixed(4):x.toPrecision(5);

/**
 * Price-only overlay. Drawn on its own canvas; never adjusts auto scale,
 * creates future candles, changes structure decisions, or routes any orders.
 */
export function drawLiquidityMap(
  chart:IChartApi,price:ISeriesApi<'Candlestick'>,
  host:HTMLElement,canvas:HTMLCanvasElement,map?:LiquidityMap
){
  const width=host.clientWidth,height=host.clientHeight;
  if(width<1||height<1)return;
  const ratio=Math.min(2,Math.max(1,window.devicePixelRatio||1));
  const pw=Math.round(width*ratio),ph=Math.round(height*ratio);
  if(canvas.width!==pw||canvas.height!==ph){canvas.width=pw;canvas.height=ph}
  const ctx=canvas.getContext('2d');
  if(!ctx)return;
  ctx.setTransform(ratio,0,0,ratio,0,0);
  ctx.clearRect(0,0,width,height);
  if(!map)return;
  const plotWidth=Math.min(width,chart.timeScale().width());
  const top=10,bottom=height-27;
  if(plotWidth<115||bottom<top)return;
  const picked=[map.upper,map.lower].filter((x):x is LiquidityLevel=>Boolean(x));
  const drawn=new Set<string>();
  ctx.save();
  ctx.beginPath();ctx.rect(0,top,plotWidth,bottom-top);ctx.clip();
  const left=Math.max(12,Math.round(plotWidth*.27));
  for(const item of picked){
    if(drawn.has(item.key))continue;
    drawn.add(item.key);
    const isUpper=item.side==='BSL';
    const low=price.priceToCoordinate(item.zoneLow),high=price.priceToCoordinate(item.zoneHigh);
    const mid=price.priceToCoordinate(item.price);
    if(low===null||high===null||mid===null||!Number.isFinite(mid))continue;
    if(mid<top-15||mid>bottom+15)continue;
    const y=Math.min(low,high),h=Math.max(3,Math.abs(high-low));
    const fill=isUpper?'rgba(231,89,100,.105)':'rgba(54,209,153,.095)';
    const stroke=isUpper?'rgba(255,123,137,.76)':'rgba(91,231,176,.76)';
    ctx.fillStyle=fill;ctx.fillRect(left,y,plotWidth-left,h);
    ctx.strokeStyle=stroke;ctx.lineWidth=1.5;
    ctx.setLineDash(item.frozen?[5,4]:[2,7]);
    ctx.beginPath();ctx.moveTo(left,mid);ctx.lineTo(plotWidth,mid);ctx.stroke();
    ctx.setLineDash([]);
    const tag=(isUpper?'BSL ':'SSL ')+item.key+' '+item.state+
      ' '+(item.distancePct>0?'+':'')+item.distancePct.toFixed(2)+'%';
    ctx.font='800 11px Inter,system-ui,sans-serif';
    const tw=Math.min(plotWidth-left-10,ctx.measureText(tag).width+14);
    if(tw<45)continue;
    const bx=Math.max(left+4,plotWidth-tw-5);
    const by=Math.max(top+3,Math.min(bottom-22,mid-25));
    ctx.fillStyle='rgba(5,20,30,.89)';ctx.fillRect(bx,by,tw,20);
    ctx.fillStyle=isUpper?'#ffa2ad':'#8df5ca';
    ctx.fillText(tag,bx+7,by+14,tw-12);
    if(item.deepestAt!==undefined&&item.deepestDepthPct!==undefined&&item.deepestDepthPct>0){
      const clock=new Date(item.deepestAt).toISOString().slice(11,16)+' UTC';
      const caption='SWEEP EXTREME '+fmt(item.deepestPrice??item.price)+
        ' · '+item.deepestDepthPct.toFixed(2)+'% · '+clock;
      const cw=Math.min(plotWidth-left-9,ctx.measureText(caption).width+13);
      if(cw>40){
        ctx.fillStyle='rgba(5,20,30,.83)';
        ctx.fillRect(Math.max(left+4,plotWidth-cw-5),by+22,cw,17);
        ctx.fillStyle=stroke;ctx.font='700 10px Inter,system-ui,sans-serif';
        ctx.fillText(caption,Math.max(left+4,plotWidth-cw-5)+6,by+34,cw-10);
      }
    }
  }
  ctx.restore();
}
