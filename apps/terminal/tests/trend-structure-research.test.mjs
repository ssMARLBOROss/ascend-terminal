import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';

const file=resolve(tmpdir(),'ascend-trend-structure-research-test.mjs');
await build({entryPoints:['src/market/trendStructureResearch.ts'],outfile:file,
  bundle:true,platform:'node',format:'esm',logLevel:'silent'});
const {trendFromClosedBars,buildTrendStructure}=await import(pathToFileURL(file).href);
const day=Date.UTC(2026,9,14);
const highs=[10,11,15,13,12,11,12,16,14,13,12,13,17,15,14];
const lows=[6,7,10,9,8,9,10,11,10,9,10,11,12,11,10];
const bars=highs.map((high,i)=>{
  const low=lows[i],mid=(high+low)/2;
  return {timestamp:day+i*60000,open:mid,high,low,close:mid,volume:1};
});
const at=day+bars.length*60000;
const up=trendFromClosedBars('1m',1,bars,at);
assert.equal(up.high,'HH');
assert.equal(up.low,'HL');
assert.equal(up.trend,'LONG');
assert.equal(up.recentHigh?.confirmedAt,day+15*60000,
  'last high requires two future bars to close');
const unconfirmed=trendFromClosedBars('1m',1,bars,day+11*60000);
assert.equal(unconfirmed.trend,'NO DATA',
  'must not use unconfirmed right-hand swing lows');

const downBars=bars.map(b=>({...b,high:30-b.low,low:30-b.high,
  open:30-b.open,close:30-b.close}));
const down=trendFromClosedBars('1m',1,downBars,at);
assert.equal(down.high,'LH');
assert.equal(down.low,'LL');
assert.equal(down.trend,'SHORT');
const conflicting=bars.map((b,i)=>i===9?{...b,low:7,open:8,close:8}:b);
const transition=trendFromClosedBars('1m',1,conflicting,at);
assert.equal(transition.high,'HH');
assert.equal(transition.low,'LL');
assert.equal(transition.trend,'TRANSITION');

const snapshot=buildTrendStructure({symbol:'BTCUSDT',closed1m:bars,
  asOf:at,freshAt:at,now:at+10000,setupDirection:'SHORT'});
assert.equal(snapshot.rows.length,6);
assert.equal(snapshot.rows[5].trend,'LONG');
assert.equal(snapshot.rows[0].trend,'NO DATA');
assert.equal(snapshot.alignment,'WAIT',
  'no consensus without complete 30m and 15m swing confirmation');
const stale=buildTrendStructure({symbol:'BTCUSDT',closed1m:bars,
  asOf:at,freshAt:at,now:at+400000});
assert.ok(stale.rows.every(x=>x.trend==='NO DATA'),'stale feed must fail closed');
assert.equal(stale.alignment,'WAIT');
console.log('PASS: causal HH/HL LH/LL, pivot confirmation, transition, macro consensus and stale guards');
