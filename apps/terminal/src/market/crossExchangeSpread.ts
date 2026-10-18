/** ASCEND PLANNED VENUE V1 — public USDT perpetual top-of-book only.
 * Execution venue ≠ source chart. This is NOT a trade, arb signal, net ROI,
 * account connection, or guarantee of identical fills across venues.
 */
export const PLANNED_VENUES=['BINANCE','BINGX','MEXC','OKX','BYBIT'] as const;
export type PlannedVenue=typeof PLANNED_VENUES[number];
export type Quote={
  venue:PlannedVenue;symbol:string;bid:number;ask:number;at:number;receivedAt:number;
};
export type CrossSpread={
  status:'READY'|'NO_DATA';symbol:string;plannedVenue:PlannedVenue;
  reason?:string;compareVenue:PlannedVenue;buyVenue?:PlannedVenue;sellVenue?:PlannedVenue;
  buyAsk?:number;sellBid?:number;grossPct?:number;grossUsdtPerCoin?:number;
  plannedInsidePct?:number;comparedInsidePct?:number;asOf?:number;
};
const positive=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)&&v>0;
const num=(v:unknown)=>v===null||v===undefined||v===''?NaN:Number(v);
export function venueSymbol(baseSymbol:string,venue:PlannedVenue):string|null{
  if(!/^[A-Z0-9]{2,60}USDT$/.test(baseSymbol))return null;
  const base=baseSymbol.slice(0,-4);
  if(venue==='MEXC')return base+'_USDT';
  if(venue==='BINGX')return base+'-USDT';
  if(venue==='OKX')return base+'-USDT-SWAP';
  return baseSymbol;
}
export const toMexcSymbol=(symbol:string)=>venueSymbol(symbol,'MEXC');
function quote(venue:PlannedVenue,symbol:string,bid:number,ask:number,
  at:number,receivedAt:number):Quote{
  if(!positive(bid)||!positive(ask)||ask<bid)throw Error('Некорректные Bid/Ask');
  if(!Number.isFinite(at)||!Number.isFinite(receivedAt)||at<=0)
    throw Error('Нет времени биржевой котировки');
  return {venue,symbol,bid,ask,at,receivedAt};
}
export function parseBybitTicker(body:unknown,symbol:string,receivedAt:number):Quote{
  const raw=body as {retCode?:number;time?:number;result?:{list?:unknown[]}};
  if(raw?.retCode!==0||!Array.isArray(raw.result?.list))throw Error('Нет Bybit ticker');
  const item=raw.result.list.find(z=>(z as {symbol?:string})?.symbol===symbol) as
    {bid1Price?:string;ask1Price?:string}|undefined;
  if(!item)throw Error('Нет Bybit-контракта');
  return quote('BYBIT',symbol,num(item.bid1Price),num(item.ask1Price),
    num(raw.time),receivedAt);
}
export function parseMexcTicker(body:unknown,symbol:string,receivedAt:number):Quote{
  const raw=body as {success?:boolean;data?:unknown};
  if(raw?.success!==true)throw Error('Нет MEXC ticker');
  const arr=Array.isArray(raw.data)?raw.data:[raw.data];
  const item=arr.find(x=>(x as {symbol?:string})?.symbol===symbol) as
    {bid1?:unknown;ask1?:unknown;timestamp?:unknown}|undefined;
  if(!item)throw Error('Контракт отсутствует на MEXC');
  return quote('MEXC',symbol,num(item.bid1),num(item.ask1),
    num(item.timestamp),receivedAt);
}
export function parseBinanceBook(body:unknown,symbol:string,receivedAt:number):Quote{
  const rows=Array.isArray(body)?body:[body];
  const item=rows.find(v=>(v as {symbol?:string})?.symbol===symbol) as
    {bidPrice?:unknown;askPrice?:unknown;time?:unknown}|undefined;
  if(!item)throw Error('Контракт отсутствует на Binance');
  return quote('BINANCE',symbol,num(item.bidPrice),num(item.askPrice),
    num(item.time),receivedAt);
}
export function parseBingxBook(body:unknown,symbol:string,receivedAt:number):Quote{
  const raw=body as {code?:number;data?:unknown};
  if(raw?.code!==0)throw Error('BingX не вернул публичную котировку');
  const rows=Array.isArray(raw.data)?raw.data:[raw.data];
  const item=rows.find(v=>(v as {symbol?:string})?.symbol===symbol) as
    {bidPrice?:unknown;askPrice?:unknown;time?:unknown}|undefined;
  if(!item)throw Error('Контракт отсутствует на BingX');
  return quote('BINGX',symbol,num(item.bidPrice),num(item.askPrice),
    num(item.time),receivedAt);
}
export function parseOkxTicker(body:unknown,symbol:string,receivedAt:number):Quote{
  const raw=body as {code?:string;data?:unknown[]};
  if(raw?.code!=='0'||!Array.isArray(raw.data))throw Error('Нет OKX ticker');
  const item=raw.data.find(v=>(v as {instId?:string})?.instId===symbol) as
    {bidPx?:unknown;askPx?:unknown;ts?:unknown}|undefined;
  if(!item)throw Error('Контракт отсутствует на OKX');
  return quote('OKX',symbol,num(item.bidPx),num(item.askPx),
    num(item.ts),receivedAt);
}
export function marketRequest(symbol:string,venue:PlannedVenue):string|null{
  const value=venueSymbol(symbol,venue);
  if(!value)return null;
  const q=new URLSearchParams();
  switch(venue){
    case 'BYBIT':
      q.set('category','linear');q.set('symbol',value);
      return '/market-api/v5/market/tickers?'+q;
    case 'MEXC':
      q.set('symbol',value);
      return '/mexc-market-api/api/v1/contract/ticker?'+q;
    case 'BINANCE':
      q.set('symbol',value);
      return '/binance-market-api/fapi/v1/ticker/bookTicker?'+q;
    case 'BINGX':
      q.set('symbol',value);
      return '/bingx-market-api/openApi/swap/v2/quote/bookTicker?'+q;
    case 'OKX':
      q.set('instId',value);
      return '/okx-market-api/api/v5/market/ticker?'+q;
  }
}
export function parseMarketQuote(payload:unknown,venue:PlannedVenue,baseSymbol:string,receivedAt:number):Quote{
  const symbol=venueSymbol(baseSymbol,venue);
  if(!symbol)throw Error('Недопустимый символ');
  switch(venue){
    case 'BYBIT':return parseBybitTicker(payload,symbol,receivedAt);
    case 'MEXC':return parseMexcTicker(payload,symbol,receivedAt);
    case 'BINANCE':return parseBinanceBook(payload,symbol,receivedAt);
    case 'BINGX':return parseBingxBook(payload,symbol,receivedAt);
    case 'OKX':return parseOkxTicker(payload,symbol,receivedAt);
  }
}
export function compareVenue(plannedVenue:PlannedVenue):PlannedVenue{
  return plannedVenue==='BYBIT'?'MEXC':'BYBIT';
}
/** Positive difference is GROSS, ignores sizes, fees, funding and slippage.
 * Both quotes are checked against 30s freshness and 12s cross-market skew.
 */
export function calculateCrossSpread(args:{
  plannedVenue:PlannedVenue; planned?:Quote; compared?:Quote;
  now:number;maxAgeMs?:number;maxSkewMs?:number;
}):CrossSpread{
  const {plannedVenue,planned,compared,now,maxAgeMs=30000,maxSkewMs=12000}=args;
  const compare=compareVenue(plannedVenue);
  const missing=(reason:string):CrossSpread=>({status:'NO_DATA',
    symbol:planned?.symbol??compared?.symbol??'',plannedVenue,
    compareVenue:compare,reason});
  if(!planned||!compared)return missing('Ожидаем котировки обеих бирж');
  if(planned.venue!==plannedVenue||compared.venue!==compare)
    return missing('Не совпадает источник котировок');
  const normalized=venueSymbol(
    plannedVenue==='BYBIT'?planned.symbol:compared.symbol,plannedVenue);
  const partner=venueSymbol(
    plannedVenue==='BYBIT'?planned.symbol:compared.symbol,compare);
  if(normalized!==planned.symbol||partner!==compared.symbol)
    return missing('Контракты не соответствуют выбранной паре');
  if(!Number.isFinite(now)||[planned,compared].some(q=>
    !Number.isFinite(q.at)||!Number.isFinite(q.receivedAt)||
    q.at>now+2000||now-q.at>maxAgeMs||
    q.receivedAt>now+2000||now-q.receivedAt>maxAgeMs))
    return missing('Котировки устарели или не синхронизированы');
  if(Math.abs(planned.at-compared.at)>maxSkewMs)
    return missing('Слишком большой временной разрыв котировок');
  if([planned.bid,planned.ask,compared.bid,compared.ask].some(v=>!positive(v))||
     planned.ask<planned.bid||compared.ask<compared.bid)
    return missing('Неверные цены Bid/Ask');
  const buyPlanned=(compared.bid-planned.ask)/planned.ask*100;
  const buyCompared=(planned.bid-compared.ask)/compared.ask*100;
  const p=buyPlanned>=buyCompared;
  const buyAsk=p?planned.ask:compared.ask;
  const sellBid=p?compared.bid:planned.bid;
  return {status:'READY',symbol:planned.symbol,plannedVenue,compareVenue:compare,
    buyVenue:p?plannedVenue:compare,sellVenue:p?compare:plannedVenue,
    buyAsk,sellBid,grossPct:p?buyPlanned:buyCompared,
    grossUsdtPerCoin:sellBid-buyAsk,
    plannedInsidePct:(planned.ask-planned.bid)/((planned.ask+planned.bid)/2)*100,
    comparedInsidePct:(compared.ask-compared.bid)/((compared.ask+compared.bid)/2)*100,
    asOf:Math.min(planned.at,compared.at)};
}
