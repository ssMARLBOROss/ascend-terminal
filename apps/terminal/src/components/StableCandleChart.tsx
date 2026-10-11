import {useEffect,useMemo,useRef} from 'react';
import {
  ColorType,CrosshairMode,LineStyle,createChart,
  type IChartApi,type ISeriesApi,type UTCTimestamp
} from 'lightweight-charts';
import type {Candle} from '@ascend/contracts';
import type {PreviousDayLevels} from '../market/usePreviousDayLevels';
import type {PreviousSessionLevels} from '../market/usePreviousSessionLevels';
import type {DailyVwap} from '../market/useDailyVwap';
import type {OrderbookSnapshot} from '../market/useOrderbookClusters';
import type {TpoProfile} from '../market/useLiveMarketMetrics';
import {drawLiquidityOverlay,estimateStopZones} from './drawLiquidityOverlay';
import {drawFvgOverlay,type FvgAppearance} from './fvgOverlay';
import {drawLiquidityMap} from './drawLiquidityMap';
import type {LiquidityMap} from '../market/liquidityMapEngine';
import type {FvgRecord} from '../market/fvgContextEngine';
import SessionClock from './SessionClock';
import {drawSessionBands} from './drawSessionBands';
import {initialChartRange,tightCandlestickRange,TIGHT_FOCUS_BARS,type ChartViewMode} from './chartViewport';

type Snapshot={first?:number;last?:number;length:number};
type BaseAutoscale=()=>({priceRange:{minValue:number;maxValue:number}}|null);

/** Bounded session canvas only; no indicator computations or extra market subscriptions. */
export default function StableCandleChart({candles,timeframe,previousDay,previousSessions,dailyVwap,orderbook,showBook,showStops,tpo,showTpo,fvgZones,showFvg,fvgAppearance,focusRequest,viewMode,showVolume,showVwap,showSessions,showSessionClock,showDayLevels,showSessionLevels,liquidityMap}:{
  candles:Candle[];timeframe:string;previousDay?:PreviousDayLevels;
  previousSessions?:PreviousSessionLevels;dailyVwap?:DailyVwap;
  orderbook?:OrderbookSnapshot;showBook:boolean;showStops:boolean;
  tpo?:TpoProfile;showTpo:boolean;fvgZones:FvgRecord[];showFvg:boolean;
  fvgAppearance:FvgAppearance;
  focusRequest:number;viewMode:ChartViewMode;
  showVolume:boolean;showVwap:boolean;showSessions:boolean;showSessionClock:boolean;
  showDayLevels:boolean;showSessionLevels:boolean;
  liquidityMap?:LiquidityMap;
}){
  const hostRef=useRef<HTMLDivElement|null>(null);
  const overlayRef=useRef<HTMLCanvasElement|null>(null);
  const liquidityOverlayRef=useRef<HTMLCanvasElement|null>(null);
  const fvgOverlayRef=useRef<HTMLCanvasElement|null>(null);
  const liquidityMapRef=useRef<HTMLCanvasElement|null>(null);
  const liquidityMapValueRef=useRef(liquidityMap);
  liquidityMapValueRef.current=liquidityMap;
  const stopZones=useMemo(()=>estimateStopZones(previousDay,previousSessions),[previousDay,previousSessions]);
  const liquidityViewRef=useRef({orderbook,showBook,showStops,stopZones,tpo,showTpo});
  liquidityViewRef.current={orderbook,showBook,showStops,stopZones,tpo,showTpo};
  const fvgViewRef=useRef({fvgZones,showFvg,fvgAppearance});
  fvgViewRef.current={fvgZones,showFvg,fvgAppearance};
  const sessionsVisibleRef=useRef(showSessions);
  sessionsVisibleRef.current=showSessions;
  const viewModeRef=useRef(viewMode);
  viewModeRef.current=viewMode;
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
      rightPriceScale:{borderColor:'#1d4055',autoScale:true,scaleMargins:{top:.065,bottom:.13}},
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
      wickUpColor:'#64d1b1',wickDownColor:'#ef8a99',
      autoscaleInfoProvider:(original:BaseAutoscale)=>{
        if(viewModeRef.current!=='TIGHT')return original();
        const window=tightCandlestickRange(candlesRef.current,
          chart.timeScale().getVisibleLogicalRange(),
          TIGHT_FOCUS_BARS[timeframe]??115);
        return window?{priceRange:window}:original();
      }
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
      crosshairMarkerVisible:true,title:'VWAP UTC',
      // The line remains at the ACTUAL VWAP price. In TIGHT, only it is
      // excluded from autoscale so remote context never compresses candles.
      autoscaleInfoProvider:(original:BaseAutoscale)=>
        viewModeRef.current==='TIGHT'?null:original()
    });
    snapshotRef.current={length:0};

    // Coalesce pan/zoom/resize and live-candle requests into one canvas frame.
    let overlayFrame:number|undefined;
    const scheduleOverlay=()=>{
      if(overlayFrame!==undefined)return;
      overlayFrame=window.requestAnimationFrame(()=>{
        overlayFrame=undefined;
        if(chartRef.current!==chart||!overlayRef.current)return;
        drawSessionBands(chart,host,overlayRef.current,candlesRef.current,timeframe,
          sessionsVisibleRef.current);
        if(priceRef.current&&liquidityOverlayRef.current){
          const view=liquidityViewRef.current;
          drawLiquidityOverlay(chart,priceRef.current,host,liquidityOverlayRef.current,
            view.orderbook,view.stopZones,view.showBook,view.showStops,view.tpo,view.showTpo);
        }
        if(priceRef.current&&fvgOverlayRef.current){
          const view=fvgViewRef.current;
          drawFvgOverlay(chart,priceRef.current,host,fvgOverlayRef.current,
            candlesRef.current,timeframe,view.fvgZones,view.showFvg,view.fvgAppearance);
        }
        if(priceRef.current&&liquidityMapRef.current){
          drawLiquidityMap(chart,priceRef.current,host,liquidityMapRef.current,
            liquidityMapValueRef.current);
        }
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

  // Book snapshots and frozen historical reference zones redraw only the overlay.
  // No candle updates, zoom reset, or new chart subscriptions.
  useEffect(()=>{redrawRef.current()},[orderbook,showBook,showStops,stopZones,tpo,showTpo,fvgZones,showFvg,fvgAppearance,liquidityMap]);

  // User-controlled recenter. Does not reset pan/zoom on subsequent live ticks.
  useEffect(()=>{
    if(focusRequest===0)return;
    const chart=chartRef.current;
    const length=candlesRef.current.length;
    if(!chart||length<1)return;
    const range=initialChartRange(timeframe,length,viewMode);
    if(range)chart.timeScale().setVisibleLogicalRange(range);
    priceRef.current?.priceScale().applyOptions({autoScale:true});
    redrawRef.current();
  },[focusRequest]);
  // Explicit mode switch: zoom to recent action (TIGHT) or chart history (FULL).
  // Live candles, order-book polls and overlays never reset user pan/zoom.
  useEffect(()=>{
    const chart=chartRef.current;
    const length=candlesRef.current.length;
    if(!chart||length<20)return;
    const range=initialChartRange(timeframe,length,viewMode);
    if(range)chart.timeScale().setVisibleLogicalRange(range);
    chart.priceScale('right').applyOptions({
      autoScale:true,scaleMargins:viewMode==='TIGHT'?
        {top:.065,bottom:.13}:{top:.08,bottom:.18}
    });
    redrawRef.current();
  },[viewMode,timeframe]);

  // Display switches affect only chart series/overlays, never source data or trade rules.
  useEffect(()=>{
    volumeRef.current?.applyOptions({visible:showVolume});
  },[showVolume,timeframe]);
  useEffect(()=>{redrawRef.current()},[showSessions]);

  // Rolling price-based TPO profile: never modifies or gates ASCEND Core entries.
  // Visually distinct from green/red YH/YL and the golden VWAP.
  useEffect(()=>{
    const series=priceRef.current;
    if(!series||!showTpo||!tpo)return;
    const lines=[
      series.createPriceLine({price:tpo.poc,color:'#cf9af2',lineWidth:2,
        lineStyle:LineStyle.Solid,axisLabelVisible:true,title:'TPO POC'}),
      series.createPriceLine({price:tpo.vah,color:'#b8a4ed',lineWidth:1,
        lineStyle:LineStyle.Dotted,axisLabelVisible:true,title:'VAH'}),
      series.createPriceLine({price:tpo.val,color:'#b8a4ed',lineWidth:1,
        lineStyle:LineStyle.Dotted,axisLabelVisible:true,title:'VAL'})
    ];
    return()=>{for(const line of lines)series.removePriceLine(line)};
  },[tpo,showTpo]);

  // Project independently sourced 5m VWAP onto existing chart timestamps.
  // Do not add extra 5m timestamps to the shared time axis (no candle spacing shift).
  useEffect(()=>{
    const line=vwapRef.current;
    if(!line)return;
    if(!showVwap||!dailyVwap||!candles.length||timeframe==='1D'){
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
  },[showVwap,dailyVwap,timeframe,candles.length,candles[0]?.timestamp,candles[candles.length-1]?.timestamp]);

  // Price lines live on the chart series; update only when the previous UTC day changes.
  useEffect(()=>{
    const series=priceRef.current;
    if(!series||!showDayLevels||!previousDay)return;
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
  },[previousDay,showDayLevels]);

  // Yesterday's 3 session ranges are frozen lines: no recalculation on ticks.
  // Original YH/YL remain 4px solid; session levels are 2px dashed.
  useEffect(()=>{
    const series=priceRef.current;
    if(!series||!showSessionLevels||!previousSessions)return;
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
  },[previousSessions,showSessionLevels]);

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
      const range=initialChartRange(timeframe,candles.length,viewModeRef.current);
      if(range)chart.timeScale().setVisibleLogicalRange(range);
    }
    snapshotRef.current={first,last,length:candles.length};
    redrawRef.current();
  },[candles]);

  return <div className="asc-lite-chart-stage">
    <div className="asc-lite-chart-host" ref={hostRef} role="img" aria-label="Свечной график Bybit с VWAP, историческими уровнями и двумя раздельными слоями ликвидности"/>
    <canvas className="asc-lite-session-canvas" ref={overlayRef} aria-hidden="true"/>
    <canvas className="asc-lite-liquidity-canvas" ref={liquidityOverlayRef} aria-hidden="true"/>
    <canvas className="asc-lite-fvg-canvas" ref={fvgOverlayRef} aria-hidden="true"/>
    <canvas className="asc-lite-map-canvas" ref={liquidityMapRef} aria-hidden="true"/>
    {showSessionClock&&<SessionClock embedded/>}
    {showSessions&&timeframe==='1D'&&<span className="asc-session-daily-note">Сессионные зоны по часам показаны на таймфреймах до 4H</span>}
  </div>;
}
