import type {Candle} from '@ascend/contracts';
import type {IChartApi,ISeriesApi} from 'lightweight-charts';
import {distanceToFvg,type FvgRecord} from '../market/fvgContextEngine';

export type FvgViewMode='near'|'all';
export type FvgAppearance={
  bullish:boolean;bearish:boolean;midline:boolean;showFill:boolean;
  showCreated:boolean;showRetest:boolean;showHistorical:boolean;
  activeOnly:boolean;opacity:number;maxZones:number;selectedId?:string;
};
export function selectFvgZones(
  records:FvgRecord[],price:number,mode:FvgViewMode,
  settings:FvgAppearance
):FvgRecord[]{
  const candidates=records.filter(z=>
    (z.side==='bull'?settings.bullish:settings.bearish)&&
    (settings.showHistorical||!['FILLED','INVALID'].includes(z.status))&&
    (!settings.activeOnly||!['FILLED','INVALID'].includes(z.status)));
  if(mode==='all')
    return candidates.slice(-settings.maxZones).sort((a,b)=>a.formedAt-b.formedAt);
  if(!Number.isFinite(price)||price<=0)return [];
  const half=Math.max(1,Math.floor(settings.maxZones/2));
  const rank=(side:'bull'|'bear')=>candidates.filter(z=>z.side===side)
    .sort((a,b)=>(distanceToFvg(a,price)??Infinity)-
      (distanceToFvg(b,price)??Infinity)||b.formedAt-a.formedAt).slice(0,half);
  const selected=candidates.find(z=>z.id===settings.selectedId);
  const items=[...rank('bull'),...rank('bear')];
  if(selected&&!items.some(z=>z.id===selected.id))items.push(selected);
  return items.sort((a,b)=>a.formedAt-b.formedAt);
}
function logicalIndex(candles:Candle[],timestamp:number,step:number):number{
  if(!candles.length)return 0;
  if(timestamp<=candles[0].timestamp)return (timestamp-candles[0].timestamp)/step;
  const last=candles.length-1;
  if(timestamp>=candles[last].timestamp)return last+
    (timestamp-candles[last].timestamp)/step;
  let l=0,r=last;
  while(r-l>1){const m=(l+r)>>1;if(candles[m].timestamp<=timestamp)l=m;else r=m}
  const diff=candles[r].timestamp-candles[l].timestamp;
  return l+(diff>0?(timestamp-candles[l].timestamp)/diff:0);
}
const STEPS:Record<string,number>={'1m':60000,'3m':180000,'5m':300000,
  '15m':900000,'30m':1800000,'1H':3600000,'4H':14400000,'1D':86400000};

/** Price-and-time-coordinate-only canvas, no mutation of chart data. */
export function drawFvgOverlay(
  chart:IChartApi,price:ISeriesApi<'Candlestick'>,
  host:HTMLElement,canvas:HTMLCanvasElement,
  chartBars:Candle[],chartTf:string,zones:FvgRecord[],enabled:boolean,view:FvgAppearance
){
  const width=host.clientWidth,height=host.clientHeight;
  if(width<1||height<1)return;
  const ratio=Math.min(2,Math.max(1,window.devicePixelRatio||1));
  const pw=Math.round(width*ratio),ph=Math.round(height*ratio);
  if(canvas.width!==pw||canvas.height!==ph){canvas.width=pw;canvas.height=ph}
  const ctx=canvas.getContext('2d');
  if(!ctx)return;
  ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,width,height);
  if(!enabled||!chartBars.length||!zones.length)return;
  const scale=chart.timeScale();
  const plotWidth=Math.min(width,scale.width()),top=9,bottom=height-28;
  const step=STEPS[chartTf]??60000;
  if(plotWidth<=90||bottom<=top)return;
  ctx.save();ctx.beginPath();ctx.rect(0,top,plotWidth,bottom-top);ctx.clip();
  const latest=chartBars[chartBars.length-1].timestamp+step;
  for(const z of zones){
    if(z.formedAt>latest)continue;
    const start=logicalIndex(chartBars,z.formedAt,step);
    const endAt=z.filledAt??latest;
    const end=logicalIndex(chartBars,Math.min(endAt,latest),step);
    const sx=scale.logicalToCoordinate(start as any),ex=scale.logicalToCoordinate(end as any);
    if(sx===null||ex===null)continue;
    const left=Math.max(0,Number(sx)),right=Math.min(plotWidth-2,Number(ex));
    if(right<=left||right<0)continue;
    const high=price.priceToCoordinate(z.high),low=price.priceToCoordinate(z.low);
    if(high===null||low===null)continue;
    const upper=Math.min(high,low),h=Math.max(2,Math.abs(low-high));
    if(upper>bottom||upper+h<top)continue;
    const chosen=z.id===view.selectedId;
    const bull=z.side==='bull',filled=['FILLED','INVALID'].includes(z.status);
    const base=bull?'50,194,146':'236,102,132';
    const alpha=view.opacity/100*(filled?.10:chosen?.52:.28);
    ctx.fillStyle='rgba('+base+','+alpha.toFixed(3)+')';
    ctx.fillRect(left,upper,right-left,h);
    ctx.strokeStyle='rgba('+base+','+(chosen?.97:filled?.30:.74)+')';
    ctx.lineWidth=chosen?2.4:1.1;ctx.setLineDash(filled?[4,5]:[]);
    ctx.strokeRect(left+.5,upper+.5,Math.max(0,right-left-1),Math.max(1,h-1));
    ctx.setLineDash([]);
    if(view.midline){
      const y=price.priceToCoordinate(z.midpoint);
      if(y!==null){
        ctx.strokeStyle='rgba('+base+',.70)';
        ctx.lineWidth=1;ctx.setLineDash([3,5]);ctx.beginPath();
        ctx.moveTo(left,y);ctx.lineTo(right,y);ctx.stroke();ctx.setLineDash([]);
      }
    }
    if(view.showFill&&z.maxFillPct>0&&z.maxFillPct<100){
      const fillH=h*z.maxFillPct/100;
      ctx.fillStyle='rgba('+base+',.20)';
      ctx.fillRect(left,bull?upper:upper+h-fillH,right-left,fillH);
    }
    const header=(bull?'BULL ':'BEAR ')+z.timeframe+
      ' · '+(z.atrMultiple===null?'ATR —':z.atrMultiple.toFixed(2)+' ATR');
    const extra=view.showFill?Math.round(z.maxFillPct)+'%':'';
    const tag=header+(extra?' · '+extra:'')+' · '+z.status;
    ctx.font='800 10px Inter,system-ui,sans-serif';
    const textWidth=ctx.measureText(tag).width+10;
    if(right-left>textWidth+12){
      const y=Math.max(top+2,Math.min(bottom-18,upper-18));
      const x=Math.max(left+3,Math.min(right-textWidth-3,left+8));
      ctx.fillStyle='rgba(6,17,26,.90)';ctx.fillRect(x,y,textWidth,16);
      ctx.fillStyle=bull?'#7ce6b9':'#f8a6b6';ctx.fillText(tag,x+5,y+12);
    }
    if(chosen&&right-left>70){
      ctx.font='10px Inter,system-ui,sans-serif';
      const details=[
        view.showCreated?'CREATE '+new Date(z.formedAt).toISOString().slice(11,16):'',
        view.showRetest&&z.firstTouchAt?'RETEST '+new Date(z.firstTouchAt).toISOString().slice(11,16):''
      ].filter(Boolean).join(' · ');
      if(details){
        ctx.fillStyle='rgba(7,19,30,.92)';ctx.fillRect(left+5,Math.max(top+2,upper+6),
          Math.min(right-left-10,ctx.measureText(details).width+12),16);
        ctx.fillStyle='#d1e5eb';ctx.fillText(details,left+10,Math.max(top+14,upper+18));
      }
    }
  }
  ctx.restore();
}
