import type {Candle} from '@ascend/contracts';
import type {IChartApi,ISeriesApi} from 'lightweight-charts';

export type FvgSide='bull'|'bear';
export type FvgStatus='FRESH'|'TOUCHED'|'FILLED';
export type FvgZone={
  id:string;side:FvgSide;low:number;high:number;
  formedAt:number;formedIndex:number;gapPercent:number;
  status:FvgStatus;touchedAt?:number;filledAt?:number;filledIndex?:number;
  remainingLow:number;remainingHigh:number;
};

const INTERVAL_MS:Record<string,number>={
  '1m':60000,'3m':180000,'5m':300000,'15m':900000,
  '30m':1800000,'1H':3600000,'4H':14400000,'1D':86400000
};

/**
 * Three-CLOSED-candle wick-to-wick Fair Value Gaps.
 * Bullish: third.low > first.high.
 * Bearish: third.high < first.low.
 * Formed only when the third candle has closed; touch/fill use subsequent
 * CLOSED candles only. No look-ahead or future candle interpolation.
 */
export function computeFvgZones(
  candles:Candle[],timeframe:string,minGapPct=.02,now=Date.now()
):FvgZone[]{
  const step=INTERVAL_MS[timeframe];
  if(!step||!Number.isFinite(minGapPct)||minGapPct<0)return [];
  const zones:FvgZone[]=[];
  const valid=(c:Candle)=>Number.isFinite(c.timestamp)&&
    [c.open,c.high,c.low,c.close].every(Number.isFinite)&&
    c.low>0&&c.high>=c.low&&c.high>=Math.max(c.open,c.close)&&
    c.low<=Math.min(c.open,c.close);
  for(let i=0;i<candles.length;i++){
    const current=candles[i];
    if(current.timestamp+step>now)break; // ongoing bar is excluded entirely
    if(!valid(current))continue;
    // Update previously discovered zones before detecting a new gap.
    for(const zone of zones){
      if(zone.status==='FILLED'||i<=zone.formedIndex)continue;
      if(zone.side==='bull'){
        if(current.low<=zone.high){
          if(zone.touchedAt===undefined)zone.touchedAt=current.timestamp;
          zone.remainingHigh=Math.max(zone.low,Math.min(zone.remainingHigh,current.low));
          zone.status='TOUCHED';
          if(current.low<=zone.low){
            zone.status='FILLED';
            zone.filledAt=current.timestamp;
            zone.filledIndex=i;
          }
        }
      }else if(current.high>=zone.low){
        if(zone.touchedAt===undefined)zone.touchedAt=current.timestamp;
        zone.remainingLow=Math.min(zone.high,Math.max(zone.remainingLow,current.high));
        zone.status='TOUCHED';
        if(current.high>=zone.high){
          zone.status='FILLED';
          zone.filledAt=current.timestamp;
          zone.filledIndex=i;
        }
      }
    }
    if(i<2)continue;
    const first=candles[i-2],middle=candles[i-1];
    if(!valid(first)||!valid(middle)||
      middle.timestamp-first.timestamp!==step||
      current.timestamp-middle.timestamp!==step)continue;
    let side:FvgSide,low:number,high:number;
    if(current.low>first.high){
      side='bull';low=first.high;high=current.low;
    }else if(current.high<first.low){
      side='bear';low=current.high;high=first.low;
    }else continue;
    const gapPercent=(high-low)/middle.close*100;
    if(gapPercent<minGapPct)continue;
    zones.push({id:String(current.timestamp)+':'+side,side,low,high,
      formedAt:current.timestamp+step,formedIndex:i,gapPercent,
      status:'FRESH',remainingLow:low,remainingHigh:high});
  }
  return zones;
}

/** Show recent unfilled zones and limited just-filled history to reduce clutter. */
export function visibleFvgZones(all:FvgZone[],limit=12):FvgZone[]{
  const open=all.filter(z=>z.status!=='FILLED').slice(-limit);
  const recent=all.filter(z=>z.status==='FILLED').slice(-3);
  return [...open,...recent].sort((a,b)=>a.formedAt-b.formedAt);
}

/** Separate canvas overlay: follows chart time and price scales while zooming/panning. */
export function drawFvgOverlay(
  chart:IChartApi,price:ISeriesApi<'Candlestick'>,
  host:HTMLElement,canvas:HTMLCanvasElement,
  zones:FvgZone[],enabled:boolean
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
  if(!enabled||!zones.length)return;
  const scale=chart.timeScale();
  const plotWidth=Math.min(width,scale.width()),top=155,bottom=height-28;
  if(plotWidth<=90||bottom<=top)return;
  ctx.save();
  ctx.beginPath();ctx.rect(0,top,plotWidth,bottom-top);ctx.clip();
  for(const zone of visibleFvgZones(zones)){
    const from=scale.logicalToCoordinate((zone.formedIndex+.5) as any);
    if(from===null)continue;
    const end=zone.filledIndex===undefined?plotWidth-2:
      scale.logicalToCoordinate((zone.filledIndex+.5) as any);
    if(end===null)continue;
    const left=Math.max(0,Number(from));
    const right=Math.min(plotWidth-2,Number(end));
    if(right<=left||right<0)continue;
    const upper=price.priceToCoordinate(zone.high);
    const lower=price.priceToCoordinate(zone.low);
    if(upper===null||lower===null)continue;
    const y=Math.min(upper,lower),h=Math.max(3,Math.abs(lower-upper));
    if(!Number.isFinite(y)||!Number.isFinite(h))continue;
    const bull=zone.side==='bull',filled=zone.status==='FILLED';
    const touched=zone.status==='TOUCHED';
    const base=bull?'50,194,146':'236,102,132';
    const opacity=filled?.045:touched?.08:.145;
    ctx.fillStyle='rgba('+base+','+opacity+')';
    ctx.fillRect(left,y,right-left,h);
    ctx.strokeStyle='rgba('+base+','+(filled?.24:touched?.53:.83)+')';
    ctx.lineWidth=filled?1:1.35;
    ctx.setLineDash(filled?[3,5]:[]);
    ctx.strokeRect(left+.5,y+.5,Math.max(0,right-left-1),Math.max(2,h-1));
    ctx.setLineDash([]);
    // On a partial mitigation, the remaining unfilled interval is brighter.
    if(touched){
      const remainUpper=price.priceToCoordinate(zone.remainingHigh);
      const remainLower=price.priceToCoordinate(zone.remainingLow);
      if(remainUpper!==null&&remainLower!==null){
        const ry=Math.min(remainUpper,remainLower);
        const rh=Math.abs(remainLower-remainUpper);
        if(rh>1){
          ctx.fillStyle='rgba('+base+',.16)';
          ctx.fillRect(left,ry,right-left,rh);
        }
      }
    }
    const tag=(bull?'FVG ↑ ':'FVG ↓ ')+
      (filled?'FILLED':touched?'TOUCHED':'FRESH');
    ctx.font='800 10px Inter,system-ui,sans-serif';
    const labelWidth=ctx.measureText(tag).width+10;
    if(right-left>labelWidth+9&&y<bottom-8&&y+h>top+8){
      const lx=Math.max(left+4,Math.min(right-labelWidth-3,plotWidth-labelWidth-6));
      const ly=Math.max(top+2,Math.min(bottom-17,y-18));
      ctx.fillStyle='rgba(5,18,29,.91)';
      ctx.fillRect(lx,ly,labelWidth,16);
      ctx.fillStyle=bull?'#71e4bd':'#f8a4b4';
      ctx.fillText(tag,lx+5,ly+12);
    }
  }
  ctx.restore();
}
