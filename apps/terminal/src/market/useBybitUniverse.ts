import { useEffect, useRef, useState } from 'react';

export type BybitTicker={
  symbol:string;
  lastPrice:number;
  change24hPct:number;
  high24h:number;
  low24h:number;
  volume24h:number;
  turnover24h:number;
  openInterest:number;
  fundingRate:number;
};

let cachedUniverse:BybitTicker[]=[];
let cachedUniverseAt=0;

export function useBybitUniverse(pollMs=5000){
  const[items,setItems]=useState<BybitTicker[]>(cachedUniverse);
  const[status,setStatus]=useState<'LOADING'|'LIVE'|'ERROR'>(cachedUniverse.length?'LIVE':'LOADING');
  const[error,setError]=useState<string>();
  const[lastUpdate,setLastUpdate]=useState<number>(cachedUniverseAt||undefined);
  const inFlightRef=useRef(false);
  const controllerRef=useRef<AbortController>();

  useEffect(()=>{
    let disposed=false;
    const load=async()=>{
      if(inFlightRef.current||document.hidden)return;
      inFlightRef.current=true;
      controllerRef.current?.abort();
      const controller=new AbortController();
      controllerRef.current=controller;
      const timeout=window.setTimeout(()=>controller.abort(),4000);
      try{
        const res=await fetch('/market-api/v5/market/tickers?category=linear',{cache:'no-store',signal:controller.signal});
        if(!res.ok)throw new Error('REST '+res.status);
        const json=await res.json();
        if(json?.retCode!==0||!Array.isArray(json?.result?.list))throw new Error(json?.retMsg||'Invalid ticker response');
        const next:BybitTicker[]=json.result.list
          .filter((x:any)=>typeof x.symbol==='string'&&x.symbol.endsWith('USDT'))
          .map((x:any)=>({
            symbol:x.symbol,
            lastPrice:Number(x.lastPrice),
            change24hPct:Number(x.price24hPcnt)*100,
            high24h:Number(x.highPrice24h),
            low24h:Number(x.lowPrice24h),
            volume24h:Number(x.volume24h),
            turnover24h:Number(x.turnover24h),
            openInterest:Number(x.openInterest),
            fundingRate:Number(x.fundingRate)
          }))
          .filter((x:BybitTicker)=>Number.isFinite(x.lastPrice));
        if(disposed)return;
        const now=Date.now();
        cachedUniverse=next;cachedUniverseAt=now;
        setItems(next);setStatus('LIVE');setError(undefined);setLastUpdate(now);
      }catch(err){
        if(disposed||(err as any)?.name==='AbortError')return;
        setStatus('ERROR');setError(String((err as Error)?.message??err));
      }finally{
        window.clearTimeout(timeout);
        if(controllerRef.current===controller)controllerRef.current=undefined;
        inFlightRef.current=false;
      }
    };
    if(!cachedUniverse.length||Date.now()-cachedUniverseAt>pollMs)void load();
    const timer=window.setInterval(()=>{void load()},pollMs);
    return()=>{
      disposed=true;
      window.clearInterval(timer);
      controllerRef.current?.abort();
      controllerRef.current=undefined;
      inFlightRef.current=false;
    };
  },[pollMs]);

  return{items,status,error,lastUpdate};
}
