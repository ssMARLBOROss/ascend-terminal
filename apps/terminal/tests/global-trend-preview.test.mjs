import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateStructure,closedCandles,calculateGlobalProxy} from '../src/market/globalTrendPreview.ts';

const AS_OF=1800000000000;
function candles(step,dir,count=90){
 const end=Math.floor(AS_OF/step)*step;
 return Array.from({length:count},(_,i)=>{
  const center=100+dir*i*.20+Math.sin(i*.85)*2.1;
  return {timestamp:end-(count-i)*step,open:center-.12,high:center+.35,
   low:center-.35,close:center+.12,volume:100+i};
 });
}
const major=dir=>({'1H':candles(3600000,dir),'30m':candles(1800000,dir)});
const universe=dir=>({BTCUSDT:major(dir),ETHUSDT:major(dir),SOLUSDT:major(dir)});
const coin=dir=>({'30m':candles(1800000,dir),'15m':candles(900000,dir)});
test('all three leaders up and coin up produce ALIGNED proxy, not full market coverage',()=>{
 const result=calculateGlobalProxy({asOf:AS_OF,leaders:universe(1),coin:coin(1)});
 assert.equal(result.market,'BULLISH');
 assert.equal(result.coin,'BULLISH');
 assert.equal(result.alignment,'ALIGNED');
 assert.equal(result.source,'BYBIT_FUTURES_PROXY');
 assert.equal(result.coverage,.55);
});
test('coin moving against global leaders is CONFLICT',()=>{
 const result=calculateGlobalProxy({asOf:AS_OF,leaders:universe(1),coin:coin(-1)});
 assert.equal(result.market,'BULLISH');
 assert.equal(result.coin,'BEARISH');
 assert.equal(result.alignment,'CONFLICT');
});
test('missing leaders produce NO_DATA, not a fabricated GLOBAL state',()=>{
 const result=calculateGlobalProxy({asOf:AS_OF,leaders:{},coin:coin(1)});
 assert.equal(result.market,'NO_DATA');
 assert.equal(result.score,null);
});
test('stale and gapped history rejected',()=>{
 assert.equal(evaluateStructure(candles(3600000,1).slice(0,-6),3600000,AS_OF).status,'NO_DATA');
 const g=candles(3600000,1);g.splice(85,1);
 assert.equal(evaluateStructure(g,3600000,AS_OF).status,'NO_DATA');
});
test('forming candle excluded from structure',()=>{
 const step=3600000,bars=candles(step,1);
 const incomplete={timestamp:AS_OF,open:999,high:1000,low:998,close:999,volume:1};
 assert.deepEqual(closedCandles([...bars,incomplete],step,AS_OF),closedCandles(bars,step,AS_OF));
});