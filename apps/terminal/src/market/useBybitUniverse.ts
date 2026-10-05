import { useEffect, useState } from 'react';

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

export function useBybitUniverse(pollMs=5000){
  const[items,setItems]=useState<BybitTicker[]>([]);
  const[status,setStatus]=useState<'LOADING'|'LIVE'|'ERROR'>('LOADING');
  const[error,setError]=useState<string>();
  const[lastUpdate,setLastUpdate]=useState<number>();

  useEffect(()=>{
    let disposed=false;
    const load=async()=>{
      try{
        const res=await fetch('/market-api/v5/market/tickers?category=linear',{cache:'no-store'});
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
        setItems(next);setStatus('LIVE');setError(undefined);setLastUpdate(Date.now());
      }catch(err){
        if(disposed)return;
        setStatus('ERROR');setError(String((err as Error)?.message??err));
      }
    };
    load();
    const timer=window.setInterval(load,pollMs);
    return()=>{disposed=true;window.clearInterval(timer)};
  },[pollMs]);

  return{items,status,error,lastUpdate};
}
