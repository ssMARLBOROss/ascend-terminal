import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';

async function bundle(path,name){
  const target=resolve(tmpdir(),'ascend-exchanges-'+name+'.mjs');
  await build({entryPoints:[path],outfile:target,bundle:true,platform:'node',
    format:'esm',logLevel:'silent'});
  return import(pathToFileURL(target).href);
}
const {parseBybitInstruments,parseMexcContracts,searchContracts,loadBybitCatalog,
  loadMexcCatalog}=await bundle('src/market/exchangeCatalog.ts','catalog');
const mkBybit=(symbol,base,quote='USDT',settle='USDT',status='Trading')=>({
  symbol,baseCoin:base,quoteCoin:quote,settleCoin:settle,
  status,contractType:'LinearPerpetual'
});
const first=parseBybitInstruments({retCode:0,result:{list:[
  mkBybit('BTCUSDT','BTC'),mkBybit('ETHUSDT','ETH'),
  mkBybit('BTCUSDC','BTC','USDC','USDC'),
  mkBybit('SOLUSDT','SOL','USDT','USDT','Closed')
],nextPageCursor:'abc%2Fdef'}});
assert.deepEqual(first.contracts.map(x=>x.symbol),['BTCUSDT','ETHUSDT']);
assert.equal(first.nextCursor,'abc%2Fdef');
const pages=[];
const mockBybit=async(url)=>{
  pages.push(url);
  const cursor=new URL('https://example.org'+url).searchParams.get('cursor');
  if(!cursor)return {ok:true,json:async()=>({retCode:0,result:{
    list:[mkBybit('BTCUSDT','BTC')],nextPageCursor:'abc%2Fdef'}})};
  assert.equal(cursor,'abc%2Fdef');
  return {ok:true,json:async()=>({retCode:0,result:{
    list:[mkBybit('BTCUSDT','BTC'),mkBybit('ETHUSDT','ETH')],nextPageCursor:''}})};
};
const all=await loadBybitCatalog(mockBybit);
assert.equal(pages.length,2);
assert.equal(all.length,2);
assert.equal(searchContracts(all,'eth/usdt')[0].symbol,'ETHUSDT');
const mexcResponse={success:true,code:0,data:[
 {symbol:'BTC_USDT',baseCoin:'BTC',quoteCoin:'USDT',settleCoin:'USDT',state:0,futureType:1},
 {symbol:'ETH_USDT',baseCoin:'ETH',quoteCoin:'USDT',settleCoin:'USDT',state:0,futureType:1},
 {symbol:'DOGE_USDC',baseCoin:'DOGE',quoteCoin:'USDC',settleCoin:'USDC',state:0,futureType:1},
 {symbol:'HALT_USDT',baseCoin:'HALT',quoteCoin:'USDT',settleCoin:'USDT',state:2,futureType:1},
 {symbol:'FUT_USDT',baseCoin:'FUT',quoteCoin:'USDT',settleCoin:'USDT',state:0,futureType:2}
]};
const mexc=await loadMexcCatalog(async()=>({ok:true,json:async()=>mexcResponse}));
assert.deepEqual(mexc.map(x=>x.symbol),['BTC_USDT','ETH_USDT']);
assert.equal(searchContracts(mexc,'BTCUSDT')[0].symbol,'BTC_USDT');
assert.equal(searchContracts(mexc,'ETH')[0].exchange,'MEXC');
assert.throws(()=>parseBybitInstruments({retCode:100,result:{list:[]}}));
assert.throws(()=>parseMexcContracts({success:false,data:[]}));
let loopCalls=0;
await assert.rejects(loadBybitCatalog(async()=>{loopCalls++;return {
  ok:true,json:async()=>({retCode:0,result:{list:[],nextPageCursor:'same'}})
}}),/pagination loop/);
assert.equal(loopCalls,2);

const {parseMexcKlines,aggregateMexc3m,getMexcKlines}=
  await bundle('src/market/useMexcMarket.ts','candles');
const start=Math.floor(1760000100/180)*180; // aligned first 3-minute bucket
const payload={success:true,code:0,data:{
 time:[start,start+60,start+120,start+180,start+240,start+300],
 open:[100,102,103,104,105,106],
 high:[103,105,106,108,109,110],
 low:[99,101,102,103,104,105],
 close:[102,103,104,105,106,108],
 vol:[10,20,30,40,50,60]
}};
const candles=parseMexcKlines(payload);
assert.equal(candles.length,6);
assert.equal(candles[0].timestamp,start*1000);
assert.equal(candles[0].volume,10);
const alignedStart=Math.floor(candles[0].timestamp/180000)*180000;
const effective=aggregateMexc3m(candles,candles.at(-1).timestamp+120000);
assert.ok(effective.length>=1);
assert.equal(effective[0].open,candles[0].open);
const parsed=await getMexcKlines(async(url)=>{
  assert.ok(url.startsWith('/mexc-market-api/api/v1/contract/kline/BTC_USDT'));
  assert.ok(url.includes('interval=Min1'));
  return {ok:true,json:async()=>payload};
},'BTC_USDT','3m',candles.at(-1).timestamp+120000);
assert.ok(parsed.length>=1);
await assert.rejects(getMexcKlines(async()=>{},'BTCUSDT','5m',Date.now()),/Invalid MEXC symbol/);
console.log('PASS: Bybit full cursor pagination, MEXC active USDT contracts, search and MEXC 3m candle adapter');
