import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
const out=resolve(tmpdir(),'ascend-focus-early-research-test.mjs');
await build({entryPoints:['src/market/focusEarlyResearch.ts'],outfile:out,
  bundle:true,format:'esm',platform:'node',logLevel:'silent'});
const {focusEarlyOnResearch}=await import(pathToFileURL(out).href);
const D=Date.UTC(2026,9,16),M=60000;
const data=Array.from({length:380},(_,i)=>{
  const five=Math.floor(i/5),before=i<360;
  const high=before?120:five===74?102:five===75?105:110;
  const low=before?100:five===74?99:five===75?100.2:105;
  const close=before?110:five===74?101:five===75?104:107;
  const open=before?110:five===74?100.5:five===75?101.2:107;
  const volume=five===74?50:10;
  return {timestamp:D+i*M,open,high,low,close,volume};
});
const current=D+380*M;
const focus=focusEarlyOnResearch('ZECUSDT',data,current,current,current);
assert.equal(focus.status,'EARLY CANDIDATE',focus.reason);
assert.equal(focus.direction,'LONG');
assert.equal(focus.level,'ONL');
assert.equal(focus.target,120);
assert.ok(focus.rr>=2);
assert.equal(focus.isResearch,true);
assert.equal(focus.reactionAt,current);
const noFuture=focusEarlyOnResearch('ZECUSDT',data,current-5*M,current-5*M,current-5*M);
assert.notEqual(noFuture.status,'EARLY CANDIDATE','no right-hand 5m candle yet');
const gap=data.filter((_,i)=>i!==310);
assert.equal(focusEarlyOnResearch('ZECUSDT',gap,current,current,current).status,'NONE',
  'missing one 1m bar means no reliable reconstructed 5m feed');
assert.equal(focusEarlyOnResearch('ZECUSDT',data,current,current,current+200000).status,
  'NONE','stale CORE data must fail closed');
const forming=focusEarlyOnResearch('ZECUSDT',data.slice(0,350),D+350*M,D+350*M,D+350*M);
assert.equal(forming.status,'NONE','overnight zone must be frozen');
console.log('PASS: focus derives same causal EARLY ON candidate and fails on stale/future/missing data');
