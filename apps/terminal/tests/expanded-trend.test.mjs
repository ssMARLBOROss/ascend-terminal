import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
const out=resolve(tmpdir(),'ascend-expanded-trend-test.mjs');
await build({entryPoints:['src/market/useExpandedTrendResearch.ts'],
  outfile:out,platform:'node',format:'esm',bundle:true,
  packages:'external',logLevel:'silent'});
const {expandTrendStructure}=await import(pathToFileURL(out).href);
const D=Date.UTC(2026,9,16,12),M=60000;
const make=(step,count)=>{
 const begin=Math.floor((D-(count-1)*step*M)/(step*M))*step*M;
 return Array.from({length:count},(_,i)=>{
  const center=100+i*.1+Math.sin(i*.75)*2;
  return {timestamp:begin+i*step*M,open:center,
    high:center+1,low:center-1,close:center+.1,volume:20+i};
 });
};
const fake=(tf,minutes)=>({tf,minutes,trend:'NO DATA',high:'—',
 low:'—',bars:0,reason:'CORE no structure'});
const core={symbol:'TIAUSDT',asOf:D,rows:[
  fake('30m',30),fake('15m',15),fake('10m',10),
  fake('5m',5),fake('3m',3),fake('1m',1)
],alignment:'WAIT',setupConflict:false};
const source={'5':make(5,240),'15':make(15,240),
  '60':make(60,240),'240':make(240,240),
  '720':make(720,240),'D':make(1440,240)};
const result=expandTrendStructure(core,source,D,D);
assert.equal(result.rows.length,13);
assert.deepEqual(result.rows.map(x=>x.tf),[
  '1m','3m','5m','10m','15m','30m','45m',
  '1H','2H','4H','6H','12H','1D'
]);
for(const tf of ['5m','10m','15m','30m','45m','1H','2H','4H','6H','12H','1D']){
 const row=result.rows.find(x=>x.tf===tf);
 assert.ok(row.bars>=9,tf+' has real completed historic bars');
 assert.notEqual(row.trend,'NO DATA',tf+' has confirmed pivots');
}
assert.equal(result.rows.find(x=>x.tf==='1m').trend,'NO DATA',
 'never invent missing CORE 1m');
const stale=expandTrendStructure(core,source,D-190000,D);
assert.ok(stale.rows.filter(x=>!['1m','3m'].includes(x.tf))
 .every(x=>x.trend==='NO DATA'),'stale historical data fail closed');
const noFuture=expandTrendStructure({...core,asOf:D-60*M},source,D,D);
assert.equal(noFuture.fresh,false,'old CORE cutoff is invalid');
console.log('PASS: 13 causal swing trends, 45m/6H/1D history, CORE independence, and stale guards');
