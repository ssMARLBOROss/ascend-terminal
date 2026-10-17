import {useEffect,useState} from 'react';
import type {Candle} from '@ascend/contracts';
import {calculateGlobalProxy,type GlobalBiasSnapshot} from './globalTrendPreview';

/** Read-only external context. BYBIT futures PROXY, not global aggregated market data. */
export function useGlobalTrendPreview(symbol:string){
 const[snapshot,setSnapshot]=useState<GlobalBiasSnapshot>(()=>calculateGlobalProxy({
  asOf:Date.now(),leaders:{},coin:{}
 }));
 const[loading,setLoading]=useState(true);
 const[error,setError]=useState<string>();
 const[updatedAt,setUpdatedAt]=useState<number>();
 useEffect(()=>{
  const controller=new AbortController();
  let timer:number|undefined,busy=false,at=0;
  const query:[string,'1H'|'30m'|'15m'][]=[];
  for(const ticker of ['BTCUSDT','ETHUSDT','SOLUSDT'] as const){
   query.push([ticker,'1H'],[ticker,'30m']);
  }
  if(!query.some(([s,tf])=>s===symbol&&tf==='30m'))query.push([symbol,'30m']);
  query.push([symbol,'15m']);
  const fetchBars=async(s:string,tf:'1H'|'30m'|'15m')=>{
   const interval=tf==='1H'?'60':tf==='30m'?'30':'15';
   const qs=new URLSearchParams({category:'linear',symbol:s,interval,limit:'180'});
   const response=await fetch('/market-api/v5/market/kline?'+qs.toString(),
    {signal:controller.signal,cache:'no-store'});
   if(!response.ok)throw Error('HTTP '+response.status);
   const json=await response.json();
   if(json.retCode!==0||!Array.isArray(json.result?.list))
    throw Error('Bybit '+String(json.retMsg??'invalid candle response'));
   return json.result.list.map((row:unknown):Candle|undefined=>{
    if(!Array.isArray(row)||row.length<6)return undefined;
    const bar={timestamp:Number(row[0]),open:Number(row[1]),
     high:Number(row[2]),low:Number(row[3]),close:Number(row[4]),volume:Number(row[5])};
    return Object.values(bar).every(Number.isFinite)?bar:undefined;
   }).filter((bar:Candle|undefined):bar is Candle=>Boolean(bar));
  };
  const load=async()=>{
   if(controller.signal.aborted||busy||document.hidden)return;
   busy=true;setLoading(true);
   const results=await Promise.allSettled(query.map(async([s,tf])=>({
    symbol:s,tf,rows:await fetchBars(s,tf)
   })));
   if(!controller.signal.aborted){
    const leaders:Record<string,{'1H'?:Candle[];'30m'?:Candle[]}>={};
    const coin:{'15m'?:Candle[];'30m'?:Candle[]}={};
    for(const res of results)if(res.status==='fulfilled'){
     const {symbol:s,tf,rows}=res.value;
     if(['BTCUSDT','ETHUSDT','SOLUSDT'].includes(s)&&tf!=='15m'){
      const leader=leaders[s]??{};leader[tf]=rows;leaders[s]=leader;
     }
     if(s===symbol&&(tf==='15m'||tf==='30m'))coin[tf]=rows;
    }
    const now=Date.now();
    const result=calculateGlobalProxy({asOf:now,leaders,coin});
    setSnapshot(result);
    setError(results.every(res=>res.status==='fulfilled')?undefined:
      'Некоторые источники Bybit недоступны — данные не подменяются');
    setUpdatedAt(now);setLoading(false);at=now;
   }
   busy=false;
  };
  const update=()=>{if(Date.now()-at>=110000)void load()};
  const visible=()=>{if(!document.hidden)void load()};
  void load();
  timer=window.setInterval(update,12000);
  document.addEventListener('visibilitychange',visible);
  return()=>{controller.abort();if(timer)window.clearInterval(timer);
   document.removeEventListener('visibilitychange',visible)};
 },[symbol]);
 const fresh=updatedAt!==undefined&&Date.now()-updatedAt<300000;
 return {snapshot:fresh?snapshot:{...snapshot,market:'NO_DATA' as const,
  alignment:'NO_DATA' as const,score:null,coverage:0,
  description:'Данные устарели или ещё не загружены'},
  loading,error,updatedAt};
}
