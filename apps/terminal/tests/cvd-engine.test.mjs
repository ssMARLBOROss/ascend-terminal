import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';

const output=resolve(tmpdir(),'ascend-continuous-cvd.test.mjs');
await build({entryPoints:['src/market/cvdEngine.ts'],outfile:output,
  format:'esm',platform:'node',bundle:true,logLevel:'silent'});
const {parseTradeFrame,CvdAccumulator}=await import(pathToFileURL(output).href);
const symbol='BTCUSDT';
const t=1760000000000,base=Math.floor(t/60000)*60000;
const trade=(id,time,side,qty,price=100)=>({
  i:id,T:time,S:side,v:String(qty),p:String(price),s:symbol
});
const p={topic:'publicTrade.BTCUSDT',data:[
  trade('c',base+3000,'Sell',2),trade('a',base+1000,'Buy',3),
  trade('b',base+2000,'Buy',1),trade('bad',0,'Buy',2)
]};
const parsed=parseTradeFrame(p,symbol);
assert.equal(parsed.length,3);
assert.deepEqual(parsed.map(x=>x.id),['a','b','c']);
assert.equal(parseTradeFrame({topic:'publicTrade.ETHUSDT',data:p.data},symbol).length,0);
const acc=new CvdAccumulator(symbol,base,'FIRST_CONNECTION');
assert.equal(acc.add(parsed,base+3500),3);
assert.equal(acc.add(parsed,base+3500),0,'repeated IDs never double-counted');
assert.equal(acc.segment.trades,3);
assert.equal(acc.segment.buyVolume,4);
assert.equal(acc.segment.sellVolume,2);
const extra=parseTradeFrame({topic:p.topic,data:[
  trade('d',base+60000+1000,'Sell',1,98),
  trade('e',base+60000+2000,'Buy',.5,99)
]},symbol);
assert.equal(acc.add(extra,base+63000),2);
const output5=acc.snapshot('5m',base+360000);
assert.equal(output5.volumeDelta,1.5);
assert.equal(output5.points.length,1);
assert.equal(output5.points[0].cumulative,1.5);
assert.equal(output5.notionalDelta,3*100+1*100+.5*99-2*100-1*98);
const output1=acc.snapshot('1m',base+180000);
assert.equal(output1.points.length,2);
assert.equal(output1.points[0].delta,2);
assert.equal(output1.points[1].delta,-.5);
assert.equal(output1.points[1].cumulative,1.5);
assert.equal(acc.segment.health,'LIVE');
const old=parseTradeFrame({topic:p.topic,data:[trade('late',base+500,'Buy',5)]},symbol);
acc.add(old,base+65000);
assert.equal(acc.segment.health,'GAP');
assert.equal(acc.segment.gapReason,'OUT_OF_ORDER_TRADES');
const next=new CvdAccumulator(symbol,base+90000,'RECONNECTED_AFTER_UNVERIFIED_GAP');
assert.equal(next.segment.buyVolume,0);
assert.equal(next.segment.trades,0);
assert.equal(next.snapshot('1m',base+90001).volumeDelta,0);
assert.equal(next.segment.id!==acc.segment.id,true);
console.log('PASS: CVD publicTrade parser, order/dedupe, buy/sell/notional, 1m/5m, GAP and reset');
