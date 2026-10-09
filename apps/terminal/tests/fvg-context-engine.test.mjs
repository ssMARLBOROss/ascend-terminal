import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';

const output=resolve(tmpdir(),'ascend-fvg-context-engine-test.mjs');
await build({entryPoints:['src/market/fvgContextEngine.ts'],
  outfile:output,platform:'node',format:'esm',bundle:true,logLevel:'silent'});
const {computeFvgContext,distanceToFvg,summariseFvg}=await import(pathToFileURL(output).href);
const STEP=300000,START=1750000000000;
const candle=(i,o=100,h=101,l=99,c=100,volume=20)=>({
  timestamp:START+i*STEP,open:o,high:h,low:l,close:c,volume
});
const base=Array.from({length:14},(_,i)=>candle(i));
const middle=candle(14,101,103,100,102,80);
const third=candle(15,105,106,104,105,90);
const bars=[...base,middle,third];
const settings={atrLength:14,fillMode:'wick',minGapPercent:0};
const apply=(list,opts=settings,now=START+list.length*STEP,levels=[])=>
  computeFvgContext(list,'BTCUSDT','5m',opts,levels,now);
const initial=apply(bars);
const bullish=initial.filter(x=>x.side==='bull');
assert.equal(bullish.length,1,'three-candle bullish zone detected');
const z=bullish[0];
assert.equal(z.low,101);assert.equal(z.high,104);
assert.equal(z.midpoint,102.5);assert.equal(z.formedAt,third.timestamp+STEP);
assert.ok(z.atrMultiple>0&&Number.isFinite(z.atrMultiple),'ATR at detection');
assert.equal(z.maxFillPct,0);assert.equal(z.status,'NEW');
assert.equal(apply(bars,settings,third.timestamp+STEP-1).filter(x=>x.side==='bull').length,0,
  'never create FVG before 3rd candle closes');
const partial=candle(16,104,105,102,104,15);
const touched=apply([...bars,partial]).find(x=>x.id===z.id);
assert.equal(touched.status,'PARTIAL','wick-only touch closes outside zone');
assert.ok(touched.maxFillPct>66&&touched.maxFillPct<67);
assert.equal(touched.visits,1);
assert.equal(touched.firstTouchAt,partial.timestamp+STEP);
assert.ok(touched.milestones[25]&&touched.milestones[50]);
assert.ok(!touched.milestones[75]);
const closeBased=apply([...bars,partial],{...settings,fillMode:'close'}).find(x=>x.id===z.id);
assert.equal(closeBased.maxFillPct,0,'close mode ignores wick-only retracement');
const retreat=candle(17,105,106,105,105,12);
const exited=apply([...bars,partial,retreat]).find(x=>x.id===z.id);
assert.equal(exited.status,'PARTIAL');
assert.equal(exited.visits,1);
const revisit=candle(18,103,105,102.5,103,19);
const revisited=apply([...bars,partial,retreat,revisit]).find(x=>x.id===z.id);
assert.equal(revisited.visits,2,'second visit counted once');
assert.equal(revisited.status,'TESTING');
const filled=candle(19,102,104,99,101,29);
const final=apply([...bars,partial,retreat,revisit,filled]).find(x=>x.id===z.id);
assert.equal(final.status,'FILLED');assert.equal(final.maxFillPct,100);
assert.ok(final.milestones[75]&&final.milestones[100]);
assert.equal(final.filledAt,filled.timestamp+STEP);
assert.equal(new Set(final.events.map(x=>x.id)).size,final.events.length,'event IDs deduplicated');
const reconstructed=apply([...bars,partial,retreat,revisit,filled]).find(x=>x.id===z.id);
assert.deepEqual(final,reconstructed,'stable FVG IDs and replay');
assert.equal(distanceToFvg(final,102.5),0,'zero distance inside zone');
assert.ok(distanceToFvg(final,108)>0);
const s=summariseFvg([final]);
assert.equal(Object.values(s).reduce((n,v)=>n+v.total,0),1);
const known=apply(bars,settings,undefined,[{
  id:'YH',price:102,availableFrom:z.formedAt+1,status:'FROZEN'
}]).find(x=>x.id===z.id);
assert.equal(known.context.levels.length,0,'exclude levels not yet available');
const oldValid=apply(bars,settings,undefined,[{
  id:'YH',price:102,availableFrom:z.formedAt-1,status:'FROZEN'
}]).find(x=>x.id===z.id);
assert.equal(oldValid.context.levels[0].id,'YH');
const bearBars=Array.from({length:14},(_,i)=>candle(i,100,101,99,100));
bearBars.push(candle(14,98,99,96,97));
bearBars.push(candle(15,95,96,93,94));
const bear=apply(bearBars).find(x=>x.side==='bear');
assert.ok(bear);assert.equal(bear.low,96);assert.equal(bear.high,99);
console.log('PASS: 13 FVG detector/state/ATR/fill/levels invariants');
