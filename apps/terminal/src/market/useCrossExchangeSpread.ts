import {useEffect,useState} from 'react';
import {calculateCrossSpread,compareVenue,marketRequest,parseMarketQuote,
  type CrossSpread,type PlannedVenue} from './crossExchangeSpread';

/** Compare intended trade venue to Bybit (or MEXC when planned Bybit).
 * Separate from the Bybit/MEXC source chart. No fake fallback prices.
 */
export function useCrossExchangeSpread(symbol:string,plannedVenue:PlannedVenue,enabled=true):CrossSpread{
 const [state,setState]=useState<{key:string;value:CrossSpread;checkedAt:number}>({
  key:'',value:{status:'NO_DATA',symbol,plannedVenue,compareVenue:compareVenue(plannedVenue),
   reason:'Ожидаем котировки'},checkedAt:0
 });
 useEffect(()=>{
  if(!enabled)return;
  const controller=new AbortController();
  let timer:number|undefined,disposed=false,busy=false;
  const key=symbol+':'+plannedVenue;
  const partner=compareVenue(plannedVenue);
  const fail=(message:string)=>{
   if(!disposed)setState({key,checkedAt:Date.now(),
    value:{status:'NO_DATA',symbol,plannedVenue,compareVenue:partner,reason:message}});
  };
  const load=async()=>{
   if(disposed||busy||document.hidden)return;
   busy=true;
   try{
    const first=marketRequest(symbol,plannedVenue),second=marketRequest(symbol,partner);
    if(!first||!second)throw Error('Нет USDT perpetual пары на одной из бирж');
    const [a,b]=await Promise.all([
     fetch(first,{signal:controller.signal,cache:'no-store'}),
     fetch(second,{signal:controller.signal,cache:'no-store'})
    ]);
    if(!a.ok||!b.ok)throw Error('Биржа недоступна ('+a.status+'/'+b.status+')');
    const [payloadA,payloadB]=await Promise.all([a.json(),b.json()]);
    const at=Date.now();
    const planned=parseMarketQuote(payloadA,plannedVenue,symbol,at);
    const compared=parseMarketQuote(payloadB,partner,symbol,at);
    const result=calculateCrossSpread({plannedVenue,planned,compared,now:at});
    if(!disposed)setState({key,checkedAt:at,value:result});
   }catch(err){
    if(!controller.signal.aborted)
     fail(String((err as Error).message||'Нет котировок Bid/Ask'));
   }finally{busy=false}
  };
  setState({key,checkedAt:0,value:{status:'NO_DATA',symbol,plannedVenue,
   compareVenue:partner,reason:'Загрузка котировок'}});
  void load();
  timer=window.setInterval(()=>{void load()},12000);
  const visible=()=>{if(!document.hidden)void load()};
  document.addEventListener('visibilitychange',visible);
  return ()=>{disposed=true;controller.abort();
   if(timer!==undefined)window.clearInterval(timer);
   document.removeEventListener('visibilitychange',visible)};
 },[symbol,plannedVenue,enabled]);
 const key=symbol+':'+plannedVenue;
 return enabled&&state.key===key&&state.checkedAt>0&&Date.now()-state.checkedAt<30000?
  state.value:{status:'NO_DATA',symbol,plannedVenue,compareVenue:compareVenue(plannedVenue),
   reason:'Нет свежих котировок двух бирж'};
}
