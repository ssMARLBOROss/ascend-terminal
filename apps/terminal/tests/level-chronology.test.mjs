import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';

const file=resolve(tmpdir(),'ascend-level-chronology-test.mjs');
await build({entryPoints:['src/market/levelChronology.ts'],outfile:file,
  bundle:true,platform:'node',format:'esm',logLevel:'silent'});
const {deriveLevelChronology}=await import(pathToFileURL(file).href);
const t=Date.UTC(2026,9,14,6,0);
const bar=(i,open,high,low,close)=>({
  timestamp:t+i*60000,open,high,low,close,volume:10
});
const candles=[
  bar(0,98,99,97,98),
  bar(1,99,100,99,99.5),   // level touch; known only at 06:02
  bar(2,99.5,103,99,99.5), // wick sweeps 100, closes back below
  bar(3,99.5,102,99,101),  // close outside (break)
  bar(4,101,102,98,99.5),  // reclaim closes back below
  bar(5,99.5,102,98,99)    // future bar must not be used
];
const lev={id:'ONH',side:'UPPER',price:100,availableFrom:t};
let rows=deriveLevelChronology(candles,[lev],t+5*60000);
assert.equal(rows.length,1);
assert.equal(rows[0].touch?.at,t+2*60000);
assert.equal(rows[0].sweep?.at,t+3*60000);
assert.equal(rows[0].reclaim?.at,t+5*60000);
assert.ok(rows[0].events.every(x=>x.at<=t+5*60000));
rows=deriveLevelChronology(candles,[{...lev,availableFrom:t+3*60000}],t+5*60000);
assert.equal(rows[0].sweep,undefined,'cannot backdate events before freeze');
assert.equal(rows[0].reclaim?.at,t+5*60000);
assert.equal(deriveLevelChronology(candles,[lev],t+60000)[0].sweep,undefined);
console.log('PASS: closed 1m touch/sweep/reclaim times and FROZEN level availability');
