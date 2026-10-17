'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const engine=require('../global-trend-v1.js');
const AS_OF=1800000000;
function make(tf,dir,count=90) {
  const end=Math.floor(AS_OF/tf)*tf;
  return Array.from({length:count},(_,i)=>{
    const mid=100+dir*i*.20+Math.sin(i*.85)*2.1;
    return {time:end-(count-i)*tf,open:mid-.12,high:mid+.35,
      low:mid-.35,close:mid+.12,volume:100+i};
  });
}
const major=dir=>({'1h':make(3600,dir),'30m':make(1800,dir)});
const coin=dir=>({'30m':make(1800,dir),'15m':make(900,dir),'5m':make(300,dir)});
const leaders=dir=>({BTC_USDT:major(dir),ETH_USDT:major(dir),SOL_USDT:major(dir)});
const breadth={source:'reversal-radar',running:true,available:200,long:110,short:40,neutral:50};
test('long global context and long coin align, while absent CVD stays PARTIAL/PROXY',()=>{
  const result=engine.evaluate({asOf:AS_OF,leaders:leaders(1),coin:coin(1),breadth});
  assert.equal(result.market.state,'BULLISH');
  assert.equal(result.market.status,'PARTIAL');
  assert.equal(result.market.source,'SINGLE_VENUE_PROXY');
  assert.ok(Math.abs(result.market.coverage-.85)<1e-9);
  assert.equal(result.alignment.state,'ALIGNED');
  assert.equal(result.isTradingSignal,false);
});
test('global bullish and bearish coin are a conflict, not entry',()=>{
  const result=engine.evaluate({asOf:AS_OF,leaders:leaders(1),coin:coin(-1),breadth});
  assert.equal(result.market.state,'BULLISH');
  assert.equal(result.coin.label,'BEARISH');
  assert.equal(result.alignment.state,'CONFLICT');
});
test('missing leader candles do not fabricate a trend',()=>{
  const result=engine.evaluate({asOf:AS_OF,leaders:{},coin:coin(1),breadth});
  assert.equal(result.market.state,'NO_DATA');
  assert.equal(result.market.score,null);
});
test('stale and gapped history is rejected',()=>{
  assert.equal(engine.structure(make(3600,1).slice(0,-6),3600,AS_OF).status,'NO_DATA');
  const gapped=make(3600,1);gapped.splice(85,1);
  assert.equal(engine.structure(gapped,3600,AS_OF).status,'NO_DATA');
});
test('unfinished candle does not enter the time-window',()=>{
  const base=engine.structure(make(3600,1),3600,AS_OF);
  const crafted=[...make(3600,1),{time:AS_OF,open:900,high:1000,low:899,close:999,volume:100}];
  const future=engine.structure(crafted,3600,AS_OF);
  assert.equal(future.close,base.close);
  assert.equal(future.shape,base.shape);
});