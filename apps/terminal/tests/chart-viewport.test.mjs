import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';

const target=resolve(tmpdir(),'ascend-tight-chart-viewport-test.mjs');
await build({entryPoints:['src/components/chartViewport.ts'],outfile:target,
  bundle:true,platform:'node',format:'esm',logLevel:'silent'});
const {TIGHT_FOCUS_BARS,initialChartRange,tightCandlestickRange}=
  await import(pathToFileURL(target).href);
const bar=(i,low,high)=>({
  timestamp:1760000000000+i*60000,open:(low+high)/2,
  close:(low+high)/2,high,low,volume:2
});
const candles=Array.from({length:320},(_,i)=>bar(i,100+i*.04,102+i*.04));
// Deliberately remote historical outliers — no relation to visible recent action.
candles[0]=bar(0,100,100000);
candles[1]=bar(1,10,115);
const focused=initialChartRange('15m',candles.length,'TIGHT');
assert.equal(focused.from,320-TIGHT_FOCUS_BARS['15m']);
assert.equal(focused.to,325);
const range=tightCandlestickRange(candles,focused);
assert.ok(range.maxValue<130,'off-screen price spike must not stretch tight range');
assert.ok(range.minValue>105,'off-screen deep low must not stretch tight range');
const full=initialChartRange('15m',candles.length,'FULL');
assert.equal(full.from,0);
assert.equal(full.to,325);
const fullInfo=tightCandlestickRange(candles,full);
assert.ok(fullInfo.maxValue>=100000,'FULL historical range retains distant candles');
const historic=tightCandlestickRange(candles,{from:0,to:2});
assert.ok(historic.maxValue>=100000,'scrolling back must rescale to historical bars');
assert.equal(tightCandlestickRange(candles,{from:400,to:425}),null,
  'future blank space must not fabricate a price range');
assert.equal(tightCandlestickRange([],null),null);
assert.ok(tightCandlestickRange([bar(0,100,100)],null).maxValue>100,
  'flat candle remains visible without division by zero');
assert.equal(initialChartRange('5m',0,'TIGHT'),null);
assert.equal(initialChartRange('5m',320,'TIGHT').from,175);
assert.equal(initialChartRange('1m',320,'TIGHT').from,140);
console.log('PASS: TIGHT/FULL visible wick scale, historical pan, empty/flat guards and TF focus');
