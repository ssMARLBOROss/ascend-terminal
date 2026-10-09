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
const before=observeRadarTicker(ticker,make(60),start+60*step);
assert.equal(before.stage,'BUILDING');
assert.equal(before.onh,undefined);
const quiet=observeRadarTicker(ticker,make(85),start+85*step);
assert.equal(quiet.stage,'SCANNING');
assert.equal(quiet.onh,101);
const swept=make(86);
swept[72]={...swept[72],high:103};
const result=observeRadarTicker(ticker,swept,start+86*step);
assert.equal(result.stage,'SHIFTING');
assert.equal(result.direction,'SHORT');
assert.equal(result.integrity,'COMPLETE');
const gap=make(86);
gap.splice(9,1);
assert.equal(observeRadarTicker(ticker,gap,start+86*step).stage,'NO DATA');
const ambiguous=make(85);
ambiguous[72]={...ambiguous[72],high:104,low:98};
assert.equal(observeRadarTicker(ticker,ambiguous,start+85*step).stage,'SCANNING');
console.log('PASS radar group selection, 5m sweep, reclaim and gap guards');
