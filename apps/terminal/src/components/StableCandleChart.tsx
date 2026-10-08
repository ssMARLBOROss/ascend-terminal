import {useEffect,useRef} from 'react';
import {
  ColorType,CrosshairMode,LineStyle,createChart,
  type IChartApi,type ISeriesApi,type UTCTimestamp
} from 'lightweight-charts';
import type {Candle} from '@ascend/contracts';
import type {PreviousDayLevels} from '../market/usePreviousDayLevels';
import type {PreviousSessionLevels} from '../market/usePreviousSessionLevels';
import type {DailyVwap} from '../market/useDailyVwap';
import SessionClock from './SessionClock';
import {drawSessionBands} from './drawSessionBands';

type Snapshot={first?:number;last?:number;length:number};

/** Bounded session canvas only; no indicator computations or extra market subscriptions. */
export default function StableCandleChart({candles,timeframe,previousDay,previousSessions,dailyVwap}:{
  candles:Candle[];timeframe:string;previousDay?:PreviousDayLevels;
  previousSessions?:PreviousSessionLevels;dailyVwap?:DailyVwap;
}){
  const hostRef=useRef<HTMLDivElement|null>(null);
  const overlayRef=useRef<HTMLCanvasElement|null>(null);
  const candlesRef=useRef(candles);
  const redrawRef=useRef<()=>void>(()=>{});
  candlesRef.current=candles;
  const chartRef=useRef<IChartApi|null>(null);
  const priceRef=useRef<ISeriesApi<'Candlestick'>|null>(null);
  const volumeRef=useRef<ISeriesApi<'Histogram'>|null>(null);
  const vwapRef=useRef<ISeriesApi<'Line'>|null>(null);
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
    vwapRef.current=chart.addLineSeries({
      color:'#f4d35e',lineWidth:3,lineStyle:LineStyle.Solid,
      priceScaleId:'right',priceLineVisible:false,lastValueVisible:true,
      crosshairMarkerVisible:true,title:'VWAP UTC'
    });
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
      vwapRef.current=null;
      snapshotRef.current={length:0};
      chart.remove();
    };
  },[timeframe]);

  // Project independently sourced 5m VWAP onto existing chart timestamps.
  // Do not add extra 5m timestamps to the shared time axis (no candle spacing shift).
  useEffect(()=>{
    const line=vwapRef.current;
    if(!line)return;
    if(!dailyVwap||!candles.length||timeframe==='1D'){
      line.setData([]);
      return;
    }
    const intervalMs:Record<string,number>={
      '1m':60000,'3m':180000,'5m':300000,'15m':900000,
      '30m':1800000,'1H':3600000,'4H':14400000
    };
    const candleMs=intervalMs[timeframe];
    if(!candleMs){line.setData([]);return}
    const source=dailyVwap.points;
    const result:{time:UTCTimestamp;value:number}[]=[];
    const latestTs=candles[candles.length-1].timestamp;
    let index=0,lastClosed:number|undefined;
    for(const bar of candles){
      if(bar.timestamp<dailyVwap.dayStartUtc)continue;
      const barEnd=bar.timestamp+candleMs;
      while(index<source.length&&source[index].closed&&source[index].timestamp+300000<=barEnd){
        lastClosed=source[index].value;
        index++;
      }
      let value=lastClosed;
      // The latest candle may use the live, unfinished 5m snapshot, but
      // historical candles never receive the future volume of that 5m bar.
      const partial=source[source.length-1];
      if(bar.timestamp===latestTs&&partial&&!partial.closed&&
        dailyVwap.updatedAt>=bar.timestamp&&partial.timestamp<=dailyVwap.updatedAt){
        value=partial.value;
      }
      if(value!==undefined&&Number.isFinite(value))result.push({
        time:Math.floor(bar.timestamp/1000) as UTCTimestamp,value
      });
    }
    line.setData(result);
  },[dailyVwap,timeframe,candles.length,candles[0]?.timestamp,candles[candles.length-1]?.timestamp]);

  // Price lines live on the chart series; update only when the previous UTC day changes.
  useEffect(()=>{
    const series=priceRef.current;
    if(!series||!previousDay)return;
    const highLine=series.createPriceLine({
      price:previousDay.high,color:'#2fd46f',lineWidth:4,
      lineStyle:LineStyle.Solid,axisLabelVisible:true,title:'YH'
    });
    const lowLine=series.createPriceLine({
      price:previousDay.low,color:'#ff4d57',lineWidth:4,
      lineStyle:LineStyle.Solid,axisLabelVisible:true,title:'YL'
    });
    return()=>{
      series.removePriceLine(highLine);
      series.removePriceLine(lowLine);
    };
  },[previousDay]);

  // Yesterday's 3 session ranges are frozen lines: no recalculation on ticks.
  // Original YH/YL remain 4px solid; session levels are 2px dashed.
  useEffect(()=>{
    const series=priceRef.current;
    if(!series||!previousSessions)return;
    const abbreviations:Record<string,string>={ASIA:'AS',LONDON:'LD',NEW_YORK:'NY'};
    const lines=previousSessions.sessions.flatMap(session=>{
      const code=abbreviations[session.id]??session.id;
      return [
        series.createPriceLine({
          price:session.high,color:'#25ac67',lineWidth:2,
          lineStyle:LineStyle.Dashed,axisLabelVisible:true,title:code+'-H'
        }),
        series.createPriceLine({
          price:session.low,color:'#d65060',lineWidth:2,
          lineStyle:LineStyle.Dashed,axisLabelVisible:true,title:code+'-L'
        })
      ];
    });
    return()=>{for(const line of lines)series.removePriceLine(line)};
  },[previousSessions]);

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
    <div className="asc-lite-chart-host" ref={hostRef} role="img" aria-label="Живой свечной график Bybit с объёмом, дневным VWAP, уровнями и зонами сессий"/>
    <canvas className="asc-lite-session-canvas" ref={overlayRef} aria-hidden="true"/>
    <SessionClock embedded/>
    {timeframe==='1D'&&<span className="asc-session-daily-note">Сессионные зоны по часам показаны на таймфреймах до 4H</span>}
  </div>;
}
