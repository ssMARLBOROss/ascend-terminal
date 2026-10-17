/**
 * Live instrument catalogs. Symbols are EXCHANGE-SCOPED; never assume an
 * instrument listed on one venue is supported on the other.
 */
export type FuturesExchange='BYBIT'|'MEXC';
export type FuturesContract={
  exchange:FuturesExchange;symbol:string;base:string;quote:'USDT';
  settle:'USDT';kind:string;label:string;
};
export type CatalogResult={contracts:FuturesContract[];retrievedAt:number};
export const BYBIT_MARKET='/market-api/v5/market/instruments-info';
export const MEXC_MARKET='/mexc-market-api/api/v1/contract/detail';

function cleanSymbol(value:unknown):string|null{
  return typeof value==='string'&&/^[A-Z0-9_]{3,64}$/.test(value)?value:null;
}
export function parseBybitInstruments(payload:unknown):{
  contracts:FuturesContract[];nextCursor:string
}{
  const o=payload as {retCode?:number;retMsg?:string;
    result?:{list?:unknown[];nextPageCursor?:string}};
  if(o?.retCode!==0||!Array.isArray(o.result?.list))
    throw Error('Bybit instrument catalog: '+String(o?.retMsg??'invalid response'));
  const contracts:FuturesContract[]=[];
  for(const raw of o.result.list){
    const x=raw as Record<string,unknown>;
    const symbol=cleanSymbol(x?.symbol);
    if(!symbol||x.status!=='Trading'||x.quoteCoin!=='USDT'||
      x.settleCoin!=='USDT')continue;
    const kind=typeof x.contractType==='string'?x.contractType:'UnknownLinear';
    const base=typeof x.baseCoin==='string'?x.baseCoin:'';
    if(!base||!['LinearPerpetual','LinearFutures'].includes(kind))continue;
    contracts.push({exchange:'BYBIT',symbol,base,quote:'USDT',settle:'USDT',
      kind,label:base+'/USDT'});
  }
  return {contracts,nextCursor:typeof o.result.nextPageCursor==='string'?
    o.result.nextPageCursor:''};
}
export function parseMexcContracts(payload:unknown):FuturesContract[]{
  const o=payload as {success?:boolean;code?:number;message?:string;data?:unknown[]};
  if(o?.success!==true||!Array.isArray(o.data))
    throw Error('MEXC instrument catalog: '+String(o?.message??'invalid response'));
  const contracts:FuturesContract[]=[];
  for(const raw of o.data){
    const x=raw as Record<string,unknown>;
    const symbol=cleanSymbol(x?.symbol);
    const base=x?.baseCoin;
    if(!symbol||typeof base!=='string'||!base||
      x.quoteCoin!=='USDT'||x.settleCoin!=='USDT'||
      // MEXC state 0 = enabled; exclude suspended/delisted when supplied.
      (x.state!==undefined&&x.state!==0)||
      // MEXC futureType 1 = perpetual, ignore delivery-only contracts.
      (x.futureType!==undefined&&x.futureType!==1))continue;
    if(!symbol.endsWith('_USDT'))continue;
    contracts.push({exchange:'MEXC',symbol,base,quote:'USDT',settle:'USDT',
      kind:'PERPETUAL',label:base+'/USDT'});
  }
  return contracts;
}
export function rankFutures(contracts:FuturesContract[]):FuturesContract[]{
  const preferred=['BTC','ETH','SOL','BNB','XRP','DOGE','ADA','LINK','AVAX','SUI'];
  return [...contracts].sort((a,b)=>{
    const x=preferred.indexOf(a.base),y=preferred.indexOf(b.base);
    if(x!==-1||y!==-1){
      if(x===-1)return 1;
      if(y===-1)return -1;
      if(x!==y)return x-y;
    }
    return a.base.localeCompare(b.base)||a.symbol.localeCompare(b.symbol);
  });
}
export function searchContracts(contracts:FuturesContract[],query:string){
  const q=query.toUpperCase().replace(/[\s/_-]/g,'');
  if(!q)return contracts;
  return contracts.filter(c=>c.symbol.replace(/_/g,'').includes(q)||
    c.base.replace(/_/g,'').includes(q));
}
export async function loadBybitCatalog(fetcher:typeof fetch,signal?:AbortSignal):
Promise<FuturesContract[]>{
  const all=new Map<string,FuturesContract>();
  const visited=new Set<string>();
  let cursor='';
  for(let page=0;page<30;page++){
    if(visited.has(cursor))throw Error('Bybit instruments pagination loop');
    visited.add(cursor);
    const qs=new URLSearchParams({category:'linear',status:'Trading',limit:'1000'});
    if(cursor)qs.set('cursor',cursor);
    const response=await fetcher(BYBIT_MARKET+'?'+qs.toString(),
      {signal,cache:'no-store'});
    if(!response.ok)throw Error('Bybit instruments HTTP '+response.status);
    const data=parseBybitInstruments(await response.json());
    for(const c of data.contracts)all.set(c.symbol,c);
    if(!data.nextCursor)return rankFutures([...all.values()]);
    cursor=data.nextCursor;
  }
  throw Error('Bybit catalog exceeded safe pagination limit');
}
export async function loadMexcCatalog(fetcher:typeof fetch,signal?:AbortSignal):
Promise<FuturesContract[]>{
  const response=await fetcher(MEXC_MARKET,{signal,cache:'no-store'});
  if(!response.ok)throw Error('MEXC instruments HTTP '+response.status);
  const contracts=parseMexcContracts(await response.json());
  if(!contracts.length)throw Error('MEXC returned no active USDT futures');
  return rankFutures(contracts);
}
