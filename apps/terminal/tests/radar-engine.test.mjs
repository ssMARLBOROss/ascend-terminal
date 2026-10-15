import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
const output=resolve(tmpdir(),'ascend-radar-engine-test.mjs');
await build({entryPoints:['src/market/radarEngine.ts'],outfile:output,
  platform:'node',format:'esm',bundle:true,logLevel:'silent'});
const {groupMove,parseRadarTickers,selectRadarUniverse,observeRadarTicker}=
  await import(pathToFileURL(output).href);
assert.equal(groupMove(2),'0.5–3%');
assert.equal(groupMove(-7),'3–12%');
assert.equal(groupMove(12),'12%+');
assert.equal(groupMove(-.4),'<0.5%');
const payload={retCode:0,result:{list:[
 {symbol:'BTCUSDT',lastPrice:'100',price24hPcnt:'.015',turnover24h:'100000000'},
 {symbol:'SOLUSDT',lastPrice:'50',price24hPcnt:'-.06',turnover24h:'30000000'},
 {symbol:'ETHUSDT',lastPrice:'40',price24hPcnt:'.15',turnover24h:'70000000'},
 {symbol:'TESTUSDT',lastPrice:'1',price24hPcnt:'.018',turnover24h:'3000000'},
 {symbol:'FAILUSDT',lastPrice:'0',price24hPcnt:'.11',turnover24h:'4000000'}
]}};
const tickers=parseRadarTickers(payload);
assert.equal(tickers.length,4);
assert.deepEqual(selectRadarUniverse(tickers,3).map(x=>x.symbol),
  ['BTCUSDT','ETHUSDT','SOLUSDT']);
const start=Date.UTC(2026,9,8),step=300000;
const make=n=>Array.from({length:n},(_,i)=>({
 timestamp:start+i*step,open:100,high:101,low:99,close:100,volume:10
}));
const ticker=tickers[0];
const makeQuiet=n=>{
  const rows=make(n);
  for(let i=72;i<n;i++)rows[i]={...rows[i],high:100.5,low:99.5};
  return rows;
};
const before=observeRadarTicker(ticker,make(60),start+60*step);
assert.equal(before.stage,'BUILDING');
assert.equal(before.onState,'LIVE');
assert.equal(before.onEvent,'FORMING');
assert.equal(before.onh,101);
assert.equal(before.onl,99);
const quiet=observeRadarTicker(ticker,makeQuiet(85),start+85*step);
assert.equal(quiet.stage,'SCANNING');
assert.equal(quiet.onh,101);
assert.equal(quiet.onState,'FROZEN');
assert.equal(quiet.onEvent,'AWAY');
assert.equal(quiet.onSide,'ONH');
const swept=make(86);
swept[72]={...swept[72],high:103};
const result=observeRadarTicker(ticker,swept,start+86*step);
assert.equal(result.stage,'SHIFTING');
assert.equal(result.direction,'SHORT');
assert.equal(result.onSide,'ONH');
assert.equal(result.onEvent,'RECLAIM');
assert.equal(result.sweepAt,start+73*step);
assert.equal(result.resolutionAt,start+73*step);
assert.equal(result.integrity,'COMPLETE');
const gap=make(86);
gap.splice(9,1);
assert.equal(observeRadarTicker(ticker,gap,start+86*step).stage,'NO DATA');
const ambiguous=make(85);
ambiguous[72]={...ambiguous[72],high:104,low:98};
assert.equal(observeRadarTicker(ticker,ambiguous,start+85*step).stage,'SCANNING');
// ONL sweep/reclaim: lower wick below 99, 5m closes above it. No entry signal.
const bottom=make(86);
bottom[74]={...bottom[74],low:97,close:100};
const onl=observeRadarTicker(ticker,bottom,start+86*step);
assert.equal(onl.stage,'SHIFTING');
assert.equal(onl.onSide,'ONL');
assert.equal(onl.onEvent,'RECLAIM');
assert.equal(onl.direction,'LONG');
assert.equal(onl.sweepAt,start+75*step);
assert.equal(onl.resolutionAt,start+75*step);
// Near frozen ONL within 0.5% is WATCH without needing RSI30/70.
const approaching=makeQuiet(85);
approaching[84]={...approaching[84],open:99.3,high:99.5,low:99.3,close:99.4};
const watched=observeRadarTicker(ticker,approaching,start+85*step);
assert.equal(watched.stage,'WATCH');
assert.equal(watched.onSide,'ONL');
assert.equal(watched.onEvent,'APPROACH');
assert.ok(watched.distancePct<.5);
// Touch is distinct from wick sweep and must not imply a confirmed reversal.
const touching=makeQuiet(85);
touching[84]={...touching[84],open:99.3,high:100,low:99,close:99.4};
const touched=observeRadarTicker(ticker,touching,start+85*step);
assert.equal(touched.stage,'WATCH');
assert.equal(touched.onEvent,'TOUCH');
assert.equal(touched.touchAt,start+85*step);
// Acceptance below ONL uses TWO closed 5m bars beyond the frozen level.
const accepted=make(86);
accepted[73]={...accepted[73],open:100,high:100,low:97,close:98};
accepted[74]={...accepted[74],open:98,high:99,low:97,close:98};
const acceptedOnl=observeRadarTicker(ticker,accepted,start+86*step);
assert.equal(acceptedOnl.stage,'SHIFTING');
assert.equal(acceptedOnl.onEvent,'ACCEPTANCE');
assert.equal(acceptedOnl.direction,'SHORT');
// Latest incomplete/future 5m candle may never produce a decision.
const premature=make(86);
premature[85]={...premature[85],low:97,close:100};
assert.equal(observeRadarTicker(ticker,premature,start+85*step).stage,'SCANNING');
console.log('PASS ONH/ONL LIVE→FROZEN, ONL touch/sweep/reclaim/acceptance, no-lookahead and coverage');
