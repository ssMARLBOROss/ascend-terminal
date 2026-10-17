import {useEffect,useState} from 'react';

export type MetricStatus='loading'|'ready'|'error';
export type Metric<T>={symbol:string;status:MetricStatus;data?:T;updatedAt?:number;error?:string};
export type TpoProfile={poc:number;vah:number;val:number;from:number;to:number;bars:number;coveragePct:number};
export type OpenInterest={value:number;previous:number;deltaPercent:number;timestamp:number;history:number[]};
export type LongShort={longPercent:number;shortPercent:number;deltaLongPp:number;timestamp:number;history:number[]};
export type TradeDelta={buyVolume:number;sellVolume:number;delta:number;trades:number;
  from:number;to:number;history:number[]};

const HALF_HOUR=1800000;

function readList(body:unknown):unknown[]{
  const response=body as {retCode?:number;retMsg?:string;result?:{list?:unknown[]}};
  if(response?.retCode!==0||!Array.isArray(response.result?.list))
    throw Error(response?.retMsg??'Invalid Bybit market response');
  return response.result.list;
}

/** TPO approximation from 48 contiguous CLOSED 30m time brackets, rolling 24h. */
export function profileFromClosedBars(body:unknown):TpoProfile{
  const now=Date.now();
  const bars=readList(body).flatMap(row=>{
    if(!Array.isArray(row)||row.length<5)return [];
    const t=Number(row[0]),high=Number(row[2]),low=Number(row[3]);
    if(!Number.isFinite(t)||t+HALF_HOUR>now||!Number.isFinite(high)||
      !Number.isFinite(low)||low<=0||high<low)return [];
    return [{t,high,low}];
  }).sort((a,b)=>a.t-b.t).slice(-48);
  if(bars.length!==48)throw Error('Need 48 closed 30m candles');
  for(let i=1;i<bars.length;i++)if(bars[i].t-bars[i-1].t!==HALF_HOUR)
    throw Error('Incomplete contiguous TPO history');
  const low=Math.min(...bars.map(b=>b.low)),high=Math.max(...bars.map(b=>b.high));
  if(!(high>low))throw Error('No TPO price range');
  const bins=48,width=(high-low)/bins;
  const counts=Array.from({length:bins},()=>0);
  for(const b of bars){
    let l=Math.max(0,Math.min(bins-1,Math.floor((b.low-low)/width)));
    const r=Math.max(l,Math.min(bins-1,Math.floor((b.high-low)/width)));
    for(;l<=r;l++)counts[l]++;
  }
  let poc=0;
  for(let i=1;i<bins;i++)if(counts[i]>counts[poc])poc=i;
  let start=poc,end=poc,area=counts[poc];
  const total=counts.reduce((a,b)=>a+b,0),target=.70*total;
  while(area<target&&(start>0||end<bins-1)){
    const left=start>0?counts[start-1]:-1;
    const right=end<bins-1?counts[end+1]:-1;
    if(right>left)area+=counts[++end];else area+=counts[--start];
  }
  return {poc:low+(poc+.5)*width,val:low+start*width,
    vah:low+(end+1)*width,from:bars[0].t,
    to:bars[47].t+HALF_HOUR,bars:48,coveragePct:area/total*100};
}
export function interestFromHistory(body:unknown):OpenInterest{
  const rows=readList(body).flatMap(raw=>{
    const x=raw as Record<string,unknown>;
    const t=Number(x?.timestamp),v=Number(x?.openInterest);
    return Number.isFinite(t)&&Number.isFinite(v)&&t>0&&v>0?[{t,v}]:[];
  }).sort((a,b)=>a.t-b.t);
  if(rows.length<2||rows.at(-1)!.t<=rows[0].t)throw Error('Insufficient OI history');
  const current=rows.at(-1)!,previous=rows.at(-2)!;
  return {value:current.v,previous:previous.v,deltaPercent:(current.v/previous.v-1)*100,
    timestamp:current.t,history:rows.slice(-42).map(x=>x.v)};
}
export function ratioFromHistory(body:unknown):LongShort{
  const rows=readList(body).flatMap(raw=>{
    const x=raw as Record<string,unknown>;
    const t=Number(x?.timestamp),l=Number(x?.buyRatio),s=Number(x?.sellRatio);
    return Number.isFinite(t)&&Number.isFinite(l)&&Number.isFinite(s)&&
      t>0&&l>=0&&s>=0&&l<=1&&s<=1&&Math.abs(l+s-1)<.04?[{t,l,s}]:[];
  }).sort((a,b)=>a.t-b.t);
  if(rows.length<2||rows.at(-1)!.t<=rows[0].t)throw Error('Insufficient L/S history');
  const current=rows.at(-1)!,previous=rows.at(-2)!;
  return {longPercent:current.l*100,shortPercent:current.s*100,
    deltaLongPp:(current.l-previous.l)*100,timestamp:current.t,
    history:rows.slice(-42).map(x=>x.l*100)};
}
/** Rolling last-1000-trades taker delta. NOT continuous historic CVD. */
export function deltaFromRecentTrades(body:unknown):TradeDelta{
  const seen=new Set<string>();
  const trades=readList(body).flatMap(raw=>{
    const x=raw as Record<string,unknown>;
    const id=typeof x?.execId==='string'?x.execId:'';
    const t=Number(x?.time),volume=Number(x?.size);
    if(!id||seen.has(id)||!Number.isFinite(t)||!Number.isFinite(volume)||
      t<=0||volume<=0||(x.side!=='Buy'&&x.side!=='Sell'))return [];
    seen.add(id);
    return [{t,volume,side:x.side as 'Buy'|'Sell',id}];
  }).sort((a,b)=>a.t-b.t||a.id.localeCompare(b.id));
  if(trades.length<2)throw Error('Not enough public trades');
  let buyVolume=0,sellVolume=0,running=0;
  const history=[0];
  const stride=Math.max(1,Math.ceil(trades.length/80));
  for(let i=0;i<trades.length;i++){
    const tr=trades[i];
    if(tr.side==='Buy')buyVolume+=tr.volume;else sellVolume+=tr.volume;
    running+=tr.side==='Buy'?tr.volume:-tr.volume;
    if(i%stride===stride-1||i===trades.length-1)history.push(running);
  }
  return {buyVolume,sellVolume,delta:buyVolume-sellVolume,
    trades:trades.length,from:trades[0].t,to:trades.at(-1)!.t,history};
}

const FIELDS={
  tpo:{path:'kline',params:{interval:'30',limit:'55'},delay:60000,parse:profileFromClosedBars},
  oi:{path:'open-interest',params:{intervalTime:'5min',limit:'55'},delay:45000,parse:interestFromHistory},
  longShort:{path:'account-ratio',params:{period:'5min',limit:'55'},delay:45000,parse:ratioFromHistory},
  cvd:{path:'recent-trade',params:{limit:'1000'},delay:12000,parse:deltaFromRecentTrades}
} as const;

/** Independent read-only poller, always scoped to the selected instrument. */
function useMetric<T>(symbol:string,path:string,params:Record<string,string>,delay:number,
  parser:(data:unknown)=>T,enabled=true):Metric<T>{
  const[state,setState]=useState<Metric<T>>({symbol,status:'loading'});
  useEffect(()=>{
    if(!enabled){
      setState({symbol,status:'loading'});
      return;
    }
    const controller=new AbortController();
    let timer:number|undefined,busy=false;
    const poll=async()=>{
      if(controller.signal.aborted||busy||document.visibilityState==='hidden')return;
      busy=true;
      try{
        const qs=new URLSearchParams({category:'linear',symbol,...params});
        const res=await fetch('/market-api/v5/market/'+path+'?'+qs,{
          signal:controller.signal,cache:'no-store'
        });
        if(!res.ok)throw Error('HTTP '+res.status);
        const payload=await res.json();
        const data=parser(payload);
        if(!controller.signal.aborted)setState({
          symbol,status:'ready',data,updatedAt:Date.now()
        });
      }catch(e){
        if(!controller.signal.aborted)setState({
          symbol,status:'error',error:String((e as Error)?.message??e)
        });
      }finally{
        busy=false;
        if(!controller.signal.aborted)timer=window.setTimeout(()=>{void poll()},delay);
      }
    };
    const onVisible=()=>{
      if(document.visibilityState!=='visible')return;
      if(timer!==undefined)window.clearTimeout(timer);
      if(!busy)void poll();
    };
    setState({symbol,status:'loading'});
    document.addEventListener('visibilitychange',onVisible);
    void poll();
    return()=>{
      controller.abort();
      if(timer!==undefined)window.clearTimeout(timer);
      document.removeEventListener('visibilitychange',onVisible);
    };
  },[symbol,path,params,delay,parser,enabled]);
  return state.symbol===symbol&&enabled?state:{symbol,status:'loading'};
}

export function useLiveMarketMetrics(symbol:string,visibility:{tpo:boolean;oi:boolean;longShort:boolean;cvd:boolean}){
  const tpo=useMetric(symbol,FIELDS.tpo.path,FIELDS.tpo.params,FIELDS.tpo.delay,FIELDS.tpo.parse,visibility.tpo);
  const oi=useMetric(symbol,FIELDS.oi.path,FIELDS.oi.params,FIELDS.oi.delay,FIELDS.oi.parse,visibility.oi);
  const longShort=useMetric(symbol,FIELDS.longShort.path,FIELDS.longShort.params,FIELDS.longShort.delay,FIELDS.longShort.parse,visibility.longShort);
  const cvd=useMetric(symbol,FIELDS.cvd.path,FIELDS.cvd.params,FIELDS.cvd.delay,FIELDS.cvd.parse,visibility.cvd);
  return {tpo,oi,longShort,cvd};
}
