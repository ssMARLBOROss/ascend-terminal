import {useEffect,useState} from 'react';
import {FIVE,observeRadarTicker,parseRadar5mRows,parseRadarTickers,
  selectRadarUniverse,groupMove,type RadarObservation,type RadarTicker
} from './radarEngine';

export type RadarFeed={status:'loading'|'scanning'|'ready'|'error';
  rows:RadarObservation[];checked:number;total:number;updatedAt?:number;error?:string};

const EMPTY:RadarFeed={status:'loading',rows:[],checked:0,total:0};
function initial(t:RadarTicker):RadarObservation{
  return {...t,group:groupMove(t.change24h),stage:'NO DATA',
    direction:'NEUTRAL',reason:'Загрузка закрытых 5m свечей',
    zone:'UNAVAILABLE',integrity:'INCOMPLETE'};
}
/** Scans only chosen Bybit futures while the radar tab is mounted. */
export function useRadarScanner(limit:number,revision:number){
  const[state,setState]=useState<RadarFeed>(EMPTY);
  useEffect(()=>{
    const abort=new AbortController();
    let timer:number|undefined,active=false;
    const run=async()=>{
      if(abort.signal.aborted||active||document.visibilityState==='hidden')return;
      active=true;
      const scanTime=Date.now();
      setState(previous=>({...previous,status:'scanning',checked:0,error:undefined}));
      try{
        const response=await fetch('/market-api/v5/market/tickers?category=linear',{
          cache:'no-store',signal:abort.signal});
        if(!response.ok)throw Error('Bybit tickers HTTP '+response.status);
        const tickers=parseRadarTickers(await response.json());
        if(!tickers.length)throw Error('Биржа не вернула доступные USDT-пары');
        const chosen=selectRadarUniverse(tickers,limit);
        const pending=chosen.map(initial);
        if(!abort.signal.aborted)setState({
          status:'scanning',rows:pending,checked:0,total:chosen.length});
        const dayStart=Math.floor(scanTime/86400000)*86400000;
        const lastClosed=Math.floor(scanTime/FIVE)*FIVE-FIVE;
        let cursor=0,completed=0;
        const worker=async()=>{
          while(!abort.signal.aborted){
            const index=cursor++;
            if(index>=chosen.length)return;
            const ticker=chosen[index];
            let row:RadarObservation=initial(ticker);
            try{
              if(lastClosed>=dayStart){
                const qs=new URLSearchParams({category:'linear',symbol:ticker.symbol,
                  interval:'5',start:String(dayStart),end:String(lastClosed),limit:'300'});
                const res=await fetch('/market-api/v5/market/kline?'+qs.toString(),{
                  cache:'no-store',signal:abort.signal});
                if(!res.ok)throw Error('HTTP '+res.status);
                const bars=parseRadar5mRows(await res.json());
                row=observeRadarTicker(ticker,bars,scanTime);
              }else row={...row,stage:'BUILDING',
                reason:'Ожидание первого закрытого 5m бара нового UTC дня'};
            }catch{
              row={...row,stage:'NO DATA',
                reason:'Свечи Bybit недоступны · не выдаём сигнал'};
            }
            if(abort.signal.aborted)return;
            pending[index]=row;
            completed++;
            setState({status:'scanning',rows:[...pending],
              checked:completed,total:chosen.length});
          }
        };
        await Promise.all(Array.from({length:Math.min(4,chosen.length)},()=>worker()));
        if(!abort.signal.aborted)setState({
          status:'ready',rows:pending,checked:completed,total:chosen.length,
          updatedAt:Date.now()
        });
      }catch(err){
        if(!abort.signal.aborted)setState(previous=>({
          ...previous,status:'error',error:String((err as Error)?.message??err)
        }));
      }finally{
        active=false;
        if(!abort.signal.aborted)
          timer=window.setTimeout(()=>{void run()},120000);
      }
    };
    const onVisible=()=>{
      if(document.visibilityState!=='visible')return;
      if(timer!==undefined)window.clearTimeout(timer);
      if(!active)void run();
    };
    void run();
    document.addEventListener('visibilitychange',onVisible);
    return()=>{
      abort.abort();if(timer!==undefined)window.clearTimeout(timer);
      document.removeEventListener('visibilitychange',onVisible);
    };
  },[limit,revision]);
  return state;
}
