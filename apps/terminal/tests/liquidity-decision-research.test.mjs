import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';

const outfile=resolve(tmpdir(),'ascend-liquidity-decision-tests.mjs');
await build({entryPoints:['src/market/liquidityDecisionResearch.ts'],
  outfile,bundle:true,platform:'node',format:'esm',logLevel:'silent'});
const {aggregateClosed,buildMarketLiquidity,buildDecisionResearch,appendDecisionRecord}=
  await import(pathToFileURL(outfile).href);
const M=60000,D=86400000;
const day=Date.UTC(2026,9,14);
const prevDay={symbol:'BTCUSDT',dayStartUtc:day-D,high:200,low:50};
const bars=Array.from({length:960},(_,i)=>{
  const p=100+i*.01;
  return {timestamp:day+i*M,open:p,high:p+.02,low:p-.02,close:p+.005,volume:10};
});
const asOf=day+960*M;
const closed=aggregateClosed(bars,30);
assert.equal(closed.length,32);
assert.equal(closed[0].timestamp,day);
assert.equal(aggregateClosed(bars.slice(0,32),30).length,1,
  'incomplete 30m bar not included');

const liq=buildMarketLiquidity({symbol:'BTCUSDT',bars,asOf,previousDay:prevDay,
  onh:105,onl:99});
assert.ok(liq.levels.some(x=>x.id==='YH'&&x.state==='FROZEN'));
assert.ok(liq.levels.some(x=>x.id==='ONH'&&x.state==='FROZEN'));
assert.ok(liq.levels.some(x=>x.id==='RTHH'&&x.state==='LIVE'));
assert.ok(liq.levels.some(x=>x.id==='IBH'&&x.state==='FROZEN'));
assert.equal(liq.bsl?.anchor.id,'YH');
assert.ok(liq.atr5m>0&&liq.bsl.high>liq.bsl.low);

const ok=at=>({status:'OK',detail:'CONFIRMED',at});
const report={symbol:'BTCUSDT',dayStart:day,asOf,direction:'LONG',
  phase:'ENTRY READY',
  steps:{choch:ok(asOf-25*M),bos:ok(asOf-15*M),retest:ok(asOf-8*M),
    micro:ok(asOf-M),session:ok(asOf-M),entry:ok(asOf-M)},
  entry:bars.at(-1).close,sl:bars.at(-1).close-1,tp:200,rr:90};
let decision=buildDecisionResearch({symbol:'BTCUSDT',bars,report,
  liquidity:liq,now:asOf+10000,freshAt:asOf});
assert.equal(decision.checks.length,6);
assert.equal(decision.checks[0].direction,'LONG');
assert.equal(decision.checks[1].direction,'LONG');
assert.equal(decision.status,'ENTRY READY');
assert.ok(decision.rr>2);
let record=appendDecisionRecord([],decision);
assert.equal(record.length,1);
assert.equal(appendDecisionRecord(record,decision).length,1,'deduplicate transitions');

const stale=buildDecisionResearch({symbol:'BTCUSDT',bars,report,
  liquidity:liq,now:asOf+5*M,freshAt:asOf});
assert.notEqual(stale.status,'ENTRY READY');
const miss=buildDecisionResearch({symbol:'BTCUSDT',bars:bars.slice(0,65),report,
  liquidity:liq,now:asOf+10000,freshAt:asOf});
assert.notEqual(miss.status,'ENTRY READY');
const lowRR=buildDecisionResearch({symbol:'BTCUSDT',bars,
  report:{...report,sl:report.entry-60},liquidity:liq,
  now:asOf+10000,freshAt:asOf});
assert.equal(lowRR.status,'SKIP');
const early=buildMarketLiquidity({symbol:'BTCUSDT',
  bars:bars.slice(0,350),asOf:day+350*M,previousDay:prevDay,onh:105,onl:99});
assert.ok(!early.levels.some(x=>x.id==='ONH'),
  'overnight levels cannot be frozen before 06:00 UTC');
assert.ok(!early.levels.some(x=>x.id==='IBH'));
console.log('PASS: 30m/15m closed votes, NY DST session, LIVE/FROZEN, R:R, stale/gap and journal');
