import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';

const file=resolve(tmpdir(),'ascend-chart-context-test.mjs');
await build({entryPoints:['src/market/chartNarrativeResearch.ts'],
  outfile:file,bundle:true,platform:'node',format:'esm',logLevel:'silent'});
const {buildChartNarrative}=await import(pathToFileURL(file).href);
const day=Date.UTC(2026,9,16),m=60000;
const bars=Array.from({length:8*60},(_,i)=>{
  // Strong, measured 5m upside impulse in the last half hour.
  const base=i<7*60?100:100+(i-7*60)*.1;
  return {timestamp:day+i*m,open:base,high:base+.15,low:base-.15,
    close:base+.1,volume:40};
});
const asOf=day+8*60*m;
const trend={symbol:'TIAUSDT',asOf,alignment:'LONG',setupDirection:'SHORT',
  setupConflict:true,rows:[{tf:'15m',recentHigh:{price:107,formedAt:day+420*m,confirmedAt:day+450*m},
    recentLow:{price:99,formedAt:day+410*m,confirmedAt:day+440*m}}]};
const decision={symbol:'TIAUSDT',asOf,status:'WAIT',direction:'SHORT',rr:2.4,
  entry:105,sl:107,tp:100,reasons:['5m: ещё нет MSS']};
const base={symbol:'TIAUSDT',bars,trend,decision,now:asOf+10000,freshAt:asOf};
const wait=buildChartNarrative(base);
assert.equal(wait.valid,true);
assert.equal(wait.headline,'ВОСХОДЯЩИЙ ТРЕНД');
assert.equal(wait.session?.name,'Лондон');
assert.equal(wait.session?.openAt,day+7*3600000);
assert.equal(wait.session?.changePct>0,true);
assert.equal(wait.setup,'SHORT');
assert.ok(wait.impulse?.includes('ИМПУЛЬС ВВЕРХ'));
assert.ok(wait.warning.includes('ПРОТИВ'));
assert.deepEqual(wait.marks,[],'WAIT must never project Entry/SL/TP as confirmed');
assert.equal(wait.swingHigh,107);
assert.equal(wait.swingLow,99);
const ready=buildChartNarrative({...base,
  decision:{...decision,status:'ENTRY READY',reasons:[]}});
assert.equal(ready.ready,true);
assert.deepEqual(ready.marks.map(x=>x.kind),['ENTRY','SL','TP']);
assert.ok(ready.marks.every(x=>x.price>0));
const tooSmall=buildChartNarrative({...base,decision:{...decision,
  status:'ENTRY READY',rr:1.5,reasons:[]}});
assert.equal(tooSmall.ready,false);
assert.equal(tooSmall.marks.length,0);
const stale=buildChartNarrative({...base,now:asOf+4*60000});
assert.equal(stale.valid,false);
assert.equal(stale.marks.length,0,'stale cannot draw plan or trend');
const noHistory=buildChartNarrative({...base,bars:[]});
assert.equal(noHistory.valid,false);
const missingOpen=buildChartNarrative({...base,bars:bars.filter(x=>x.timestamp!==day+7*3600000)});
assert.equal(missingOpen.session,undefined,'a session open gap hides session context');
// The Asia+London transition is an overlap, not a directional trading signal.
const half=day+7.5*3600000;
const overlap=buildChartNarrative({...base,
  now:half+10000,freshAt:half,
  trend:{...trend,asOf:half},
  decision:{...decision,asOf:half}});
assert.equal(overlap.session?.phase,'ПЕРЕСЕЧЕНИЕ');
assert.ok(overlap.session?.overlap?.includes('Азия'));
assert.ok(overlap.session?.overlap?.includes('Лондон'));
console.log('PASS: market HTF direction, 5m impulse, session open/overlap, no-lookahead, WAIT hides SL/TP, only READY R:R>=2 shows plan');
