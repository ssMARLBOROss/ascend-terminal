import type {IChartApi,ISeriesApi} from 'lightweight-charts';
import type {LiquidityMap,LiquidityLevel} from '../market/liquidityMapEngine';

const fmt=(x:number)=>x>=1000?x.toFixed(2):x>=1?x.toFixed(4):x.toPrecision(5);

/**
 * Draw all known levels as subtle lines and the nearest BSL/SSL as ATR bands.
 * This is a price-coordinate canvas only: no extra chart candles, scale edits,
 * look-ahead, stop-order claims, or trading signal side effects.
 */
export function drawLiquidityMap(
  chart:IChartApi,price:ISeriesApi<'Candlestick'>,
  host:HTMLElement,canvas:HTMLCanvasElement,map?:LiquidityMap
){
  const width=host.clientWidth,height=host.clientHeight;
  if(width<1||height<1)return;
  const ratio=Math.min(2,Math.max(1,window.devicePixelRatio||1));
  const pw=Math.round(width*ratio),ph=Math.round(height*ratio);
  if(canvas.width!==pw||canvas.height!==ph){
    canvas.width=pw;canvas.height=ph;
  }
  const ctx=canvas.getContext('2d');
  if(!ctx)return;
  ctx.setTransform(ratio,0,0,ratio,0,0);
  ctx.clearRect(0,0,width,height);
  if(!map)return;
  const plotWidth=Math.min(width,chart.timeScale().width());
  const top=12,bottom=height-29;
  if(plotWidth<140||bottom<=top)return;
  const left=Math.max(16,Math.round(plotWidth*.08));
  const highlightStart=Math.max(left,Math.round(plotWidth*.28));
  const focused=new Set([map.upper?.key,map.lower?.key].filter(Boolean));
  type PlotLevel={item:LiquidityLevel;y:number;featured:boolean};
  const plots:PlotLevel[]=map.levels.flatMap(item=>{
    const y=price.priceToCoordinate(item.price);
    return y===null||!Number.isFinite(y)||y<top||y>bottom?[]:
      [{item,y,featured:focused.has(item.key)}];
  });
  ctx.save();
  ctx.beginPath();ctx.rect(0,top,plotWidth,bottom-top);ctx.clip();

  // First draw ALL currently known YH/YL, ONH/ONL, RTH H/L, IBH/IBL.
  // LIVE levels have dotted strokes because the range is still developing.
  for(const {item,y,featured} of plots){
    const upper=item.side==='BSL';
    const color=upper?'rgba(244,116,132,.47)':'rgba(83,210,160,.46)';
    ctx.strokeStyle=color;
    ctx.lineWidth=featured?1.5:1;
    ctx.setLineDash(item.frozen?[5,5]:[2,6]);
    ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(plotWidth,y);ctx.stroke();
    ctx.setLineDash([]);
  }

  // Only the nearest upper and lower wall receive filled ATR-adjusted bands.
  // Distant levels stay thin to avoid price-chart overload.
  for(const {item,y,featured} of plots){
    if(!featured)continue;
    const low=price.priceToCoordinate(item.zoneLow);
    const high=price.priceToCoordinate(item.zoneHigh);
    if(low===null||high===null||!Number.isFinite(low)||!Number.isFinite(high))continue;
    const upper=item.side==='BSL';
    const fill=upper?'rgba(241,85,104,.15)':'rgba(56,204,150,.13)';
    const stroke=upper?'rgba(255,130,143,.92)':'rgba(93,234,180,.88)';
    ctx.fillStyle=fill;
    ctx.fillRect(highlightStart,Math.min(low,high),
      plotWidth-highlightStart,Math.max(4,Math.abs(high-low)));
    ctx.strokeStyle=stroke;ctx.lineWidth=2;
    ctx.setLineDash(item.frozen?[]:[3,5]);
    ctx.beginPath();ctx.moveTo(highlightStart,y);ctx.lineTo(plotWidth,y);ctx.stroke();
    ctx.setLineDash([]);
  }

  // Label all levels when sufficiently separated; show priority labels first.
  // Closely packed levels still have their own lines and full details in table.
  const occupied:number[]=[];
  const ordered=[...plots].sort((a,b)=>Number(b.featured)-Number(a.featured));
  for(const {item,y,featured} of ordered){
    const tolerance=featured?21:15;
    if(occupied.some(prev=>Math.abs(prev-y)<tolerance))continue;
    occupied.push(y);
    const upper=item.side==='BSL';
    const body=(featured?(upper?'BSL ':'SSL '):'')+item.key+' '+
      (item.distancePct>=0?'+':'')+item.distancePct.toFixed(2)+'%'+
      (featured?' · '+item.state:(item.frozen?'':' · LIVE'));
    ctx.font=(featured?'800':'700')+' 11px Inter,system-ui,sans-serif';
    const tagWidth=Math.min(plotWidth-left-12,ctx.measureText(body).width+15);
    if(tagWidth<=42)continue;
    const tx=featured?Math.max(left+4,plotWidth-tagWidth-8):left+4;
    const ty=Math.max(top+2,Math.min(bottom-20,y-20));
    ctx.fillStyle=featured?'rgba(6,20,30,.94)':'rgba(6,20,30,.75)';
    ctx.fillRect(tx,ty,tagWidth,19);
    ctx.fillStyle=upper?'#ff9ca9':'#8be6bb';
    ctx.fillText(body,tx+7,ty+13,tagWidth-12);
    if(featured&&item.deepestAt!==undefined&&
        item.deepestDepthPct!==undefined&&item.deepestDepthPct>0){
      const time=new Date(item.deepestAt).toISOString().slice(11,16)+' UTC';
      const caption='SWEEP '+fmt(item.deepestPrice??item.price)+' · '+
        item.deepestDepthPct.toFixed(2)+'% · '+time;
      ctx.font='700 10px Inter,system-ui,sans-serif';
      const cw=Math.min(plotWidth-left-15,ctx.measureText(caption).width+13);
      const bx=Math.max(left+4,plotWidth-cw-8);
      const by=Math.max(top+2,Math.min(bottom-16,y+2));
      if(cw>50&&by>ty+18){
        ctx.fillStyle='rgba(5,20,30,.86)';
        ctx.fillRect(bx,by,cw,16);
        ctx.fillStyle=upper?'#ffb3bd':'#a0f0d0';
        ctx.fillText(caption,bx+6,by+12,cw-10);
      }
    }
  }
  ctx.restore();
}
