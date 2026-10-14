import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';

const file=resolve(tmpdir(),'ascend-cloudflare-market-indicators-test.mjs');
await build({entryPoints:['src/market/cloudflareIndicators.ts'],outfile:file,
  bundle:true,platform:'node',format:'esm',logLevel:'silent'});
const {closedMarketCandles,smaAt,rsi14,rsiZone,volumeRatio}=
  await import(pathToFileURL(file).href);

const start=1760000000000;
const bars=Array.from({length:202},(_,i)=>({
  timestamp:start+i*60000,open:100+i,high:101+i,
  low:99+i,close:100+i,volume:20
}));
const closed=closedMarketCandles(bars,'1m',start+201*60000);
assert.equal(closed.length,201,'never include the currently forming candle');
assert.equal(closed.at(-1).timestamp,start+200*60000);
assert.equal(smaAt(closed,20),290.5);
assert.equal(smaAt(closed,50),275.5);
assert.equal(smaAt(closed,200),200.5);
assert.equal(rsi14(closed).at(-1).value,100);
assert.equal(rsiZone(20),'RC30');
assert.equal(rsiZone(70),'RC70');
assert.equal(rsiZone(50),'NEUTRAL');
assert.equal(rsi14(bars.map(x=>({...x,close:100}))).at(-1).value,50);
assert.equal(volumeRatio(closed),1);
assert.equal(closedMarketCandles(bars,'bad-timeframe').length,0);
console.log('PASS: closed-candle causal RSI/SMA, RC zones, volume ratio, no-lookahead');
