import {useEffect,useRef} from 'react';
import {
  ColorType,CrosshairMode,createChart,
  type IChartApi,type ISeriesApi,type UTCTimestamp
} from 'lightweight-charts';
import type {Candle} from '@ascend/contracts';
import SessionClock from './SessionClock';
import {drawSessionBands} from './drawSessionBands';

type Snapshot={first?:number;last?:number;length:number};

/** Bounded session canvas only; no indicator computations or extra market subscriptions. */
export default function StableCandleChart({candles,timeframe}:{candles:Candle[];timeframe:string}){
  const hostRef=useRef<HTMLDivElement|null>(null);
  const overlayRef=useRef<HTMLCanvasElement|null>(null);
  const candlesRef=useRef(candles);
  const redrawRef=useRef<()=>void>(()=>{});
  candlesRef.current=candles;
  const chartRef=useRef<IChartApi|null>(null);
  const priceRef=useRef<ISeriesApi<'Candlestick'>|null>(null);
  const volumeRef=useRef<ISeriesApi<'Histogram'>|null>(null);
  const snapshotRef=useRef<Snapshot>({length:0});

  useEffect(()=>{
    const host=hostRef.current;
    if(!host)return;
    const chart=createChart(host,{
      width:Math.max(1,host.clientWidth),
      height:Math.max(1,host.clientHeight),
      layout:{
        background:{type:ColorType.Solid,color:'#07121c'},
        textColor:'#d6e4ed',fontFamily:'Inter,system-ui,sans-serif',fontSize:14
      },
      grid:{
        vertLines:{color:'rgba(40,74,95,.24)'},
        horzLines:{color:'rgba(40,74,95,.3)'}
      },
      rightPriceScale:{borderColor:'#1d4055',scaleMargins:{top:.08,bottom:.22}},
      timeScale:{
        borderColor:'#1d4055',timeVisible:true,secondsVisible:false,
        rightOffset:6,barSpacing:7,minBarSpacing:2
      },
      crosshair:{mode:CrosshairMode.Normal},
      localization:{locale:'ru-RU'}
    });
    chartRef.current=chart;
    priceRef.current=chart.addCandlestickSeries({
      upColor:'#29b991',downColor:'#df6b7d',
      borderUpColor:'#29b991',borderDownColor:'#df6b7d',
      wickUpColor:'#64d1b1',wickDownColor:'#ef8a99'
    });
    const volume=chart.addHistogramSeries({
      priceFormat:{type:'volume'},priceScaleId:'volume',
      lastValueVisible:false,priceLineVisible:false
    });
    volume.priceScale().applyOptions({scaleMargins:{top:.81,bottom:0}});
    volumeRef.current=volume;
    snapshotRef.current={length:0};

    // Coalesce pan/zoom/resize and live-candle requests into one canvas frame.
    let overlayFrame:number|undefined;
    const scheduleOverlay=()=>{
      if(overlayFrame!==undefined)return;
      overlayFrame=window.requestAnimationFrame(()=>{
        overlayFrame=undefined;
        if(chartRef.current!==chart||!overlayRef.current)return;
        drawSessionBands(chart,host,overlayRef.current,candlesRef.current,timeframe);
      });
    };
    redrawRef.current=scheduleOverlay;
    chart.timeScale().subscribeVisibleLogicalRangeChange(scheduleOverlay);
    const resize=new ResizeObserver(()=>{
      if(chartRef.current!==chart)return;
      const width=host.clientWidth,height=host.clientHeight;
      if(width>0&&height>0){
        chart.applyOptions({width,height});
        scheduleOverlay();
      }
    });
    resize.observe(host);
    scheduleOverlay();
    return()=>{
      resize.disconnect();
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(scheduleOverlay);
      if(overlayFrame!==undefined)window.cancelAnimationFrame(overlayFrame);
      redrawRef.current=()=>{};
      chartRef.current=null;
      priceRef.current=null;
      volumeRef.current=null;
      snapshotRef.current={length:0};
      chart.remove();
    };
  },[timeframe]);

  useEffect(()=>{
    const chart=chartRef.current;
    const price=priceRef.current;
    const volume=volumeRef.current;
    if(!chart||!price||!volume||!candles.length)return;

    const previous=snapshotRef.current;
    const first=candles[0].timestamp;
    const last=candles[candles.length-1].timestamp;
    const fullRefresh=
      previous.length===0||
      first!==previous.first||
      candles.length<previous.length||
      candles.length>previous.length+1||
      (previous.last!==undefined&&last<previous.last);

    if(fullRefresh){
      price.setData(candles.map(c=>({
        time:Math.floor(c.timestamp/1000) as UTCTimestamp,
        open:c.open,high:c.high,low:c.low,close:c.close
      })));
      volume.setData(candles.map(c=>({
        time:Math.floor(c.timestamp/1000) as UTCTimestamp,
        value:c.volume,
        color:c.close>=c.open?'rgba(41,185,145,.32)':'rgba(223,107,125,.32)'
      })));
    }else{
      const c=candles[candles.length-1];
      const time=Math.floor(c.timestamp/1000) as UTCTimestamp;
      price.update({time,open:c.open,high:c.high,low:c.low,close:c.close});
      volume.update({
        time,value:c.volume,
        color:c.close>=c.open?'rgba(41,185,145,.32)':'rgba(223,107,125,.32)'
      });
    }
    // Set the initial viewport only once history is sufficiently populated.
    // Never force a viewport on live ticks, so user pan/zoom remains untouched.
    if(previous.length<20&&candles.length>=20){
      const from=Math.max(0,candles.length-110);
      chart.timeScale().setVisibleLogicalRange({from,to:candles.length+5});
    }
    snapshotRef.current={first,last,length:candles.length};
    redrawRef.current();
  },[candles]);

  return <div className="asc-lite-chart-stage">
    <div className="asc-lite-chart-host" ref={hostRef} role="img" aria-label="Живой свечной график Bybit с объёмом и зонами сессий"/>
    <canvas className="asc-lite-session-canvas" ref={overlayRef} aria-hidden="true"/>
    <SessionClock embedded/>
    {timeframe==='1D'&&<span className="asc-session-daily-note">Сессионные зоны по часам показаны на таймфреймах до 4H</span>}
  </div>;
}
