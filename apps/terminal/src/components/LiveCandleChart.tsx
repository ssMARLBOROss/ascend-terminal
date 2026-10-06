import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {
  ColorType,
  CrosshairMode,
  LineStyle,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp
} from 'lightweight-charts';
import type {AscendEvent,AscendTimeframe,Candle} from '@ascend/contracts';
import type {DisplayLevel} from '../market/engine';
import {eventLevelId,eventLevelNameRu,eventShortLabel,eventTitleRu} from '../market/eventLabels';

type ChartProps={
  candles:Candle[];
  levels:DisplayLevel[];
  lastPrice?:number;
  status:string;
  source:string;
  latencyMs?:number;
  symbol:string;
  timeframe:AscendTimeframe;
  windowSize?:number;
  onLoadOlder?:()=>Promise<void>;
  loadingOlder?:boolean;
  hasOlder?:boolean;
  focusTimestamp?:number;
  focusNonce?:number;
  events?:AscendEvent[];
};

type SessionSlice={
  id:string;
  name:'ASIA'|'LONDON'|'NEW YORK';
  start:number;
  end:number;
  first:number;
  last:number;
  high:number;
  low:number;
  mid:number;
  status:'LIVE'|'FROZEN';
};

const sessionDefs=[
  {name:'ASIA' as const,start:0,end:8,fill:'rgba(39,110,168,.055)',line:'rgba(64,145,201,.28)'},
  {name:'LONDON' as const,start:7,end:16,fill:'rgba(119,83,171,.05)',line:'rgba(145,108,198,.25)'},
  {name:'NEW YORK' as const,start:13,end:22,fill:'rgba(181,116,52,.05)',line:'rgba(206,145,74,.27)'}
];

type CachedViewport={range:{from:number;to:number};following:boolean};
const viewportCache=new Map<string,CachedViewport>();

const tfSeconds:Record<string,number>={
  '1m':60,'3m':180,'5m':300,'10m':600,'15m':900,'30m':1800,'45m':2700,
  '1H':3600,'2H':7200,'4H':14400,'6H':21600,'12H':43200,'1D':86400,'1W':604800,'1M':2592000
};

const fmtPrice=(v:number)=>{
  const a=Math.abs(v);
  return v.toLocaleString('en-US',{maximumFractionDigits:a>=1000?2:a>=1?4:a>=0.01?6:10});
};
const payloadNumber=(event:AscendEvent|undefined,key:string)=>{
  const value=event?.payload?.[key];
  return typeof value==='number'&&Number.isFinite(value)?value:undefined;
};

function nearestCandleTimestamp(candles:Candle[],ts:number){
  if(!candles.length)return ts;
  let lo=0,hi=candles.length-1,best=candles[0].timestamp;
  while(lo<=hi){
    const mid=(lo+hi)>>1;
    const value=candles[mid].timestamp;
    if(Math.abs(value-ts)<Math.abs(best-ts))best=value;
    if(value<ts)lo=mid+1;
    else if(value>ts)hi=mid-1;
    else return value;
  }
  return best;
}

function dayStartUtc(ts:number){
  const d=new Date(ts);
  return Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate());
}

function buildSessions(candles:Candle[]):SessionSlice[]{
  if(!candles.length)return[];
  const days=[...new Set(candles.map(c=>dayStartUtc(c.timestamp)))].sort((a,b)=>a-b);
  const now=Date.now();
  const result:SessionSlice[]=[];
  for(const day of days){
    for(const def of sessionDefs){
      const start=day+def.start*3600000;
      const end=day+def.end*3600000;
      if(start>now)continue;
      const items=candles.filter(c=>c.timestamp>=start&&c.timestamp<Math.min(end,now+1));
      if(!items.length)continue;
      const high=Math.max(...items.map(c=>c.high));
      const low=Math.min(...items.map(c=>c.low));
      result.push({
        id:`${day}-${def.name}`,
        name:def.name,
        start,end,
        first:items[0].timestamp,
        last:items[items.length-1].timestamp,
        high,low,mid:(high+low)/2,
        status:now>=end?'FROZEN':'LIVE'
      });
    }
  }
  return result;
}

export default function LiveCandleChart({
  candles,levels,lastPrice,status,source,latencyMs,symbol,timeframe,windowSize=250,
  onLoadOlder,loadingOlder=false,hasOlder=true,focusTimestamp,focusNonce,events=[]
}:ChartProps){
  const hostRef=useRef<HTMLDivElement|null>(null);
  const overlayRef=useRef<HTMLCanvasElement|null>(null);
  const chartRef=useRef<IChartApi|null>(null);
  const candleSeriesRef=useRef<ISeriesApi<'Candlestick'>|null>(null);
  const volumeSeriesRef=useRef<ISeriesApi<'Histogram'>|null>(null);
  const priceLinesRef=useRef<any[]>([]);
  const visibleTimeRef=useRef<any>(null);
  const visibleLogicalRef=useRef<{from:number;to:number}|null>(null);
  const followLatestRef=useRef(true);
  const applyingRangeRef=useRef(false);
  const lastDataLengthRef=useRef(0);
  const firstTimestampRef=useRef<number>();
  const lastTimestampRef=useRef<number>();
  const candleCountRef=useRef(candles.length);
  const pinnedTimeRef=useRef<number|undefined>();
  const eventAtSecondRef=useRef(new Map<number,AscendEvent[]>());
  const sessionsRef=useRef<SessionSlice[]>([]);
  const autoLoadingRef=useRef(false);
  const drawOverlayRef=useRef<()=>void>(()=>{});
  const loadOlderRef=useRef(onLoadOlder);
  const loadingOlderRef=useRef(loadingOlder);
  const hasOlderRef=useRef(hasOlder);
  const [hoverTime,setHoverTime]=useState<number>();
  const [pinnedTime,setPinnedTime]=useState<number>();
  const [selectedMarketEvent,setSelectedMarketEvent]=useState<AscendEvent>();
  const [eventPopupPoint,setEventPopupPoint]=useState<{x:number;y:number}>();
  const [selectedBalance,setSelectedBalance]=useState<SessionSlice>();
  const [balancePopupPoint,setBalancePopupPoint]=useState<{x:number;y:number}>();
  const [interactionHint,setInteractionHint]=useState('Перетаскивай график мышью · колесо = zoom');

  const sessions=useMemo(()=>buildSessions(candles),[candles]);
  useEffect(()=>{sessionsRef.current=sessions},[sessions]);
  const candleBySecond=useMemo(()=>{
    const map=new Map<number,Candle>();
    candles.forEach(c=>map.set(Math.floor(c.timestamp/1000),c));
    return map;
  },[candles]);
  const mappedEvents=useMemo(()=>events
    .filter(e=>['TOUCH','SWEEP','BREAK','ACCEPT','RECLAIM','CONFIRMED','ENTRY','TP','SL'].includes(e.type))
    .slice(-100)
    .map(event=>({event,candleTs:nearestCandleTimestamp(candles,event.timestamp)})),[events,candles]);

  useEffect(()=>{
    const map=new Map<number,AscendEvent[]>();
    for(const item of mappedEvents){
      const sec=Math.floor(item.candleTs/1000);
      const list=map.get(sec)??[];
      list.push(item.event);
      map.set(sec,list);
    }
    for(const list of map.values()){
      list.sort((a,b)=>{
        const p:Record<string,number>={SWEEP:0,BREAK:1,RECLAIM:2,ACCEPT:3,TOUCH:4,CONFIRMED:5,ENTRY:6,TP:7,SL:8};
        return(p[a.type]??99)-(p[b.type]??99);
      });
    }
    eventAtSecondRef.current=map;
  },[mappedEvents]);
  useEffect(()=>{loadOlderRef.current=onLoadOlder},[onLoadOlder]);
  useEffect(()=>{candleCountRef.current=candles.length},[candles.length]);
  useEffect(()=>{pinnedTimeRef.current=pinnedTime},[pinnedTime]);
  useEffect(()=>{loadingOlderRef.current=loadingOlder},[loadingOlder]);
  useEffect(()=>{hasOlderRef.current=hasOlder},[hasOlder]);

  const selectedCandle=(pinnedTime?candleBySecond.get(Math.floor(pinnedTime/1000)):undefined)
    ??(hoverTime?candleBySecond.get(Math.floor(hoverTime/1000)):undefined);

  const drawOverlay=useCallback(()=>{
    const canvas=overlayRef.current;
    const host=hostRef.current;
    const chart=chartRef.current;
    const series=candleSeriesRef.current;
    if(!canvas||!host||!chart||!series)return;
    const rect=host.getBoundingClientRect();
    if(rect.width<=0||rect.height<=0)return;
    const dpr=Math.max(1,window.devicePixelRatio||1);
    if(canvas.width!==Math.round(rect.width*dpr)||canvas.height!==Math.round(rect.height*dpr)){
      canvas.width=Math.round(rect.width*dpr);
      canvas.height=Math.round(rect.height*dpr);
      canvas.style.width=`${rect.width}px`;
      canvas.style.height=`${rect.height}px`;
    }
    const ctx=canvas.getContext('2d');
    if(!ctx)return;
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,rect.width,rect.height);
    const plotBottom=Math.max(0,rect.height-27);

    const timeScale=chart.timeScale();

    // Clear day boundaries.
    const dayMap=new Map<number,number>();
    for(const c of candles){
      const day=dayStartUtc(c.timestamp);
      if(!dayMap.has(day))dayMap.set(day,c.timestamp);
    }
    ctx.save();
    ctx.font='600 9px Inter,system-ui,sans-serif';
    for(const [day,firstTs] of dayMap){
      const x=timeScale.timeToCoordinate(Math.floor(firstTs/1000) as UTCTimestamp);
      if(x===null||x<-30||x>rect.width+30)continue;
      ctx.strokeStyle='rgba(132,163,180,.28)';
      ctx.setLineDash([3,5]);
      ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,plotBottom);ctx.stroke();
      ctx.setLineDash([]);
      const dayLabel=new Date(day).toLocaleDateString('ru-RU',{day:'2-digit',month:'short'}).toUpperCase();
      ctx.fillStyle='rgba(6,18,27,.88)';
      ctx.fillRect(x+4,plotBottom-22,52,16);
      ctx.fillStyle='rgba(178,202,214,.82)';
      ctx.fillText(dayLabel,x+8,plotBottom-10);
    }
    ctx.restore();

    // Session bands: clean, TradingView-like, with local balance rectangles.
    for(const session of sessions){
      const def=sessionDefs.find(x=>x.name===session.name)!;
      const x1=timeScale.timeToCoordinate(Math.floor(session.first/1000) as UTCTimestamp);
      const x2raw=timeScale.timeToCoordinate(Math.floor(session.last/1000) as UTCTimestamp);
      if(x1===null||x2raw===null)continue;
      const count=Math.max(1,candles.filter(c=>c.timestamp>=session.first&&c.timestamp<=session.last).length-1);
      const step=Math.max(4,Math.abs(x2raw-x1)/count);
      const x2=x2raw+step;
      if(x2<0||x1>rect.width)continue;

      ctx.fillStyle=def.fill;
      ctx.fillRect(x1,0,Math.max(2,x2-x1),plotBottom);
      ctx.strokeStyle=def.line;
      ctx.setLineDash([2,5]);
      ctx.beginPath();ctx.moveTo(x1,0);ctx.lineTo(x1,plotBottom);ctx.stroke();
      ctx.setLineDash([]);

      const bandLabel=session.name==='NEW_YORK'?'NEW YORK':session.name;
      const label=`${bandLabel}${session.status==='LIVE'?' · LIVE':''}`;
      ctx.font='700 8px "Segoe UI",system-ui,sans-serif';
      const labelW=Math.min(Math.max(52,ctx.measureText(label).width+12),Math.max(52,x2-x1-6));
      ctx.fillStyle=session.status==='LIVE'?'rgba(10,59,69,.88)':'rgba(7,25,36,.78)';
      ctx.strokeStyle=session.status==='LIVE'?'rgba(78,201,180,.55)':def.line;
      ctx.fillRect(x1+4,7,labelW,18);
      ctx.strokeRect(x1+4,7,labelW,18);
      ctx.fillStyle=session.status==='LIVE'?'rgba(206,246,236,.92)':'rgba(142,164,176,.76)';
      ctx.fillText(label,x1+10,19);

      const yh=series.priceToCoordinate(session.high);
      const yl=series.priceToCoordinate(session.low);
      const ym=series.priceToCoordinate(session.mid);
      if(yh===null||yl===null||ym===null)continue;
      const top=Math.min(yh,yl),height=Math.abs(yl-yh);
      if(top>plotBottom||top+height<0)continue;

      ctx.fillStyle=session.status==='LIVE'?'rgba(50,190,163,.035)':'rgba(87,113,128,.025)';
      ctx.strokeStyle=session.status==='LIVE'?'rgba(79,211,183,.27)':'rgba(111,137,151,.16)';
      ctx.setLineDash(session.status==='LIVE'?[5,5]:[3,6]);
      ctx.fillRect(x1,top,Math.max(2,x2-x1),height);
      ctx.strokeRect(x1,top,Math.max(2,x2-x1),height);
      ctx.setLineDash([3,6]);
      ctx.strokeStyle=session.status==='LIVE'?'rgba(98,224,198,.34)':'rgba(126,149,160,.2)';
      ctx.beginPath();ctx.moveTo(x1,ym);ctx.lineTo(x2,ym);ctx.stroke();
      ctx.setLineDash([]);

      if(x2-x1>68){
        const short=`BALANCE ${session.status}`;
        ctx.font='600 7px "Segoe UI",system-ui,sans-serif';
        ctx.fillStyle=session.status==='LIVE'?'rgba(140,226,208,.82)':'rgba(125,148,159,.58)';
        ctx.fillText(short,x1+6,Math.max(38,Math.min(plotBottom-8,top+12)));
      }
    }

    // Compact level labels at the right edge with collision avoidance.
    const levelPriority:Record<string,number>={
      ONH:0,ONL:1,YH:2,YL:3,RTH_HIGH:4,RTH_LOW:5,IBH:6,IBL:7,VWAP:8,OPEN:9
    };
    const visibleLevels=levels
      .filter(level=>levelPriority[level.id]!==undefined)
      .map(level=>({level,y:series.priceToCoordinate(level.price),priority:levelPriority[level.id]}))
      .filter(item=>item.y!==null&&item.y!>28&&item.y!<plotBottom-4)
      .sort((a,b)=>a.priority-b.priority)
      .slice(0,10);

    const placed:{y:number;target:number;level:DisplayLevel}[]=[];
    for(const item of visibleLevels){
      let y=Number(item.y);
      const minGap=18;
      for(const p of placed){
        if(Math.abs(y-p.y)<minGap)y=p.y+(y>=p.y?minGap:-minGap);
      }
      y=Math.max(34,Math.min(plotBottom-10,y));
      placed.push({y,target:Number(item.y),level:item.level});
    }
    placed.sort((a,b)=>a.y-b.y);
    for(let i=1;i<placed.length;i++){
      if(placed[i].y-placed[i-1].y<18)placed[i].y=Math.min(plotBottom-10,placed[i-1].y+18);
    }

    ctx.font='700 8px "Segoe UI",system-ui,sans-serif';
    for(const item of placed){
      const x=Math.max(6,rect.width-126);
      const label=`${item.level.label} · ${item.level.status==='FROZEN'?'F':'L'}  ${fmtPrice(item.level.price)}`;
      const w=118;
      if(Math.abs(item.y-item.target)>1){
        ctx.strokeStyle=item.level.status==='FROZEN'?'rgba(204,164,84,.45)':'rgba(71,174,212,.42)';
        ctx.setLineDash([2,3]);
        ctx.beginPath();ctx.moveTo(x-14,item.target);ctx.lineTo(x-3,item.y);ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.fillStyle=item.level.status==='FROZEN'?'rgba(117,87,31,.93)':'rgba(8,78,105,.94)';
      ctx.strokeStyle=item.level.status==='FROZEN'?'rgba(218,177,92,.78)':'rgba(77,188,227,.75)';
      ctx.fillRect(x,item.y-8,w,16);
      ctx.strokeRect(x,item.y-8,w,16);
      ctx.fillStyle='#e7f0f3';
      ctx.fillText(label,x+5,item.y+3);
    }

    // Pinned candle marker.
    if(pinnedTime){
      const x=timeScale.timeToCoordinate(Math.floor(pinnedTime/1000) as UTCTimestamp);
      if(x!==null){
        ctx.strokeStyle='rgba(223,237,243,.65)';
        ctx.setLineDash([2,3]);
        ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,plotBottom);ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  },[candles,pinnedTime,sessions,levels]);
  drawOverlayRef.current=drawOverlay;

  useEffect(()=>{
    const viewportKey=`${symbol}:${timeframe}`;
    const cachedViewport=viewportCache.get(viewportKey);
    visibleTimeRef.current=null;
    visibleLogicalRef.current=cachedViewport?.range??null;
    followLatestRef.current=cachedViewport?.following??true;
    applyingRangeRef.current=false;
    lastDataLengthRef.current=0;
    setPinnedTime(undefined);
    setSelectedMarketEvent(undefined);
    setEventPopupPoint(undefined);
    setSelectedBalance(undefined);
    setBalancePopupPoint(undefined);
    setHoverTime(undefined);
    setInteractionHint('Перетаскивай график мышью · колесо = zoom');
    const host=hostRef.current;
    if(!host)return;
    const chart=createChart(host,{
      width:host.clientWidth,
      height:host.clientHeight,
      layout:{background:{type:ColorType.Solid,color:'#050d13'},textColor:'#7892a1',fontFamily:'Inter,system-ui,sans-serif',fontSize:11},
      grid:{vertLines:{color:'rgba(30,55,71,.25)'},horzLines:{color:'rgba(30,55,71,.32)'}},
      crosshair:{
        mode:CrosshairMode.Normal,
        vertLine:{color:'rgba(163,196,211,.5)',width:1,style:LineStyle.Dashed,labelBackgroundColor:'#163446'},
        horzLine:{color:'rgba(163,196,211,.42)',width:1,style:LineStyle.Dashed,labelBackgroundColor:'#163446'}
      },
      rightPriceScale:{borderColor:'#183548',scaleMargins:{top:.08,bottom:.22}},
      timeScale:{borderColor:'#183548',timeVisible:true,secondsVisible:false,rightOffset:8,barSpacing:8,minBarSpacing:2,fixLeftEdge:false,lockVisibleTimeRangeOnResize:true},
      handleScroll:{mouseWheel:false,pressedMouseMove:true,horzTouchDrag:true,vertTouchDrag:false},
      handleScale:{axisPressedMouseMove:true,mouseWheel:true,pinch:true},
      kineticScroll:{mouse:true,touch:true},
      localization:{locale:'ru-RU'}
    });
    chartRef.current=chart;

    const series=chart.addCandlestickSeries({
      upColor:'#25aa82',downColor:'#c75265',
      borderUpColor:'#48d5a9',borderDownColor:'#e27485',
      wickUpColor:'#48d5a9',wickDownColor:'#e27485',
      priceLineVisible:true,lastValueVisible:true
    });
    candleSeriesRef.current=series;

    const volume=chart.addHistogramSeries({
      priceFormat:{type:'volume'},priceScaleId:'volume',lastValueVisible:false,priceLineVisible:false
    });
    volume.priceScale().applyOptions({scaleMargins:{top:.82,bottom:0}});
    volumeSeriesRef.current=volume;

    const move=(param:any)=>{
      if(!param?.time||pinnedTimeRef.current)return;
      const sec=typeof param.time==='number'?param.time:undefined;
      if(sec)setHoverTime(sec*1000);
    };

    const click=(param:any)=>{
      if(!param?.time)return;
      const sec=typeof param.time==='number'?param.time:undefined;
      if(!sec)return;
      const eventList=eventAtSecondRef.current.get(sec)??[];
      const point=param.point;
      if(eventList.length){
        const chosen=eventList[0];
        setSelectedMarketEvent(chosen);
        if(point&&hostRef.current){
          const rect=hostRef.current.getBoundingClientRect();
          setEventPopupPoint({
            x:Math.max(8,Math.min(Number(point.x)+12,Math.max(8,rect.width-340))),
            y:Math.max(58,Math.min(Number(point.y)+12,Math.max(58,rect.height-235)))
          });
        }
        setPinnedTime(sec*1000);
        setHoverTime(sec*1000);
        return;
      }
      setSelectedMarketEvent(undefined);
      setEventPopupPoint(undefined);

      const candleTs=sec*1000;
      const clickPrice=point?series.coordinateToPrice(Number(point.y)):null;
      const balance=[...sessionsRef.current]
        .sort((a,b)=>(a.status==='LIVE'?0:1)-(b.status==='LIVE'?0:1))
        .find(s=>candleTs>=s.first&&candleTs<=s.last&&clickPrice!==null&&clickPrice<=s.high&&clickPrice>=s.low);
      if(balance&&point&&hostRef.current){
        const rect=hostRef.current.getBoundingClientRect();
        setSelectedBalance(balance);
        setBalancePopupPoint({
          x:Math.max(8,Math.min(Number(point.x)+12,Math.max(8,rect.width-300))),
          y:Math.max(58,Math.min(Number(point.y)+12,Math.max(58,rect.height-205)))
        });
      }else{
        setSelectedBalance(undefined);
        setBalancePopupPoint(undefined);
      }
      setPinnedTime(prev=>prev===sec*1000?undefined:sec*1000);
      setHoverTime(sec*1000);
    };

    const visible=(range:any)=>{
      const logical=chart.timeScale().getVisibleLogicalRange();
      const timeRange=chart.timeScale().getVisibleRange();
      visibleLogicalRef.current=logical?{from:Number(logical.from),to:Number(logical.to)}:null;
      visibleTimeRef.current=timeRange;
      if(!applyingRangeRef.current&&logical){
        const lastIndex=Math.max(0,candleCountRef.current-1);
        followLatestRef.current=Number(logical.to)>=lastIndex+2;
        viewportCache.set(viewportKey,{range:{from:Number(logical.from),to:Number(logical.to)},following:followLatestRef.current});
      }
      drawOverlayRef.current();

      const loadOlder=loadOlderRef.current;
      if(!range||!loadOlder||loadingOlderRef.current||!hasOlderRef.current||autoLoadingRef.current)return;
      const info=series.barsInLogicalRange(range);
      if(info&&info.barsBefore<24){
        autoLoadingRef.current=true;
        setInteractionHint('Подгружаем старую историю · loading older candles…');
        Promise.resolve(loadOlder()).finally(()=>{
          autoLoadingRef.current=false;
          setInteractionHint('Перетаскивай график мышью · колесо = zoom');
        });
      }
    };

    chart.subscribeCrosshairMove(move);
    chart.subscribeClick(click);
    chart.timeScale().subscribeVisibleLogicalRangeChange(visible);
    chart.timeScale().subscribeVisibleTimeRangeChange(()=>{visibleTimeRef.current=chart.timeScale().getVisibleRange();drawOverlayRef.current()});

    const resize=new ResizeObserver(()=>{
      if(!hostRef.current)return;
      chart.applyOptions({width:hostRef.current.clientWidth,height:hostRef.current.clientHeight});
      drawOverlayRef.current();
    });
    resize.observe(host);

    return()=>{
      const logical=chart.timeScale().getVisibleLogicalRange();
      if(logical)viewportCache.set(viewportKey,{range:{from:Number(logical.from),to:Number(logical.to)},following:followLatestRef.current});
      resize.disconnect();
      chart.unsubscribeCrosshairMove(move);
      chart.unsubscribeClick(click);
      chart.remove();
      chartRef.current=null;candleSeriesRef.current=null;volumeSeriesRef.current=null;
    };
  // chart is recreated only when instrument/timeframe changes, not on every tick.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[symbol,timeframe]);

  useEffect(()=>{
    const series=candleSeriesRef.current;
    const volume=volumeSeriesRef.current;
    const chart=chartRef.current;
    if(!series||!volume||!chart||!candles.length)return;

    const previousTimeRange=visibleTimeRef.current;
    const previousLogical=visibleLogicalRef.current;
    const previousLength=lastDataLengthRef.current;
    const previousFirst=firstTimestampRef.current;
    const previousLast=lastTimestampRef.current;
    const nextFirst=candles[0].timestamp;
    const nextLast=candles[candles.length-1].timestamp;
    const prepended=previousFirst!==undefined&&nextFirst<previousFirst;
    const appended=previousLast!==undefined&&nextLast>previousLast;

    const candleData=candles.map(c=>({time:Math.floor(c.timestamp/1000) as UTCTimestamp,open:c.open,high:c.high,low:c.low,close:c.close}));
    const volumeData=candles.map(c=>({time:Math.floor(c.timestamp/1000) as UTCTimestamp,value:c.volume,color:c.close>=c.open?'rgba(45,190,148,.28)':'rgba(214,86,105,.28)'}));
    series.setData(candleData);
    volume.setData(volumeData);

    applyingRangeRef.current=true;
    try{
      if(prepended&&previousTimeRange){
        // Loading older candles must not move the viewport the user is currently studying.
        chart.timeScale().setVisibleRange(previousTimeRange);
      }else if(previousLogical){
        const width=Math.max(10,previousLogical.to-previousLogical.from);
        if(appended&&followLatestRef.current){
          const to=candles.length-1+6;
          chart.timeScale().setVisibleLogicalRange({from:to-width,to});
        }else{
          chart.timeScale().setVisibleLogicalRange(previousLogical);
        }
      }else{
        const cached=viewportCache.get(`${symbol}:${timeframe}`);
        if(cached?.range){
          chart.timeScale().setVisibleLogicalRange(cached.range);
          followLatestRef.current=cached.following;
        }else{
          const from=Math.max(0,candles.length-windowSize);
          chart.timeScale().setVisibleLogicalRange({from,to:candles.length-1+6});
          followLatestRef.current=true;
        }
      }
    }catch{}

    lastDataLengthRef.current=candles.length;
    firstTimestampRef.current=nextFirst;
    lastTimestampRef.current=nextLast;
    candleCountRef.current=candles.length;
    window.requestAnimationFrame(()=>{
      applyingRangeRef.current=false;
      drawOverlayRef.current();
    });

    // Same-candle websocket updates should never reset pan/zoom.
    if(previousLength===candles.length&&!prepended&&!appended){
      setInteractionHint('Перетаскивай график мышью · масштаб сохраняется');
    }
  },[candles,windowSize,symbol,timeframe]);

  useEffect(()=>{
    const series=candleSeriesRef.current;
    if(!series)return;
    for(const line of priceLinesRef.current){
      try{series.removePriceLine(line)}catch{}
    }
    priceLinesRef.current=[];
    const recent=candles.slice(-300);
    const min=recent.length?Math.min(...recent.map(c=>c.low)):undefined;
    const max=recent.length?Math.max(...recent.map(c=>c.high)):undefined;
    const pad=min!==undefined&&max!==undefined?(max-min)*.75:0;
    for(const level of levels){
      if(min!==undefined&&max!==undefined&&(level.price<min-pad||level.price>max+pad))continue;
      priceLinesRef.current.push(series.createPriceLine({
        price:level.price,
        color:level.status==='FROZEN'?'rgba(213,174,91,.82)':'rgba(70,178,217,.78)',
        lineWidth:1,
        lineStyle:level.status==='FROZEN'?LineStyle.Dashed:LineStyle.SparseDotted,
        axisLabelVisible:false,
        title:''
      }));
    }
    requestAnimationFrame(drawOverlay);
  },[levels,candles,drawOverlay]);

  useEffect(()=>{requestAnimationFrame(drawOverlay)},[drawOverlay]);


  useEffect(()=>{
    const series=candleSeriesRef.current;
    if(!series||!candles.length)return;

    const markers=mappedEvents.map(({event:e,candleTs})=>{
      const time=Math.floor(candleTs/1000) as UTCTimestamp;
      const isLong=e.direction==='LONG';
      let position:'aboveBar'|'belowBar'|'inBar'='aboveBar';
      let shape:'circle'|'square'|'arrowUp'|'arrowDown'='circle';
      let color='#6fb8d8';
      let text=eventShortLabel(e);

      if(e.type==='TOUCH'){position=isLong?'belowBar':'aboveBar';shape='circle';color='#73bcd8'}
      if(e.type==='SWEEP'){position=isLong?'belowBar':'aboveBar';shape=isLong?'arrowUp':'arrowDown';color='#d7a84d'}
      if(e.type==='BREAK'){position=isLong?'belowBar':'aboveBar';shape=isLong?'arrowUp':'arrowDown';color='#4aa7d6'}
      if(e.type==='ACCEPT'){position=isLong?'belowBar':'aboveBar';shape='square';color='#5ac8a3'}
      if(e.type==='RECLAIM'){position=isLong?'belowBar':'aboveBar';shape=isLong?'arrowUp':'arrowDown';color='#8fd3b7'}
      if(e.type==='CONFIRMED'){position=isLong?'belowBar':'aboveBar';shape='square';color='#36d09b'}
      if(e.type==='ENTRY'){position=isLong?'belowBar':'aboveBar';shape=isLong?'arrowUp':'arrowDown';color='#eef4f7'}
      if(e.type==='TP'){position=isLong?'aboveBar':'belowBar';shape='square';color='#37cfa1'}
      if(e.type==='SL'){position=isLong?'belowBar':'aboveBar';shape='square';color='#e36c7e'}

      return{time,position,shape,color,text,size:e.type==='SWEEP'?1.35:1};
    });
    try{(series as any).setMarkers(markers)}catch{}
  },[mappedEvents,candles.length,timeframe,symbol]);


  useEffect(()=>{
    const chart=chartRef.current;
    if(!chart||!focusTimestamp||!focusNonce)return;
    const step=tfSeconds[timeframe]??900;
    const center=Math.floor(focusTimestamp/1000);
    const half=Math.max(step*18,step*Math.min(windowSize,120)/2);
    applyingRangeRef.current=true;
    followLatestRef.current=false;
    try{
      chart.timeScale().setVisibleRange({from:(center-half) as UTCTimestamp,to:(center+half) as UTCTimestamp});
      setPinnedTime(focusTimestamp);
    }catch{}
    window.requestAnimationFrame(()=>{
      applyingRangeRef.current=false;
      drawOverlayRef.current();
    });
  // Deliberately only reacts to a new focus command. Live ticks must never yank the chart back.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[focusNonce]);

  useEffect(()=>{
    const chart=chartRef.current;
    if(!chart||!candles.length)return;
    const from=Math.max(0,candles.length-windowSize);
    applyingRangeRef.current=true;
    followLatestRef.current=true;
    try{chart.timeScale().setVisibleLogicalRange({from,to:candles.length-1+6})}catch{}
    window.requestAnimationFrame(()=>{applyingRangeRef.current=false});
  },[windowSize]);

  const zoom=(factor:number)=>{
    const chart=chartRef.current;
    if(!chart)return;
    const range=chart.timeScale().getVisibleLogicalRange();
    if(!range)return;
    const center=(range.from+range.to)/2;
    const half=Math.max(8,(range.to-range.from)*factor/2);
    chart.timeScale().setVisibleLogicalRange({from:center-half,to:center+half});
  };
  const latest=()=>{
    const chart=chartRef.current;
    if(!chart||!candles.length)return;
    setPinnedTime(undefined);
    setSelectedMarketEvent(undefined);
    setEventPopupPoint(undefined);
    followLatestRef.current=true;
    const from=Math.max(0,candles.length-windowSize);
    applyingRangeRef.current=true;
    chart.timeScale().setVisibleLogicalRange({from,to:candles.length-1+6});
    window.requestAnimationFrame(()=>{applyingRangeRef.current=false});
  };

  if(candles.length<20)return <div className="live-candle-root loading"><b>ЗАГРУЖАЕМ ИСТОРИЮ СВЕЧЕЙ · LOADING CANDLE HISTORY</b><small>{source} WebSocket уже может быть LIVE, но интерактивный график ждёт REST-историю · candles: {candles.length}</small></div>;

  return <div className="tv-chart-root">
    <div ref={hostRef} className="tv-chart-host"/>
    <canvas ref={overlayRef} className="tv-chart-overlay"/>
    <div className="live-chart-status">
      <span className={status==='LIVE'?'ok':'wait'}>● {status}</span>
      <b>{symbol} · {source} PUBLIC</b>
      <small>{lastPrice!==undefined?fmtPrice(lastPrice):'—'} {latencyMs!==undefined?'· '+latencyMs+' ms':''}</small>
    </div>
    <div className="tv-chart-actions">
      <button type="button" onClick={()=>zoom(.72)} title="Приблизить">＋</button>
      <button type="button" onClick={()=>zoom(1.42)} title="Отдалить">−</button>
      <button type="button" onClick={latest}>ПОСЛЕДНЯЯ · LATEST</button>
      <button type="button" onClick={()=>{setPinnedTime(undefined);setHoverTime(undefined);setSelectedMarketEvent(undefined);setEventPopupPoint(undefined)}}>СБРОС КУРСОРА</button>
    </div>
    <div className="tv-chart-hint">{interactionHint}</div>

    {selectedBalance&&balancePopupPoint&&<div className="tv-balance-popup" style={{left:balancePopupPoint.x,top:balancePopupPoint.y}}>
      <button className="tv-event-popup-close" onClick={()=>{setSelectedBalance(undefined);setBalancePopupPoint(undefined)}}>×</button>
      <strong>{selectedBalance.name==='NEW_YORK'?'NEW YORK':selectedBalance.name} · BALANCE {selectedBalance.status}</strong>
      <div><span>HIGH</span><b>{fmtPrice(selectedBalance.high)}</b></div>
      <div><span>MID</span><b>{fmtPrice(selectedBalance.mid)}</b></div>
      <div><span>LOW</span><b>{fmtPrice(selectedBalance.low)}</b></div>
    </div>}
    {selectedMarketEvent&&eventPopupPoint&&<div className="tv-event-popup" style={{left:eventPopupPoint.x,top:eventPopupPoint.y}}>
      <button className="tv-event-popup-close" onClick={()=>{setSelectedMarketEvent(undefined);setEventPopupPoint(undefined)}}>×</button>
      <div className="tv-event-popup-head">
        <strong>{eventTitleRu(selectedMarketEvent)}</strong>
        <small>{eventShortLabel(selectedMarketEvent)} · {eventLevelId(selectedMarketEvent)}</small>
      </div>
      <div className="tv-event-popup-time">
        <span>Время · Time</span>
        <b>{new Date(selectedMarketEvent.timestamp).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'})}</b>
      </div>
      <div className="tv-event-popup-grid">
        <span><small>Зона · Zone</small><b>{eventLevelNameRu(selectedMarketEvent)}</b></span>
        <span><small>TF события</small><b>{selectedMarketEvent.timeframe}</b></span>
        <span><small>Уровень · Level</small><b>{payloadNumber(selectedMarketEvent,'levelPrice')!==undefined?fmtPrice(payloadNumber(selectedMarketEvent,'levelPrice')!):String(selectedMarketEvent.level)}</b></span>
        <span><small>Цена свечи · Close</small><b>{fmtPrice(selectedMarketEvent.price)}</b></span>
      </div>
      {payloadNumber(selectedMarketEvent,'sweepDepthPct')!==undefined&&<div className="tv-event-popup-metric"><span>Глубина снятия · Sweep depth</span><b>{payloadNumber(selectedMarketEvent,'sweepDepthPct')!.toFixed(4)}%</b></div>}
      <p>{selectedMarketEvent.explanation}</p>
      <div className="tv-event-popup-next"><small>ДАЛЬШЕ · NEXT</small><b>{selectedMarketEvent.nextExpected}</b></div>
    </div>}
    {selectedCandle&&<div className={'tv-ohlcv '+(pinnedTime?'pinned':'')}>
      <div><b>{new Date(selectedCandle.timestamp).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</b><span>{pinnedTime?'● ЗАФИКСИРОВАНО · PINNED':'CROSSHAIR'}</span></div>
      <div><span>O <b>{fmtPrice(selectedCandle.open)}</b></span><span>H <b>{fmtPrice(selectedCandle.high)}</b></span><span>L <b>{fmtPrice(selectedCandle.low)}</b></span><span>C <b>{fmtPrice(selectedCandle.close)}</b></span><span>V <b>{selectedCandle.volume.toLocaleString('en-US',{maximumFractionDigits:2})}</b></span></div>
    </div>}
    {loadingOlder&&<div className="tv-history-loading">← подгружаем старые свечи · loading history</div>}
  </div>;
}
