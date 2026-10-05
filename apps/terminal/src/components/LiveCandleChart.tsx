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
import type {AscendTimeframe,Candle} from '@ascend/contracts';
import type {DisplayLevel} from '../market/engine';

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

const tfSeconds:Record<string,number>={
  '1m':60,'3m':180,'5m':300,'10m':600,'15m':900,'30m':1800,'45m':2700,
  '1H':3600,'2H':7200,'4H':14400,'6H':21600,'12H':43200,'1D':86400,'1W':604800,'1M':2592000
};

const fmtPrice=(v:number)=>{
  const a=Math.abs(v);
  return v.toLocaleString('en-US',{maximumFractionDigits:a>=1000?2:a>=1?4:a>=0.01?6:10});
};

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
  onLoadOlder,loadingOlder=false,hasOlder=true,focusTimestamp,focusNonce
}:ChartProps){
  const hostRef=useRef<HTMLDivElement|null>(null);
  const overlayRef=useRef<HTMLCanvasElement|null>(null);
  const chartRef=useRef<IChartApi|null>(null);
  const candleSeriesRef=useRef<ISeriesApi<'Candlestick'>|null>(null);
  const volumeSeriesRef=useRef<ISeriesApi<'Histogram'>|null>(null);
  const priceLinesRef=useRef<any[]>([]);
  const visibleTimeRef=useRef<any>(null);
  const autoLoadingRef=useRef(false);
  const drawOverlayRef=useRef<()=>void>(()=>{});
  const loadOlderRef=useRef(onLoadOlder);
  const loadingOlderRef=useRef(loadingOlder);
  const hasOlderRef=useRef(hasOlder);
  const [hoverTime,setHoverTime]=useState<number>();
  const [pinnedTime,setPinnedTime]=useState<number>();
  const [interactionHint,setInteractionHint]=useState('Перетаскивай график мышью · колесо = zoom');

  const sessions=useMemo(()=>buildSessions(candles),[candles]);
  const candleBySecond=useMemo(()=>{
    const map=new Map<number,Candle>();
    candles.forEach(c=>map.set(Math.floor(c.timestamp/1000),c));
    return map;
  },[candles]);
  useEffect(()=>{loadOlderRef.current=onLoadOlder},[onLoadOlder]);
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
      ctx.fillStyle='rgba(167,194,208,.78)';
      ctx.fillText(new Date(day).toLocaleDateString('ru-RU',{day:'2-digit',month:'short'}).toUpperCase(),x+5,13);
    }
    ctx.restore();

    // Session backgrounds and balance zones.
    for(const session of sessions){
      const def=sessionDefs.find(x=>x.name===session.name)!;
      const x1=timeScale.timeToCoordinate(Math.floor(session.first/1000) as UTCTimestamp);
      const x2raw=timeScale.timeToCoordinate(Math.floor(session.last/1000) as UTCTimestamp);
      if(x1===null||x2raw===null)continue;
      const step=Math.max(4,Math.abs(x2raw-x1)/Math.max(1,candles.filter(c=>c.timestamp>=session.first&&c.timestamp<=session.last).length-1));
      const x2=x2raw+step;
      if(x2<0||x1>rect.width)continue;

      ctx.fillStyle=def.fill;
      ctx.fillRect(x1,0,Math.max(2,x2-x1),plotBottom);
      ctx.strokeStyle=def.line;
      ctx.setLineDash([2,4]);
      ctx.beginPath();ctx.moveTo(x1,0);ctx.lineTo(x1,plotBottom);ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle=session.status==='LIVE'?'rgba(203,232,240,.88)':'rgba(105,132,147,.68)';
      ctx.font='700 8px Inter,system-ui,sans-serif';
      ctx.fillText(`${session.name} · ${session.status}`,x1+5,27);

      const yh=series.priceToCoordinate(session.high);
      const yl=series.priceToCoordinate(session.low);
      const ym=series.priceToCoordinate(session.mid);
      if(yh===null||yl===null||ym===null)continue;
      const top=Math.min(yh,yl),height=Math.abs(yl-yh);
      if(top>plotBottom||top+height<0)continue;

      ctx.fillStyle=session.status==='LIVE'?'rgba(38,180,157,.045)':'rgba(89,116,132,.035)';
      ctx.strokeStyle=session.status==='LIVE'?'rgba(72,207,179,.34)':'rgba(115,143,158,.22)';
      ctx.setLineDash(session.status==='LIVE'?[5,4]:[3,5]);
      ctx.fillRect(x1,top,Math.max(2,x2-x1),height);
      ctx.strokeRect(x1,top,Math.max(2,x2-x1),height);
      ctx.setLineDash([4,5]);
      ctx.strokeStyle=session.status==='LIVE'?'rgba(91,222,195,.46)':'rgba(129,153,164,.28)';
      ctx.beginPath();ctx.moveTo(x1,ym);ctx.lineTo(x2,ym);ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle=session.status==='LIVE'?'rgba(150,236,216,.9)':'rgba(133,157,168,.72)';
      ctx.font='600 7px Inter,system-ui,sans-serif';
      ctx.fillText(`BALANCE · ${session.status} · H ${fmtPrice(session.high)} · M ${fmtPrice(session.mid)} · L ${fmtPrice(session.low)}`,x1+5,Math.max(42,top+12));
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
  },[candles,pinnedTime,sessions]);
  drawOverlayRef.current=drawOverlay;

  useEffect(()=>{
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
      if(!param?.time||pinnedTime)return;
      const sec=typeof param.time==='number'?param.time:undefined;
      if(sec)setHoverTime(sec*1000);
    };
    const click=(param:any)=>{
      if(!param?.time)return;
      const sec=typeof param.time==='number'?param.time:undefined;
      if(!sec)return;
      setPinnedTime(prev=>prev===sec*1000?undefined:sec*1000);
      setHoverTime(sec*1000);
    };
    const visible=(range:any)=>{
      visibleTimeRef.current=chart.timeScale().getVisibleRange();
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
    const previousRange=visibleTimeRef.current;
    const candleData=candles.map(c=>({time:Math.floor(c.timestamp/1000) as UTCTimestamp,open:c.open,high:c.high,low:c.low,close:c.close}));
    const volumeData=candles.map(c=>({time:Math.floor(c.timestamp/1000) as UTCTimestamp,value:c.volume,color:c.close>=c.open?'rgba(45,190,148,.28)':'rgba(214,86,105,.28)'}));
    series.setData(candleData);
    volume.setData(volumeData);
    if(previousRange){
      try{chart.timeScale().setVisibleRange(previousRange)}catch{}
    }else{
      const from=Math.max(0,candles.length-windowSize);
      chart.timeScale().setVisibleLogicalRange({from,to:candles.length-1+6});
    }
    requestAnimationFrame(drawOverlay);
  },[candles,drawOverlay,windowSize]);

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
        axisLabelVisible:true,
        title:`${level.label} · ${level.status}`
      }));
    }
    requestAnimationFrame(drawOverlay);
  },[levels,candles,drawOverlay]);

  useEffect(()=>{requestAnimationFrame(drawOverlay)},[drawOverlay]);

  useEffect(()=>{
    const chart=chartRef.current;
    if(!chart||!focusTimestamp||!candles.length)return;
    const step=tfSeconds[timeframe]??900;
    const center=Math.floor(focusTimestamp/1000);
    const half=Math.max(step*18,step*Math.min(windowSize,120)/2);
    try{
      chart.timeScale().setVisibleRange({from:(center-half) as UTCTimestamp,to:(center+half) as UTCTimestamp});
      setPinnedTime(focusTimestamp);
    }catch{}
    requestAnimationFrame(drawOverlay);
  },[focusTimestamp,focusNonce,timeframe,windowSize,candles.length,drawOverlay]);

  useEffect(()=>{
    const chart=chartRef.current;
    if(!chart||!candles.length)return;
    const from=Math.max(0,candles.length-windowSize);
    try{chart.timeScale().setVisibleLogicalRange({from,to:candles.length-1+6})}catch{}
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
    const from=Math.max(0,candles.length-windowSize);
    chart.timeScale().setVisibleLogicalRange({from,to:candles.length-1+6});
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
      <button type="button" onClick={()=>{setPinnedTime(undefined);setHoverTime(undefined)}}>СБРОС КУРСОРА</button>
    </div>
    <div className="tv-chart-hint">{interactionHint}</div>
    {selectedCandle&&<div className={'tv-ohlcv '+(pinnedTime?'pinned':'')}>
      <div><b>{new Date(selectedCandle.timestamp).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</b><span>{pinnedTime?'● ЗАФИКСИРОВАНО · PINNED':'CROSSHAIR'}</span></div>
      <div><span>O <b>{fmtPrice(selectedCandle.open)}</b></span><span>H <b>{fmtPrice(selectedCandle.high)}</b></span><span>L <b>{fmtPrice(selectedCandle.low)}</b></span><span>C <b>{fmtPrice(selectedCandle.close)}</b></span><span>V <b>{selectedCandle.volume.toLocaleString('en-US',{maximumFractionDigits:2})}</b></span></div>
    </div>}
    {loadingOlder&&<div className="tv-history-loading">← подгружаем старые свечи · loading history</div>}
  </div>;
}
