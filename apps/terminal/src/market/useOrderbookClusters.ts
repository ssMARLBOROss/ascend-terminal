import {useEffect,useState} from 'react';

export type BookSide='bid'|'ask';
export type BookCluster={
  id:string;side:BookSide;
  low:number;high:number;center:number;
  notionalUsdt:number;orders:number;
};
export type OrderbookSnapshot={
  symbol:string;receivedAt:number;exchangeTime?:number;mid:number;
  levelsPerSide:number;clusters:BookCluster[];
};
type State={symbol:string;status:'loading'|'ready'|'error';snapshot?:OrderbookSnapshot};

/** Group visible resting limit orders into price buckets; NOT fills, stops, or liquidation data. */
export function summarizeOrderbook(
  body:unknown,symbol:string,receivedAt:number
):OrderbookSnapshot|undefined{
  const result=(body as any)?.result;
  if((body as any)?.retCode!==0||!result)return undefined;
  const rawB=result.b,rawA=result.a;
  if(!Array.isArray(rawB)||!Array.isArray(rawA)||!rawB.length||!rawA.length)return undefined;
  const bids=rawB.map((x:unknown)=>Array.isArray(x)?[Number(x[0]),Number(x[1])]:[NaN,NaN])
    .filter(([p,q]:number[])=>Number.isFinite(p)&&Number.isFinite(q)&&p>0&&q>0);
  const asks=rawA.map((x:unknown)=>Array.isArray(x)?[Number(x[0]),Number(x[1])]:[NaN,NaN])
    .filter(([p,q]:number[])=>Number.isFinite(p)&&Number.isFinite(q)&&p>0&&q>0);
  if(!bids.length||!asks.length)return undefined;
  const bestBid=Math.max(...bids.map(x=>x[0])),bestAsk=Math.min(...asks.map(x=>x[0]));
  if(bestAsk<bestBid||bestBid<=0)return undefined;
  const mid=(bestBid+bestAsk)/2;
  // 0.06% of reference price per bucket, displayed as ranges (not point predictions).
  const binWidth=mid*.0006;
  const build=(levels:number[][],side:BookSide):BookCluster[]=>{
    const buckets=new Map<number,{low:number;high:number;notional:number;orders:number}>();
    for(const [price,qty] of levels){
      const index=Math.floor(price/binWidth);
      const bin=buckets.get(index)||{low:price,high:price,notional:0,orders:0};
      bin.low=Math.min(bin.low,price);bin.high=Math.max(bin.high,price);
      bin.notional+=price*qty;bin.orders++;
      buckets.set(index,bin);
    }
    return [...buckets.entries()]
      .map(([i,b])=>({id:side+'-'+i,side,low:b.low,high:b.high,
        center:(b.low+b.high)/2,notionalUsdt:b.notional,orders:b.orders}))
      .sort((a,b)=>b.notionalUsdt-a.notionalUsdt)
      .slice(0,3);
  };
  const clusters=[...build(bids,'bid'),...build(asks,'ask')];
  const exchangeTime=Number(result.ts??(body as any).time);
  return {symbol,receivedAt,exchangeTime:Number.isFinite(exchangeTime)?exchangeTime:undefined,
    mid,levelsPerSide:Math.min(bids.length,asks.length),clusters};
}

/** Poll selected pair only. A snapshot is dropped if stale, invalid, or unavailable. */
export function useOrderbookClusters(symbol:string,enabled:boolean){
  const[state,setState]=useState<State>({symbol,status:'loading'});
  useEffect(()=>{
    if(!enabled){setState({symbol,status:'loading'});return}
    const abort=new AbortController();
    let next:number|undefined,busy=false;
    const load=async()=>{
      if(abort.signal.aborted||busy||document.visibilityState==='hidden')return;
      busy=true;
      try{
        const qs=new URLSearchParams({category:'linear',symbol,limit:'200'});
        const res=await fetch('/market-api/v5/market/orderbook?'+qs,{cache:'no-store',signal:abort.signal});
        if(!res.ok)throw Error('Bybit orderbook HTTP '+res.status);
        const json=await res.json();
        const snapshot=summarizeOrderbook(json,symbol,Date.now());
        if(!snapshot)throw Error('Incomplete Bybit orderbook');
        if(!abort.signal.aborted)setState({symbol,status:'ready',snapshot});
      }catch{
        if(!abort.signal.aborted)setState({symbol,status:'error'});
      }finally{
        busy=false;
        if(!abort.signal.aborted)next=window.setTimeout(()=>{void load()},20000);
      }
    };
    const onVisible=()=>{
      if(document.visibilityState!=='visible')return;
      if(next!==undefined)window.clearTimeout(next);
      void load();
    };
    setState({symbol,status:'loading'});
    document.addEventListener('visibilitychange',onVisible);
    void load();
    return()=>{
      abort.abort();
      if(next!==undefined)window.clearTimeout(next);
      document.removeEventListener('visibilitychange',onVisible);
    };
  },[symbol,enabled]);
  return state.symbol===symbol&&enabled?state:{symbol,status:'loading' as const};
}
