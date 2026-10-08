import type {IChartApi,ISeriesApi} from 'lightweight-charts';
import type {PreviousDayLevels} from '../market/usePreviousDayLevels';
import type {PreviousSessionLevels} from '../market/usePreviousSessionLevels';
import type {OrderbookSnapshot} from '../market/useOrderbookClusters';
import type {TpoProfile} from '../market/useLiveMarketMetrics';

export type StopZone={
  id:string;side:'high'|'low';low:number;high:number;center:number;
  sources:string[];
};

/**
 * Approximate buy-side/sell-side stop-search areas around known prior-day highs/lows.
 * They do NOT measure actual stop orders, liquidations, or broker positioning.
 */
export function estimateStopZones(
  previousDay?:PreviousDayLevels,previousSessions?:PreviousSessionLevels
):StopZone[]{
  if(!previousDay||!previousSessions||
    previousDay.symbol!==previousSessions.symbol||
    previousDay.dayStartUtc!==previousSessions.dayStartUtc)return [];
  const levels=[
    {side:'high' as const,p:previousDay.high,name:'YH'},
    {side:'low' as const,p:previousDay.low,name:'YL'},
    ...previousSessions.sessions.flatMap(s=>[
      {side:'high' as const,p:s.high,name:s.id+'-H'},
      {side:'low' as const,p:s.low,name:s.id+'-L'}
    ])
  ];
  const result:StopZone[]=[];
  for(const side of ['high','low'] as const){
    const candidates=levels.filter(x=>x.side===side&&x.p>0).sort((a,b)=>a.p-b.p);
    const groups:{prices:number[];sources:string[]}[]=[];
    for(const l of candidates){
      const last=groups[groups.length-1];
      if(last&&Math.abs(l.p-last.prices[0])/l.p<=.0015){
        last.prices.push(l.p);last.sources.push(l.name);
      }else groups.push({prices:[l.p],sources:[l.name]});
    }
    groups.sort((a,b)=>b.sources.length-a.sources.length);
    for(let i=0;i<Math.min(4,groups.length);i++){
      const g=groups[i],low=Math.min(...g.prices),high=Math.max(...g.prices);
      const center=(low+high)/2;
      const pad=center*.0003;
      result.push({id:side+'-'+i,side,low:low-pad,high:high+pad,center,
        sources:g.sources});
    }
  }
  return result;
}

/** Lightweight price-coordinate overlay: no chart series or future timestamps. */
export function drawLiquidityOverlay(
  chart:IChartApi,
  price:ISeriesApi<'Candlestick'>,
  host:HTMLElement,
  canvas:HTMLCanvasElement,
  orderbook:OrderbookSnapshot|undefined,
  stopZones:StopZone[],
  showBook:boolean,
  showStops:boolean,
  tpo:TpoProfile|undefined,
  showTpo:boolean
){
  const width=host.clientWidth,height=host.clientHeight;
  if(width<1||height<1)return;
  const ratio=Math.min(2,Math.max(1,window.devicePixelRatio||1));
  const pxWidth=Math.round(width*ratio),pxHeight=Math.round(height*ratio);
  if(canvas.width!==pxWidth||canvas.height!==pxHeight){
    canvas.width=pxWidth;canvas.height=pxHeight;
  }
  const ctx=canvas.getContext('2d');
  if(!ctx)return;
  ctx.setTransform(ratio,0,0,ratio,0,0);
  ctx.clearRect(0,0,width,height);
  const plotWidth=Math.min(width,chart.timeScale().width());
  const top=155,bottom=height-28;
  if(plotWidth<80||bottom<=top)return;
  const priceY=(p:number)=>price.priceToCoordinate(p);
  const fmt=(num:number)=>new Intl.NumberFormat('en-US',{
    notation:'compact',maximumFractionDigits:1
  }).format(num);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0,top,plotWidth,bottom-top);
  ctx.clip();

  // Faint, price-anchored rolling Value Area. Prices come from closed bars.
  if(showTpo&&tpo&&tpo.vah>tpo.val){
    const upper=priceY(tpo.vah),lower=priceY(tpo.val);
    if(upper!==null&&lower!==null){
      const y=Math.min(upper,lower),h=Math.abs(lower-upper);
      if(Number.isFinite(y)&&Number.isFinite(h)&&h>0){
        ctx.fillStyle='rgba(156,109,211,.050)';
        ctx.fillRect(0,y,plotWidth,h);
      }
    }
  }

  if(showStops){
    for(const z of stopZones){
      const upper=priceY(z.high),lower=priceY(z.low);
      if(upper===null||lower===null)continue;
      const mid=(upper+lower)/2;
      if(mid<top-15||mid>bottom+15)continue;
      const isHigh=z.side==='high';
      const fill=isHigh?'rgba(245,183,87,.08)':'rgba(109,182,223,.07)';
      const stroke=isHigh?'rgba(240,185,97,.57)':'rgba(113,184,224,.56)';
      const y=Math.min(upper,lower),h=Math.max(6,Math.abs(lower-upper));
      ctx.fillStyle=fill;
      ctx.fillRect(0,y,plotWidth,h);
      ctx.strokeStyle=stroke;
      ctx.lineWidth=1;
      ctx.setLineDash([2,5]);
      ctx.beginPath();ctx.moveTo(0,mid);ctx.lineTo(plotWidth,mid);ctx.stroke();
      ctx.setLineDash([]);
      const label=(isHigh?'STOP? H':'STOP? L')+' ×'+z.sources.length;
      ctx.font='800 11px Inter,system-ui,sans-serif';
      const tw=ctx.measureText(label).width+15;
      const labelY=Math.max(top+2,Math.min(bottom-18,mid-10));
      ctx.fillStyle='rgba(8,21,31,.88)';
      ctx.fillRect(8,labelY,tw,20);
      ctx.fillStyle=isHigh?'#e8bd7a':'#9fcfe9';
      ctx.fillText(label,15,labelY+14);
    }
  }
  // Snapshot may persist while tab was suspended; never depict stale bids/asks.
  if(showBook&&orderbook&&Date.now()-orderbook.receivedAt<45000){
    const startX=Math.max(plotWidth*.64,plotWidth-260);
    const bandWidth=plotWidth-startX;
    for(const cluster of orderbook.clusters){
      const upper=priceY(cluster.high),lower=priceY(cluster.low);
      if(upper===null||lower===null)continue;
      const mid=(upper+lower)/2;
      if(mid<top-10||mid>bottom+10)continue;
      const isBid=cluster.side==='bid';
      const heightPx=Math.max(9,Math.abs(lower-upper));
      const y=mid-heightPx/2;
      const alpha=Math.min(.29,.09+cluster.notionalUsdt/8000000);
      ctx.fillStyle=isBid?'rgba(35,210,129,'+alpha.toFixed(3)+')':
        'rgba(244,95,107,'+alpha.toFixed(3)+')';
      ctx.fillRect(startX,y,bandWidth,heightPx);
      ctx.strokeStyle=isBid?'rgba(80,223,153,.68)':'rgba(245,116,132,.68)';
      ctx.lineWidth=1;
      ctx.strokeRect(startX+.5,y+.5,bandWidth-1,heightPx-1);
      const label=(isBid?'BID ':'ASK ')+fmt(cluster.notionalUsdt)+' USDT';
      ctx.font='800 11px Inter,system-ui,sans-serif';
      const labelW=ctx.measureText(label).width+12;
      const labelX=Math.max(startX+2,plotWidth-labelW-3);
      const labelY=Math.max(top+1,Math.min(bottom-19,mid-10));
      ctx.fillStyle='rgba(5,17,26,.88)';
      ctx.fillRect(labelX,labelY,labelW,20);
      ctx.fillStyle=isBid?'#69e9ab':'#ff9da5';
      ctx.fillText(label,labelX+6,labelY+14);
    }
  }
  ctx.restore();
}
