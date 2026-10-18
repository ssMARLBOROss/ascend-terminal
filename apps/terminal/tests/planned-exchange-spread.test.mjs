import test from 'node:test';
import assert from 'node:assert/strict';
import {PLANNED_VENUES,venueSymbol,marketRequest,parseMarketQuote,
  compareVenue,calculateCrossSpread} from '../src/market/crossExchangeSpread.ts';
const t=1792300000000;
const samples={
 BYBIT:{retCode:0,time:t-1500,result:{list:[{symbol:'BTCUSDT',bid1Price:'999.5',ask1Price:'1000'}]}},
 MEXC:{success:true,data:{symbol:'BTC_USDT',bid1:'1001',ask1:'1001.5',timestamp:t-2000}},
 BINANCE:{symbol:'BTCUSDT',bidPrice:'999.5',askPrice:'1000',time:t-2000},
 BINGX:{code:0,data:{symbol:'BTC-USDT',bidPrice:'1001',askPrice:'1002',time:t-2000}},
 OKX:{code:'0',data:[{instId:'BTC-USDT-SWAP',bidPx:'1001',askPx:'1002',ts:String(t-2000)}]}
};
const q=(v)=>parseMarketQuote(samples[v],v,'BTCUSDT',t);
test('all five venue choices use distinct, canonical USDT linear symbol formats',()=>{
 assert.deepEqual(PLANNED_VENUES,['BINANCE','BINGX','MEXC','OKX','BYBIT']);
 assert.equal(venueSymbol('BTCUSDT','MEXC'),'BTC_USDT');
 assert.equal(venueSymbol('BTCUSDT','BINGX'),'BTC-USDT');
 assert.equal(venueSymbol('BTCUSDT','OKX'),'BTC-USDT-SWAP');
 assert.equal(venueSymbol('BTCUSDT','BINANCE'),'BTCUSDT');
 assert.equal(venueSymbol('ETHUSDT','BYBIT'),'ETHUSDT');
 assert.equal(venueSymbol('FOO-USDT','OKX'),null);
 for(const v of PLANNED_VENUES)assert.ok(marketRequest('BTCUSDT',v)?.startsWith('/'));
});
test('read-only fresh Bid/Ask parsers verify symbol and timestamps',()=>{
 for(const v of PLANNED_VENUES){
  const result=q(v);
  assert.equal(result.venue,v);
  assert.ok(result.bid>0&&result.ask>=result.bid);
 }
 assert.throws(()=>parseMarketQuote({...samples.BINANCE,time:t,bidPrice:'0'},'BINANCE','BTCUSDT',t));
 assert.throws(()=>parseMarketQuote(samples.MEXC,'MEXC','ETHUSDT',t));
});
test('planned venue spread calculated in both directions from executable top of book',()=>{
 const planned=q('BYBIT'),mexc=q('MEXC');
 const a=calculateCrossSpread({plannedVenue:'BYBIT',planned,compared:mexc,now:t});
 assert.equal(a.status,'READY');
 assert.equal(a.buyVenue,'BYBIT');
 assert.equal(a.sellVenue,'MEXC');
 assert.ok(a.grossPct>0);
 const b=calculateCrossSpread({plannedVenue:'MEXC',planned:mexc,compared:planned,now:t});
 assert.equal(b.status,'READY');
 assert.equal(b.buyVenue,'BYBIT');
 assert.equal(b.compareVenue,'BYBIT');
 assert.equal(compareVenue('BINGX'),'BYBIT');
});
test('delayed price, crossed bid/ask, unavailable venue never invent profit',()=>{
 const p=q('BINANCE'),base=q('BYBIT');
 assert.equal(calculateCrossSpread({plannedVenue:'BINANCE',planned:p,compared:base,
  now:t+90000}).status,'NO_DATA');
 assert.equal(calculateCrossSpread({plannedVenue:'BINANCE',planned:{...p,at:t-50000},
  compared:base,now:t}).status,'NO_DATA');
 assert.equal(calculateCrossSpread({plannedVenue:'BINANCE',planned:{...p,ask:990},
  compared:base,now:t}).status,'NO_DATA');
 assert.equal(calculateCrossSpread({plannedVenue:'BINANCE',planned:undefined,
  compared:base,now:t}).grossPct,undefined);
});
test('negative gross difference shown as negative rather than a profit',()=>{
 const a=q('BINANCE'),b=q('BYBIT');
 const result=calculateCrossSpread({plannedVenue:'BINANCE',planned:a,compared:b,now:t});
 assert.equal(result.status,'READY');
 assert.ok(result.grossPct<0);
});