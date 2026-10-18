/** Read-only executable top-of-book comparison across USDT linear futures.
 * A positive difference is GROSS before fees, funding, slippage and sizes.
 */
export type Quote={
  venue:'BYBIT'|'MEXC';symbol:string;bid:number;ask:number;
  at:number;receivedAt:number;
};
export type CrossSpread={
  status:'READY'|'NO_DATA';symbol:string;reason?:string;
  buyVenue?:'BYBIT'|'MEXC';sellVenue?:'BYBIT'|'MEXC';
  buyAsk?:number;sellBid?:number;
  grossPct?:number;grossUsdtPerCoin?:number;
  bybitInsidePct?:number;mexcInsidePct?:number;
  asOf?:number;
};
const positive=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)&&v>0;
const price=(v:unknown)=>v===null||v===undefined||v===''?NaN:Number(v);
function quote(venue:Quote['venue'],symbol:string,bid:number,ask:number,
  at:number,receivedAt:number):Quote{
  if(!positive(bid)||!positive(ask)||ask<bid)throw Error('Некорректные Bid/Ask');
  if(!Number.isFinite(at)||!Number.isFinite(receivedAt)||at<=0)
    throw Error('Нет времени котировки');
  return {venue,symbol,bid,ask,at,receivedAt};
}
export function parseBybitTicker(body:unknown,symbol:string,receivedAt:number):Quote{
  const raw=body as {retCode?:number;time?:number;result?:{list?:unknown[]}};
  if(raw?.retCode!==0||!Array.isArray(raw.result?.list))throw Error('Нет Bybit ticker');
  const item=raw.result.list.find(z=>(z as {symbol?:string})?.symbol===symbol) as
    {bid1Price?:string;ask1Price?:string}|undefined;
  if(!item)throw Error('Нет Bybit-контракта');
  const at=Number(raw.time);
  return quote('BYBIT',symbol,price(item.bid1Price),price(item.ask1Price),at,receivedAt);
}
export function parseMexcTicker(body:unknown,symbol:string,receivedAt:number):Quote{
  const raw=body as {success?:boolean;data?:unknown};
  if(raw?.success!==true)throw Error('Нет MEXC ticker');
  const rows=Array.isArray(raw.data)?raw.data:[raw.data];
  const item=rows.find(x=>(x as {symbol?:string})?.symbol===symbol) as
    {bid1?:unknown;ask1?:unknown;timestamp?:unknown}|undefined;
  if(!item)throw Error('Нет MEXC-контракта');
  return quote('MEXC',symbol,price(item.bid1),price(item.ask1),
    Number(item.timestamp),receivedAt);
}
export function toMexcSymbol(bybitSymbol:string):string|null{
  if(!/^[A-Z0-9]{2,60}USDT$/.test(bybitSymbol))return null;
  return bybitSymbol.slice(0,-4)+'_USDT';
}
/** Only compare the same base/quote perpetual and recently observed top of book. */
export function calculateCrossSpread(args:{
 bybit?:Quote;mexc?:Quote;now:number;maxAgeMs?:number;maxSkewMs?:number;
}):CrossSpread{
  const {bybit,mexc,now,maxAgeMs=30000,maxSkewMs=12000}=args;
  const symbol=bybit?.symbol??mexc?.symbol??'';
  const reject=(reason:string):CrossSpread=>({status:'NO_DATA',symbol,reason});
  if(!bybit||!mexc)return reject('Котировки обеих бирж пока недоступны');
  if(bybit.venue!=='BYBIT'||mexc.venue!=='MEXC')return reject('Неверный источник');
  if(toMexcSymbol(bybit.symbol)!==mexc.symbol)
    return reject('Контракты Bybit и MEXC не совпадают');
  if(!Number.isFinite(now)||!Number.isFinite(bybit.at)||!Number.isFinite(mexc.at))
    return reject('Неизвестное время котировок');
  if([bybit,mexc].some(q=>q.at>now+2000||now-q.at>maxAgeMs||
     now-q.receivedAt>maxAgeMs||now<q.receivedAt-2000))
    return reject('Котировки устарели');
  if(Math.abs(bybit.at-mexc.at)>maxSkewMs)
    return reject('Разное время получения цен');
  if([bybit.bid,bybit.ask,mexc.bid,mexc.ask].some(v=>!positive(v))||
    bybit.ask<bybit.bid||mexc.ask<mexc.bid)return reject('Неверный стакан');
  const a=(mexc.bid-bybit.ask)/bybit.ask*100; // buy Bybit ask, sell MEXC bid
  const b=(bybit.bid-mexc.ask)/mexc.ask*100; // buy MEXC ask, sell Bybit bid
  const buyBybit=a>=b;
  const buyAsk=buyBybit?bybit.ask:mexc.ask;
  const sellBid=buyBybit?mexc.bid:bybit.bid;
  return {
    status:'READY',symbol:bybit.symbol,
    buyVenue:buyBybit?'BYBIT':'MEXC',
    sellVenue:buyBybit?'MEXC':'BYBIT',
    buyAsk,sellBid,grossPct:buyBybit?a:b,
    grossUsdtPerCoin:sellBid-buyAsk,
    bybitInsidePct:(bybit.ask-bybit.bid)/((bybit.ask+bybit.bid)/2)*100,
    mexcInsidePct:(mexc.ask-mexc.bid)/((mexc.ask+mexc.bid)/2)*100,
    asOf:Math.min(bybit.at,mexc.at)
  };
}
