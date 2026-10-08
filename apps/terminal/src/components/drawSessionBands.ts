import type {Candle} from '@ascend/contracts';
import type {IChartApi} from 'lightweight-charts';
import {SESSION_WINDOWS} from './SessionClock';

const DAY_MS=86400000;
const HOUR_MS=3600000;
const COLORS:Record<string,{fill:string;line:string;short:string}>={
  ASIA:{fill:'rgba(48,116,192,.075)',line:'rgba(79,165,225,.42)',short:'ASIA'},
  LONDON:{fill:'rgba(145,97,202,.068)',line:'rgba(184,140,239,.42)',short:'LON'},
  NEW_YORK:{fill:'rgba(211,136,48,.070)',line:'rgba(235,175,88,.42)',short:'NY'}
};
const DAY_GAP={from:22,to:24};
const OVERLAPS=[{from:7,to:8,label:'ASIA + LON'},{from:13,to:16,label:'LON + NY'}];
const pad=(v:number)=>String(v).padStart(2,'0')+':00';

function fractionalBarIndex(candles:Candle[],when:number,step:number):number {
  const n=candles.length;
  if(n<2)return 0;
  const first=candles[0].timestamp,last=candles[n-1].timestamp;
  if(when<=first)return (when-first)/step;
  if(when>=last)return (n-1)+(when-last)/step;
  let lo=0,hi=n-1;
  while(hi-lo>1){
    const mid=Math.floor((lo+hi)/2);
    if(candles[mid].timestamp<=when)lo=mid;else hi=mid;
  }
  const span=candles[hi].timestamp-candles[lo].timestamp;
  return lo+(span>0?(when-candles[lo].timestamp)/span:0);
}

export function drawSessionBands(
  chart:IChartApi,
  host:HTMLElement,
  canvas:HTMLCanvasElement,
  candles:Candle[],
  timeframe:string
){
  const width=host.clientWidth,height=host.clientHeight;
  if(width<1||height<1)return;
  const ratio=Math.min(2,Math.max(1,window.devicePixelRatio||1));
  const pixelWidth=Math.round(width*ratio),pixelHeight=Math.round(height*ratio);
  if(canvas.width!==pixelWidth||canvas.height!==pixelHeight){
    canvas.width=pixelWidth;canvas.height=pixelHeight;
  }
  const ctx=canvas.getContext('2d');
  if(!ctx)return;
  ctx.setTransform(ratio,0,0,ratio,0,0);
  ctx.clearRect(0,0,width,height);

  // An intraday window cannot be located precisely inside one daily candle.
  if(timeframe==='1D'||candles.length<2)return;

  const logical=chart.timeScale().getVisibleLogicalRange();
  if(!logical)return;
  const timeScale=chart.timeScale();
  const plotWidth=Math.min(width,timeScale.width());
  const plotTop=113; // Leave the live session ribbon fully readable.
  const plotBottom=Math.max(plotTop,height-28);
  if(plotBottom<=plotTop||plotWidth<=0)return;

  const step=Math.max(60000,Math.round(candles[candles.length-1].timestamp-candles[candles.length-2].timestamp));
  const minVisible=Math.max(0,Math.floor(Number(logical.from))-2);
  const maxVisible=Math.min(candles.length-1,Math.ceil(Number(logical.to))+2);
  if(maxVisible<minVisible)return;
  const start=candles[minVisible].timestamp-DAY_MS;
  const end=candles[maxVisible].timestamp+DAY_MS;
  const startDay=Math.floor(start/DAY_MS)*DAY_MS;
  const endDay=Math.floor(end/DAY_MS)*DAY_MS;

  const toX=(at:number):number|null=>{
    const index=fractionalBarIndex(candles,at,step);
    const x=timeScale.logicalToCoordinate(index as any);
    return x===null?null:Number(x);
  };
  const shade=(from:number,to:number,fill:string)=>{
    const a=toX(from),b=toX(to);
    if(a===null||b===null)return;
    const x=Math.max(0,Math.min(a,b));
    const right=Math.min(plotWidth,Math.max(a,b));
    if(right<=x)return;
    ctx.fillStyle=fill;
    ctx.fillRect(x,plotTop,right-x,plotBottom-plotTop);
  };
  const line=(at:number,label:string,color:string,topOffset=0)=>{
    const x=toX(at);
    if(x===null||x<0||x>plotWidth)return;
    ctx.strokeStyle=color;
    ctx.lineWidth=1;
    ctx.setLineDash([3,5]);
    ctx.beginPath();ctx.moveTo(Math.round(x)+.5,plotTop);ctx.lineTo(Math.round(x)+.5,plotBottom);ctx.stroke();
    ctx.setLineDash([]);
    if(label&&x+68<plotWidth){
      ctx.font='600 9px Inter,system-ui,sans-serif';
      const length=ctx.measureText(label).width+12;
      ctx.fillStyle='rgba(5,16,24,.84)';
      ctx.fillRect(x+3,plotTop+6+topOffset,length,16);
      ctx.fillStyle=color;
      ctx.fillText(label,x+9,plotTop+18+topOffset);
    }
  };

  // Visible days only; at 1m this is typically one day, at 4H a few weeks.
  // Maximum 52 iterations protects canvas from unexpected giant history spans.
  const count=Math.min(52,Math.max(0,Math.floor((endDay-startDay)/DAY_MS)+1));
  for(let i=0;i<count;i++){
    const day=startDay+i*DAY_MS;
    for(const session of SESSION_WINDOWS){
      const theme=COLORS[session.id];
      shade(day+session.from*HOUR_MS,day+session.to*HOUR_MS,theme.fill);
    }
    for(const period of OVERLAPS){
      shade(day+period.from*HOUR_MS,day+period.to*HOUR_MS,'rgba(172,203,234,.072)');
    }
    shade(day+DAY_GAP.from*HOUR_MS,day+DAY_GAP.to*HOUR_MS,'rgba(124,137,150,.065)');
    for(const session of SESSION_WINDOWS){
      const theme=COLORS[session.id];
      const openAt=day+session.from*HOUR_MS;
      const closeAt=day+session.to*HOUR_MS;
      line(openAt,theme.short+' '+pad(session.from),theme.line,0);
      // Close is a dashed boundary, labelled on the lower row to avoid collisions.
      line(closeAt,pad(session.to),theme.line,21);
    }
  }
}
