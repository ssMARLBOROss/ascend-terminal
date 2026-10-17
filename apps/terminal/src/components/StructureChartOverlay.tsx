import {useEffect,useMemo,useRef,useState} from 'react';
import type {RefObject} from 'react';
import type {IChartApi,ISeriesApi,UTCTimestamp} from 'lightweight-charts';
import type {Candle} from '@ascend/contracts';
import {computeStructureChartEvents,structureEventDescription,type StructureChartEvent} from '../market/structureChartEvents';

type Pin={event:StructureChartEvent;x:number;y:number};
const stamp=(time:number)=>new Date(time).toLocaleString('ru-RU',{
  timeZone:'Europe/Kyiv',day:'2-digit',month:'2-digit',year:'numeric',
  hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false
});
const priceText=(v:number)=>v.toLocaleString('en-US',{maximumFractionDigits:v>=100?2:8});
export default function StructureChartOverlay({chartRef,priceRef,hostRef,candles,timeframe}:{
  chartRef:RefObject<IChartApi>;priceRef:RefObject<ISeriesApi<'Candlestick'>>;
  hostRef:RefObject<HTMLDivElement>;candles:Candle[];timeframe:string
}){
  const events=useMemo(()=>computeStructureChartEvents(candles,timeframe,Date.now()),[candles,timeframe]);
  const[visible,setVisible]=useState(true);
  const[pins,setPins]=useState<Pin[]>([]);
  const[selectedId,setSelectedId]=useState<string|null>(null);
  const firstShown=useRef(new Map<string,number>());
  const selected=events.find(e=>e.id===selectedId);
  useEffect(()=>{setSelectedId(null);firstShown.current.clear()},[timeframe,candles[0]?.timestamp]);
  useEffect(()=>{
    if(!visible){setPins([]);return}
    let active=true,frame=0,chart:IChartApi|null=null;
    const update=()=>{
      if(!active)return;
      const c=chartRef.current,p=priceRef.current,host=hostRef.current;
      if(!c||!p||!host)return;
      const width=host.clientWidth,height=host.clientHeight;
      const proposed:Pin[]=[];
      // Last confirmed events have visual priority when labels are near each other.
      for(const e of [...events].reverse()){
        const x=c.timeScale().timeToCoordinate(Math.floor(e.formedAt/1000) as UTCTimestamp);
        const y=p.priceToCoordinate(e.price);
        if(x===null||y===null||!Number.isFinite(x)||!Number.isFinite(y))continue;
        if(x<24||x>width-74||y<47||y>height-38)continue;
        if(proposed.some(a=>Math.abs(a.x-x)<34&&Math.abs(a.y-y)<27))continue;
        proposed.push({event:e,x,y});
        if(!firstShown.current.has(e.id))firstShown.current.set(e.id,Date.now());
        if(proposed.length>=32)break;
      }
      setPins(proposed.reverse());
    };
    const later=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(update)};
    const attach=()=>{
      const next=chartRef.current;
      if(next!==chart){
        if(chart)try{chart.timeScale().unsubscribeVisibleLogicalRangeChange(later)}catch{}
        chart=next;
        if(chart)chart.timeScale().subscribeVisibleLogicalRangeChange(later);
      }
      later();
    };
    // Chart creation lives in the parent effect. Attach after it has completed.
    frame=requestAnimationFrame(attach);
    const resize=new ResizeObserver(later);
    if(hostRef.current)resize.observe(hostRef.current);
    return()=>{active=false;resize.disconnect();cancelAnimationFrame(frame);
      if(chart)try{chart.timeScale().unsubscribeVisibleLogicalRangeChange(later)}catch{}
    };
  },[candles,events,timeframe,visible,chartRef,priceRef,hostRef]);
  const pin=selected?pins.find(p=>p.event.id===selected.id):undefined;
  const width=hostRef.current?.clientWidth??720;
  const height=hostRef.current?.clientHeight??480;
  const popupLeft=Math.max(8,Math.min(width-304,(pin?.x??width/2)+17));
  const popupTop=Math.max(7,Math.min(height-316,(pin?.y??55)-45));
  return <div className="asc-structure-overlay" aria-label="Нажимаемые подтверждённые структурные события">
    <button type="button" className={'asc-structure-toggle '+(visible?'active':'')}
      title="Показать или скрыть структуру цены" aria-pressed={visible}
      onClick={()=>{setVisible(v=>!v);setSelectedId(null)}}>
      СТРУКТУРА · {visible?'ВКЛ':'ВЫКЛ'}
    </button>
    {visible&&pins.map(p=><button key={p.event.id} type="button"
      className={'asc-structure-marker '+(p.event.direction==='UP'?'up':'down')+
        (selectedId===p.event.id?' selected':'')+
        (p.event.type.startsWith('BOS')||p.event.type.startsWith('CHoCH')?' break':'')}
      style={{left:p.x,top:p.y}} title={structureEventDescription(p.event.type)+' · открыть хронологию'}
      onClick={(e)=>{e.stopPropagation();setSelectedId(s=>s===p.event.id?null:p.event.id)}}>
      {p.event.type}
    </button>)}
    {visible&&selected&&<aside className="asc-structure-event-card" role="dialog"
      aria-label={'Хронология '+selected.type}
      style={{left:popupLeft,top:popupTop}}>
      <header><div><b>{selected.type}</b><strong>{structureEventDescription(selected.type)}</strong></div>
        <button type="button" aria-label="Закрыть карточку" onClick={()=>setSelectedId(null)}>×</button></header>
      <div className="asc-structure-event-main">
        <span>Цена <strong>{priceText(selected.price)}</strong></span>
        <span>Изменение <strong className={selected.direction==='UP'?'up':'down'}>
          {selected.deltaPercent===undefined?'—':(selected.deltaPercent>0?'+':'')+selected.deltaPercent.toFixed(3)+'%'}</strong></span>
      </div>
      <dl>
        <dt>Свеча сформировалась</dt><dd>{stamp(selected.formedAt)}</dd>
        <dt>Стало известно после закрытия</dt><dd>{stamp(selected.confirmedAt)}</dd>
        <dt>Впервые показано в этой вкладке</dt>
        <dd>{firstShown.current.has(selected.id)?stamp(firstShown.current.get(selected.id)!):'—'}</dd>
        <dt>Таймфрейм</dt><dd>{selected.timeframe}</dd>
        <dt>Предыдущая точка</dt><dd>{selected.reference===undefined?'—':priceText(selected.reference)}</dd>
      </dl>
      <p>{selected.reason}</p>
      <small>Только закрытые свечи · время Киева. Для старых событий первое отображение — время открытия текущей вкладки, не исторический сигнал.</small>
    </aside>}
  </div>;
}
