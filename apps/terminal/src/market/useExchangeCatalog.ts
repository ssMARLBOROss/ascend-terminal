import {useEffect,useState} from 'react';
import {loadBybitCatalog,loadMexcCatalog,type FuturesContract,
  type FuturesExchange} from './exchangeCatalog';

type CatalogState={exchange:FuturesExchange;status:'loading'|'ready'|'error';
  contracts:FuturesContract[];updatedAt?:number;error?:string};
const TTL=10*60*1000;
const cache=new Map<FuturesExchange,CatalogState>();

export function useExchangeCatalog(exchange:FuturesExchange){
  const [state,setState]=useState<CatalogState>({exchange,status:'loading',contracts:[]});
  const [revision,setRevision]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();
    let timer:number|undefined;
    const cached=cache.get(exchange);
    if(cached)setState(cached);
    else setState({exchange,status:'loading',contracts:[]});
    const refresh=async()=>{
      const known=cache.get(exchange);
      if(known?.status==='ready'&&known.updatedAt&&
        Date.now()-known.updatedAt<TTL&&revision===0){
        setState(known);return;
      }
      try{
        const contracts=exchange==='BYBIT'?
          await loadBybitCatalog(fetch,controller.signal):
          await loadMexcCatalog(fetch,controller.signal);
        if(controller.signal.aborted)return;
        const result:CatalogState={exchange,status:'ready',contracts,updatedAt:Date.now()};
        cache.set(exchange,result);setState(result);
      }catch(error){
        if(controller.signal.aborted)return;
        // Preserve previously retrieved instruments, marked stale, while
        // explicitly exposing the fetch error. Never fabricate new listings.
        setState({exchange,status:'error',contracts:known?.contracts??[],
          updatedAt:known?.updatedAt,error:String((error as Error).message??error)});
      }
    };
    void refresh();
    timer=window.setInterval(()=>{void refresh()},TTL);
    return()=>{controller.abort();if(timer!==undefined)window.clearInterval(timer)};
  },[exchange,revision]);
  return {
    ...((state.exchange===exchange)?state:{
      exchange,status:'loading' as const,contracts:[] as FuturesContract[]
    }),
    retry:()=>setRevision(x=>x+1)
  };
}
