import type {IChartApi,ISeriesApi} from 'lightweight-charts';
import type {ChartNarrative} from '../market/chartNarrativeResearch';

const fmt=(v:number)=>v.toLocaleString('en-US',{maximumFractionDigits:v>=100?2:v>=1?4:6});
/** Lightweight chart coordinates, not a projected screenshot. Labels are
 * drawn only for observed swing/session levels or confirmed research plan.
 */
export function drawChartNarrative(
  chart:IChartApi,series:ISeriesApi<'Candlestick'>,host:HTMLElement,
  canvas:HTMLCanvasElement,model?:ChartNarrative,enabled=true
){
  const w=host.clientWidth,h=host.clientHeight;
  if(w<1||h<1)return;
  const ratio=Math.min(2,Math.max(1,window.devicePixelRatio||1));
  const wp=Math.round(w*ratio),hp=Math.round(h*ratio);
  if(canvas.width!==wp)canvas.width=wp;
  if(canvas.height!==hp)canvas.height=hp;
  const ctx=canvas.getContext('2d');if(!ctx)return;
  ctx.setTransform(ratio,0,0,ratio,0,0);
  ctx.clearRect(0,0,w,h);
  if(!enabled||!model?.valid)return;
  const plotRight=Math.min(chart.timeScale().width()-12,w-64);
  if(plotRight<185)return;
  type Mark={price:number;label:string;priority:number;color:string;dash:number[]};
  const entries:Mark[]=[];
  if(model.session){
    entries.push({price:model.session.open,label:model.session.name.toUpperCase()+' OPEN '+fmt(model.session.open),
      priority:4,color:'#e5c56a',dash:[4,6]});
  }
  if(model.swingHigh!==undefined)entries.push({price:model.swingHigh,
    label:'15m SWING HIGH '+fmt(model.swingHigh),priority:5,color:'#dfa2aa',dash:[2,6]});
  if(model.swingLow!==undefined)entries.push({price:model.swingLow,
    label:'15m SWING LOW '+fmt(model.swingLow),priority:5,color:'#81d0bb',dash:[2,6]});
  if(model.ready)for(const mark of model.marks){
    entries.push({price:mark.price,label:mark.label+' '+fmt(mark.price),
      priority:mark.kind==='ENTRY'?0:mark.kind==='SL'?1:2,
      color:mark.kind==='ENTRY'?'#ebd987':mark.kind==='SL'?'#f58d98':'#77e2b1',
      dash:mark.kind==='ENTRY'?[]:[7,4]});
  }
  const positioned=entries.flatMap(mark=>{
    const coordinate=series.priceToCoordinate(mark.price);
    const y=coordinate===null?NaN:Number(coordinate);
    return Number.isFinite(y)&&y>55&&y<h-55?[{...mark,y}]:[];
  }).sort((a,b)=>a.priority-b.priority);
  const occupied:number[]=[];
  for(const mark of positioned){
    // No duplicate text/labels when many lines crowd a narrow price range.
    if(occupied.some(y=>Math.abs(y-mark.y)<19))continue;
    occupied.push(mark.y);
    const x0=Math.max(3,plotRight*.60);
    ctx.setLineDash(mark.dash);ctx.lineWidth=mark.priority<3?1.6:.8;
    ctx.strokeStyle=mark.color;
    ctx.globalAlpha=mark.priority>=4?.55:.90;
    ctx.beginPath();ctx.moveTo(x0,mark.y);ctx.lineTo(plotRight,mark.y);ctx.stroke();
    ctx.setLineDash([]);ctx.globalAlpha=1;
    ctx.font='700 10px Inter,system-ui,sans-serif';
    const maxW=plotRight-x0-12;
    const label=mark.label;
    const tw=Math.min(maxW,ctx.measureText(label).width+14);
    if(tw<50)continue;
    ctx.fillStyle='rgba(5,18,28,.88)';
    ctx.fillRect(plotRight-tw,Math.max(2,mark.y-19),tw,16);
    ctx.fillStyle=mark.color;
    ctx.fillText(label,plotRight-tw+6,Math.max(14,mark.y-7),maxW-10);
  }
}
