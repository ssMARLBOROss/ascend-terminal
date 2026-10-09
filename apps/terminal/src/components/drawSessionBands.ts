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
const utcDate=(utcMs:number)=>{
  const day=new Date(utcMs);
  return String(day.getUTCDate()).padStart(2,'0')+'.'+String(day.getUTCMonth()+1).padStart(2,'0');
};

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
  timeframe:string,
  enabled=true
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
  if(!enabled||timeframe==='1D'||candles.length<2)return;

  const logical=chart.timeScale().getVisibleLogicalRange();
  if(!logical)return;
  const timeScale=chart.timeScale();
  const plotWidth=Math.min(width,timeScale.width());
  // Compact fixed-pixel UI ribbon. It never contributes to the price scale.
  const plotTop=9;
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
  // Track text occupancy on each row: stronger labels must never collide.
  const lastLabelEnd=[-Infinity,-Infinity];
  // A new crypto trading day starts at 00:00 UTC. Render a clear marker
  // without attaching another price series or subscribing to market data.
  let previousDayBadgeEnd=-Infinity;
  const dayBoundary=(utcMs:number)=>{
    if(utcMs>candles[candles.length-1].timestamp)return; // no future day marker
    const x=toX(utcMs);
    if(x===null||x<0||x>plotWidth)return;
    const center=Math.round(x)+.5;
    ctx.fillStyle='rgba(245,213,142,.11)';
    ctx.fillRect(Math.max(0,center-3),plotTop,6,plotBottom-plotTop);
    ctx.strokeStyle='#f3dc9b';
    ctx.lineWidth=2.5;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(center,plotTop);
    ctx.lineTo(center,plotBottom);
    ctx.stroke();

    // On compressed timeframes retain vertical boundaries while shortening
    // or hiding badges that would otherwise obscure each other.
    const nextX=toX(utcMs+DAY_MS);
    const dayWidth=nextX===null?0:Math.abs(nextX-x);
    const date=utcDate(utcMs);
    const label=dayWidth>=220?'НОВЫЕ СУТКИ · '+date+' · 00:00 UTC':
      dayWidth>=115?'СУТКИ '+date:
      dayWidth>=65?date:'';
    if(!label)return;
    ctx.font='850 11px Inter,system-ui,sans-serif';
    const badgeWidth=ctx.measureText(label).width+18;
    const badgeX=x+7;
    if(badgeX+badgeWidth>plotWidth||badgeX<previousDayBadgeEnd+10)return;
    const badgeY=plotTop+51; // Compact own row, below session boundaries.
    ctx.fillStyle='rgba(20,28,33,.95)';
    ctx.fillRect(badgeX,badgeY,badgeWidth,20);
    ctx.strokeStyle='rgba(243,220,155,.70)';
    ctx.lineWidth=1;
    ctx.strokeRect(badgeX+.5,badgeY+.5,badgeWidth-1,19);
    ctx.fillStyle='#ffecbd';
    ctx.fillText(label,badgeX+9,badgeY+14);
    previousDayBadgeEnd=badgeX+badgeWidth;
  };
  const line=(at:number,label:string,color:string,topOffset=0)=>{
    const x=toX(at);
    if(x===null||x<0||x>plotWidth)return;
    ctx.strokeStyle=color;
    ctx.lineWidth=1;
    ctx.setLineDash([3,5]);
    ctx.beginPath();ctx.moveTo(Math.round(x)+.5,plotTop);ctx.lineTo(Math.round(x)+.5,plotBottom);ctx.stroke();
    ctx.setLineDash([]);
    if(label){
      ctx.font='800 11px Inter,system-ui,sans-serif';
      const length=ctx.measureText(label).width+20;
      const row=topOffset===0?0:1;
      // Omit only the text if there is not enough space; keep session boundaries.
      if(x+length+3<=plotWidth&&x>=lastLabelEnd[row]+8){
        const y=plotTop+5+topOffset;
        ctx.fillStyle='rgba(5,16,24,.93)';
        ctx.fillRect(x+3,y,length,19);
        ctx.fillStyle=color;
        ctx.fillText(label,x+11,y+14);
        lastLabelEnd[row]=x+length+3;
      }
    }
  };

  // Visible days only; at 1m this is typically one day, at 4H a few weeks.
  // Maximum 52 iterations protects canvas from unexpected giant history spans.
  const count=Math.min(52,Math.max(0,Math.floor((endDay-startDay)/DAY_MS)+1));
  const todayStart=Math.floor(Date.now()/DAY_MS)*DAY_MS;
  for(let i=0;i<count;i++){
    const day=startDay+i*DAY_MS;
    const isPrevious=day<todayStart;
    if(isPrevious){
      // Only historic candle area is subdued; active UTC day stays untouched.
      // This is visual contrast, not a change to candle values or price levels.
      const a=toX(day),b=toX(day+DAY_MS);
      if(a!==null&&b!==null){
        const left=Math.max(0,Math.min(a,b));
        const right=Math.min(plotWidth,Math.max(a,b));
        if(right>left){
          ctx.fillStyle='rgba(2,9,17,.20)';
          ctx.fillRect(left,0,right-left,plotBottom);
        }
      }
    }
    ctx.save();
    if(isPrevious)ctx.globalAlpha=.50; // Faded session bands/labels/rollovers for past days.
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
      line(closeAt,pad(session.to),theme.line,22);
    }
    // Draw last so midnight stands out independently of the Asia opening.
    dayBoundary(day);
    ctx.restore();
  }
}
