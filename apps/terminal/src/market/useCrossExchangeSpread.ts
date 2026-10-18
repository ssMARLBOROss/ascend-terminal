import {useEffect,useState} from 'react';
import {calculateCrossSpread,parseBybitTicker,parseMexcTicker,toMexcSymbol,
  type CrossSpread} from './crossExchangeSpread';

/** Fresh public top-of-book quotes only. No order placement or account access. */
export function useCrossExchangeSpread(symbol:string,enabled=true){
  const empty:CrossSpread={status:'NO_DATA',symbol,reason:'Загрузка котировок'};
  const [state,setState]=useState<{symbol:string;value:CrossSpread;checkedAt:number}>({
    symbol,value:empty,checkedAt:0
  });
  useEffect(()=>{
    if(!enabled)return;
    const controller=new AbortController();
    let timer:number|undefined,running=false,disposed=false;
    const mexc=toMexcSymbol(symbol);
    const load=async()=>{
      if(disposed||running||document.visibilityState==='hidden')return;
      running=true;
      try{
        if(!mexc)throw Error('Нет совместимого USDT-контракта');
        const [bybit,mexcResponse]=await Promise.all([
          fetch('/market-api/v5/market/tickers?'+new URLSearchParams({
            category:'linear',symbol
          }),{signal:controller.signal,cache:'no-store'}),
          fetch('/mexc-market-api/api/v1/contract/ticker?'+new URLSearchParams({
            symbol:mexc
          }),{signal:controller.signal,cache:'no-store'})
        ]);
        if(!bybit.ok||!mexcResponse.ok)
          throw Error('Нет ответа Bybit/MEXC ('+bybit.status+'/'+mexcResponse.status+')');
        const [a,b]=await Promise.all([bybit.json(),mexcResponse.json()]);
        const receivedAt=Date.now(),first=parseBybitTicker(a,symbol,receivedAt),
          second=parseMexcTicker(b,mexc,receivedAt);
        const result=calculateCrossSpread({bybit:first,mexc:second,now:receivedAt});
        if(!disposed)setState({symbol,value:result,checkedAt:receivedAt});
      }catch(e){
        if(!disposed&&!controller.signal.aborted){
          const checkedAt=Date.now();
          setState({symbol,value:{status:'NO_DATA',symbol,
            reason:String((e as Error).message||'Не удалось получить Bid/Ask')},checkedAt});
        }
      }finally{running=false}
    };
    setState({symbol,value:{status:'NO_DATA',symbol,reason:'Загрузка котировок'},checkedAt:0});
    void load();
    timer=window.setInterval(()=>{void load()},12000);
    const visible=()=>{if(!document.hidden)void load()};
    document.addEventListener('visibilitychange',visible);
    return()=>{disposed=true;controller.abort();
      if(timer!==undefined)window.clearInterval(timer);
      document.removeEventListener('visibilitychange',visible)};
  },[symbol,enabled]);
  const fresh=state.symbol===symbol&&state.checkedAt>0&&Date.now()-state.checkedAt<30000;
  return fresh?state.value:{status:'NO_DATA' as const,symbol,
    reason:'Нет свежих синхронных котировок'};
}
