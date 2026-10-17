/* ASCEND GLOBAL TREND V1 — context-only Bybit futures PROXY.
   This module never changes orders, signals, or the Structure Engine.
   Multi-venue spot, breadth and CVD are not connected in this preview. */
import type {Candle} from '@ascend/contracts';

export type BiasDirection='BULLISH'|'BEARISH'|'BALANCE'|'SHIFTING'|'NO_DATA';
export type CoinDirection=BiasDirection|'CORRECTION';
export type Alignment='ALIGNED'|'CONFLICT'|'SHIFTING'|'NEUTRAL'|'NO_DATA';
export type ClosedStructure={
 status:'READY'|'NO_DATA';dir:number;shape:string;phase:'TREND'|'CORRECTION'|'BALANCE';
 asOf?:number;bars:number;reason?:string;
};
export type GlobalBiasSnapshot={
 market:BiasDirection;coin:CoinDirection;alignment:Alignment;
 score:number|null;coverage:number;source:'BYBIT_FUTURES_PROXY';
 updatedAt:number;description:string;frames:Record<string,string>;
};
export const WEIGHTS={BTCUSDT:.50,ETHUSDT:.30,SOLUSDT:.20} as const;
const TIME={m15:900000,m30:1800000,h1:3600000} as const;
const finite=(n:number)=>Number.isFinite(n);
const direction=(value:number):BiasDirection=>value>0?'BULLISH':value<0?'BEARISH':'BALANCE';

export function closedCandles(input:Candle[],step:number,asOf:number):Candle[]{
 if(!Array.isArray(input)||!finite(asOf))return[];
 const rows=new Map<number,Candle>();
 for(const c of input){
  if(!c||![c.timestamp,c.open,c.high,c.low,c.close,c.volume].every(finite)||
    !Number.isInteger(c.timestamp)||c.timestamp%step!==0||
    c.timestamp+step>asOf||c.low<=0||c.high<c.low||
    c.open<c.low||c.open>c.high||c.close<c.low||c.close>c.high||c.volume<0)continue;
  rows.set(c.timestamp,c);
 }
 const sorted=[...rows.values()].sort((a,b)=>a.timestamp-b.timestamp);
 let from=0;
 for(let i=1;i<sorted.length;i++)if(sorted[i].timestamp-sorted[i-1].timestamp!==step)from=i;
 return sorted.slice(from);
}
export function evaluateStructure(input:Candle[]|undefined,step:number,asOf:number):ClosedStructure{
 const rows=closedCandles(input??[],step,asOf),last=rows.at(-1);
 if(!last||rows.length<36||asOf-(last.timestamp+step)>step*2+60000)
  return {status:'NO_DATA',dir:0,shape:'UNCONFIRMED',phase:'BALANCE',bars:rows.length,
   reason:'Недостаточно свежих последовательных закрытых свечей'};
 const highs:{price:number;knownAt:number}[]=[],lows:{price:number;knownAt:number}[]=[];
 for(let i=2;i<rows.length-2;i++){
  const b=rows[i],near=rows.slice(i-2,i).concat(rows.slice(i+1,i+3));
  const knownAt=rows[i+2].timestamp+step;
  if(knownAt>asOf)continue;
  if(near.every(x=>x.high<b.high))highs.push({price:b.high,knownAt});
  if(near.every(x=>x.low>b.low))lows.push({price:b.low,knownAt});
 }
 const h=highs.slice(-2),l=lows.slice(-2);
 let dir=0,shape='MIXED';
 if(h.length===2&&l.length===2){
  if(h[1].price>h[0].price&&l[1].price>l[0].price){dir=1;shape='HH/HL'}
  else if(h[1].price<h[0].price&&l[1].price<l[0].price){dir=-1;shape='LH/LL'}
 }
 const momentum=Math.sign(last.close-rows[rows.length-7].close);
 return {status:'READY',dir,shape,
  phase:dir===0?'BALANCE':dir*momentum<0?'CORRECTION':'TREND',
  asOf:last.timestamp+step,bars:rows.length};
}
export function calculateGlobalProxy(input:{
 asOf:number;
 leaders:Record<string,{'1H'?:Candle[];'30m'?:Candle[]}>;
 coin:{'30m'?:Candle[];'15m'?:Candle[]};
}):GlobalBiasSnapshot{
 const empty:GlobalBiasSnapshot={
  market:'NO_DATA',coin:'NO_DATA',alignment:'NO_DATA',score:null,coverage:0,
  source:'BYBIT_FUTURES_PROXY',updatedAt:input.asOf,
  description:'Ожидаем закрытые 1H/30m свечи BTC, ETH, SOL',
  frames:{}
 };
 if(!finite(input.asOf))return empty;
 let majors=0,ready=true,m30=0,h1=0,conflict=false;
 const frames:Record<string,string>={};
 for(const [symbol,weight] of Object.entries(WEIGHTS)){
  const data=input.leaders[symbol]??{};
  const high=evaluateStructure(data['1H'],TIME.h1,input.asOf);
  const medium=evaluateStructure(data['30m'],TIME.m30,input.asOf);
  frames[symbol]=high.shape+' / '+medium.shape;
  if(high.status!=='READY'||medium.status!=='READY'){ready=false;continue}
  majors+=weight*(high.dir*.65+medium.dir*.35)*100;
  h1+=weight*high.dir;m30+=weight*medium.dir;
  if(high.dir!==0&&medium.dir!==0&&high.dir!==medium.dir)conflict=true;
 }
 let market:BiasDirection='NO_DATA',score:number|null=null;
 if(ready){
  score=Math.max(-100,Math.min(100,majors));
  market=conflict||(m30*h1<0)?'SHIFTING':
   score>=35?'BULLISH':score<=-35?'BEARISH':'BALANCE';
 }
 const coinHigh=evaluateStructure(input.coin['30m'],TIME.m30,input.asOf);
 const coinLocal=evaluateStructure(input.coin['15m'],TIME.m15,input.asOf);
 let coin:CoinDirection='NO_DATA';
 if(coinHigh.status==='READY'&&coinLocal.status==='READY'){
  if(coinHigh.dir!==0&&coinLocal.dir===-coinHigh.dir)coin='CORRECTION';
  else if(coinHigh.dir!==0&&coinLocal.dir===coinHigh.dir)coin=direction(coinHigh.dir);
  else if(coinHigh.dir===0&&coinLocal.dir!==0)coin='SHIFTING';
  else if(coinHigh.phase==='CORRECTION')coin='CORRECTION';
  else coin='BALANCE';
 }
 let alignment:Alignment='NO_DATA';
 if(market!=='NO_DATA'&&coin!=='NO_DATA'){
  if(market==='BALANCE'||coin==='BALANCE')alignment='NEUTRAL';
  else if(market==='SHIFTING'||coin==='SHIFTING'||coin==='CORRECTION')alignment='SHIFTING';
  else alignment=market===coin?'ALIGNED':'CONFLICT';
 }
 const description=market==='NO_DATA'?
  'Нет свежих закрытых свечей всех трёх ориентиров — направление не определено':
  alignment==='ALIGNED'?'Рынок и монета сонаправлены. Это не сигнал входа.':
  alignment==='CONFLICT'?'Монета движется против направления основных ориентиров.':
  alignment==='SHIFTING'?'Рынок и монета в разных фазах; ждём структуру.':
  'Подтверждённого направленного преимущества нет.';
 return {market,coin,alignment,score,coverage:ready?.55:0,
  source:'BYBIT_FUTURES_PROXY',updatedAt:input.asOf,description,
  frames:{...frames,COIN:coinHigh.shape+' / '+coinLocal.shape}};
}
