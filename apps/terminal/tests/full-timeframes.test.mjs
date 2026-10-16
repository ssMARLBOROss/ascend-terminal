import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
const out=resolve(tmpdir(),'ascend-full-timeframes-test.mjs');
await build({entryPoints:['src/market/fullTimeframes.ts'],outfile:out,
  platform:'node',format:'esm',bundle:true,logLevel:'silent'});
const {TF_FULL,deriveTimeframe,fullyClosed}=await import(pathToFileURL(out).href);
const D=Date.UTC(2026,9,16),M=60000;
assert.deepEqual(TF_FULL.map(x=>x[0]),[
 '1m','3m','5m','10m','15m','30m','45m','1H','2H','4H','6H','12H','1D'
]);
const base5=Array.from({length:5},(_,i)=>({
 timestamp:D+i*5*M,open:1+i*.1,high:1.2+i*.1,
 low:.8+i*.1,close:1.1+i*.1,volume:10+i
}));
const tens=deriveTimeframe(base5,5,10);
assert.equal(tens.length,3);
assert.equal(tens[0].timestamp,D);
assert.equal(tens[0].open,1);
assert.equal(tens[0].high,1.3);
assert.equal(tens[0].low,.8);
assert.ok(Math.abs(tens[0].close-1.2)<1e-10);
assert.equal(tens[0].volume,21);
assert.equal(tens[2].timestamp,D+20*M);
assert.equal(fullyClosed(tens,10,D+25*M).length,2,
 'no lookahead from in-progress 10m bucket');
const missed=deriveTimeframe(base5.filter((_,i)=>i!==2),5,10);
assert.deepEqual(missed.map(x=>x.timestamp),[D,D+20*M],
 'historical bucket missing a base bar must never be synthesized');

const base15=Array.from({length:8},(_,i)=>({
 timestamp:D+i*15*M,open:10+i,high:11+i,low:9+i,
 close:10.5+i,volume:2
}));
const fortyFive=deriveTimeframe(base15,15,45);
assert.equal(fortyFive.length,3);
assert.equal(fortyFive[0].volume,6);
assert.equal(fortyFive[1].timestamp,D+45*M);
assert.equal(fortyFive[2].timestamp,D+90*M);
assert.equal(fullyClosed(fortyFive,45,D+120*M).length,2,
 'unclosed 45m candle never admitted to indicators');
assert.equal(deriveTimeframe(base15,15,40).length,0,
 'non-divisible intervals unsupported');
console.log('PASS: complete 13-TF list, 10m/45m OHLCV, gaps and non-lookahead');
