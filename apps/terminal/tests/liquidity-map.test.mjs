import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';

const target=resolve(tmpdir(),'ascend-liquidity-map-tests.mjs');
await build({entryPoints:['src/market/liquidityMapEngine.ts'],
  outfile:target,bundle:true,platform:'node',format:'esm',logLevel:'silent'});
const {computeLiquidityMap,nyCashWindow}=await import(pathToFileURL(target).href);
const MIN=60000,DAY=86400000,day=Date.UTC(2026,9,9);
const candles=(n)=>Array.from({length:n},(_,i)=>({
  timestamp:day+i*MIN,open:100,high:100.1,low:99.9,close:100,volume:15
}));
const prev={symbol:'BTCUSDT',dayStartUtc:day-DAY,high:101,low:99};
const m=(rows,now=day+rows.length*MIN)=>
  computeLiquidityMap({symbol:'BTCUSDT',bars:rows,asOf:now,previousDay:prev});
assert.equal(nyCashWindow(day).rthOpenUtc,day+13.5*3600000,'DST-aware NY open');
assert.equal(nyCashWindow(day).rthCloseUtc,day+20*3600000);
const jan=Date.UTC(2026,0,12);
assert.equal(nyCashWindow(jan).rthOpenUtc,jan+14.5*3600000,'winter NY open');
assert.equal(nyCashWindow(jan).ibCloseUtc,jan+15.5*3600000);
assert.equal(m(candles(20)),undefined,'ATR 5m history must warm up');
const early=m(candles(120));
assert.ok(early?.atr>0,'ATR uses complete historical 5m bars');
assert.equal(early?.levels.find(l=>l.key==='ONH')?.state,'LIVE');
assert.equal(early?.levels.find(l=>l.key==='YH')?.state,'FROZEN');
assert.ok(!early?.levels.some(l=>l.key==='RTH_H'),'no future RTH level');
assert.equal(m(candles(361))?.levels.find(l=>l.key==='ONH')?.state,'FROZEN',
  'ONH frozen only after 06 UTC, no premature signal');
const bars=candles(430);
bars[365]={...bars[365],high:101.3,close:100};
bars[370]={...bars[370],low:98.1,close:99.1};
bars[371]={...bars[371],low:98.5,close:99.2};
bars[372]={...bars[372],low:99.0,close:99.3};
bars[373]={...bars[373],low:99.1,close:99.4};
bars[374]={...bars[374],low:99.5,close:100};
const snap=m(bars);
const onh=snap.levels.find(l=>l.key==='ONH'),onl=snap.levels.find(l=>l.key==='ONL');
assert.equal(onh.state,'RECLAIM','upper wick with close below becomes reclaim');
assert.equal(onh.sweepAt,day+366*MIN);
assert.equal(onh.reclaimAt,day+366*MIN,'no false intrabar timestamp');
assert.ok(onh.depthPct>1);
assert.equal(onl.state,'RECLAIM','acceptance followed by return');
assert.equal(onl.sweepAt,day+371*MIN);
assert.equal(onl.acceptanceAt,day+372*MIN,'two closed one-minute bars required');
assert.equal(onl.reclaimAt,day+375*MIN);
assert.ok(snap.events.some(e=>e.key==='ONL'&&e.type==='ACCEPTANCE'));
assert.equal(snap.upper.key,'ONH');
assert.equal(snap.lower.key,'ONL');
const before=m(bars,day+365*MIN);
assert.equal(before.levels.find(l=>l.key==='ONH').state,'FROZEN',
  'future sweep excluded when asOf before the candle closes');
const hole=candles(430);hole.splice(19,1);
assert.equal(m(hole),undefined,'missing minute fails closed');
const noon=m(candles(16*60));
assert.equal(noon.levels.find(l=>l.key==='IBH').state,'FROZEN',
  'IB becomes frozen after one New York cash-market hour');
assert.equal(noon.levels.find(l=>l.key==='RTH_H').state,'LIVE',
  'RTH must not freeze before New York cash close');
const after=m(candles(21*60));
assert.equal(after.levels.find(l=>l.key==='RTH_H').state,'FROZEN');
console.log('PASS: Liquidity Map V1 frozen/live, sweep depth/time, reclaim, acceptance, DST, ATR, gaps');
