import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
const output=resolve(tmpdir(),'ascend-early-on-research-test.mjs');
await build({entryPoints:['src/market/earlyOnResearch.ts'],outfile:output,
  platform:'node',format:'esm',bundle:true,logLevel:'silent'});
const {analyzeEarlyOnSetup}=await import(pathToFileURL(output).href);
const base=Date.UTC(2026,9,16),FIVE=300000;
const ticker={symbol:'TESTUSDT',price:101,change24h:4,turnover24h:10000000,
  group:'3–12%',stage:'SHIFTING',direction:'LONG',reason:'test',zone:'MID',
  integrity:'COMPLETE',onState:'FROZEN',onSide:'ONL',onEvent:'RECLAIM',
  onh:120,onl:100,levelPrice:100,sweepAt:base+75*FIVE,
  resolutionAt:base+75*FIVE,observedAt:base+76*FIVE};
const quiet=(n=76)=>Array.from({length:n},(_,i)=>({
  timestamp:base+i*FIVE,open:105,high:120,low:100,close:105,volume:10
}));
const buildLong=()=>{
  const b=quiet();
  b[74]={...b[74],open:101,high:102,low:99,close:100.5,volume:50};
  b[75]={...b[75],open:100.5,high:103,low:100.2,close:101.5,volume:15};
  return b;
};
const bars=buildLong(),at=base+76*FIVE;
const ready=analyzeEarlyOnSetup(ticker,bars,at);
assert.equal(ready.status,'EARLY CANDIDATE');
assert.equal(ready.direction,'LONG');
assert.equal(ready.indicativeEntry,101.5);
assert.equal(ready.target,120);
assert.ok(ready.structuralSl<99);
assert.ok(ready.rr>=2);
assert.equal(ready.sweepAt,base+75*FIVE);
assert.equal(ready.reactionAt,at);
assert.equal(ready.isResearch,true);
assert.ok(ready.reason.includes('1m'),'only a request to verify micro structure');

const before=analyzeEarlyOnSetup({...ticker,integrity:'INCOMPLETE'},bars,at);
assert.equal(before.status,'NONE','no candidate on bad data');
const forming=analyzeEarlyOnSetup({...ticker,onState:'LIVE'},bars,at);
assert.equal(forming.status,'NONE','no candidate before overnight freeze');
const noVolume=buildLong();
noVolume[74]={...noVolume[74],volume:10};
assert.equal(analyzeEarlyOnSetup(ticker,noVolume,at).status,'EARLY WATCH',
  'without spike, sweep/reclaim remains only observation');
const noFollowThrough=buildLong();
noFollowThrough[75]={...noFollowThrough[75],close:100,open:100.5};
assert.equal(analyzeEarlyOnSetup(ticker,noFollowThrough,at).status,'EARLY WATCH',
  'same candle reclaim is insufficient for an early candidate');
const early=analyzeEarlyOnSetup({...ticker,resolutionAt:base+75*FIVE},
  bars.slice(0,75),base+75*FIVE);
assert.equal(early.status,'EARLY WATCH','no knowledge of future follow-through');
const stale=analyzeEarlyOnSetup(ticker,bars,at+15*60000);
assert.equal(stale.status,'EXPIRED','late observation cannot remain entry candidate');
const invalidBars=buildLong().concat([{
  timestamp:base+76*FIVE,open:101.5,high:102,low:98,close:99,volume:10
}]);
assert.equal(analyzeEarlyOnSetup(ticker,invalidBars,at+FIVE).status,'EARLY SKIP',
  'break of reclaim invalidates early setup');
const lowRR=buildLong();lowRR[75]={...lowRR[75],
  open:117,high:119,low:116.5,close:118.5};
assert.equal(analyzeEarlyOnSetup(ticker,lowRR,at).status,'EARLY SKIP',
  'TP reward less than twice structural risk');
const onhBars=quiet();
onhBars[74]={...onhBars[74],open:119,high:121,low:118,close:119.5,volume:50};
onhBars[75]={...onhBars[75],open:119.5,high:119.8,low:117,close:118.7,volume:12};
const short=analyzeEarlyOnSetup({...ticker,onSide:'ONH',direction:'SHORT',
  levelPrice:120},onhBars,at);
assert.equal(short.status,'EARLY CANDIDATE');
assert.equal(short.direction,'SHORT');
assert.equal(short.target,100);
assert.ok(short.structuralSl>121);
const accepting=analyzeEarlyOnSetup({...ticker,onEvent:'ACCEPTANCE',
  direction:'SHORT'},bars,at);
assert.equal(accepting.status,'EARLY WATCH','never invent TP for breakout continuation');
console.log('PASS EARLY ON: frozen, sweep/reclaim, distinct 5m reaction, volume, ATR SL, ON TP, RR, expiry, invalidation, no-lookahead and no execution');
