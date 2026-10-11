import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source=await readFile('vwap-display.js','utf8');
new vm.Script(source,{filename:'vwap-display.js'});
const context={};
vm.runInNewContext(source,context,{filename:'vwap-display.js'});
const VWAP=context.ASCEND_DAILY_VWAP;
assert.ok(VWAP&&typeof VWAP.daily==='function'&&typeof VWAP.project==='function');
const day=Date.UTC(2026,9,11)/1000,STEP=300,MIN=60;
const sample=[
 {time:day,open:98,high:102,low:96,close:99,volume:10},
 {time:day+STEP,open:99,high:108,low:102,close:105,volume:30},
 {time:day+STEP*2,open:105,high:112,low:104,close:109,volume:20}
];
const first=(102+96+99)/3,second=(108+102+105)/3,third=(112+104+109)/3;
const a=VWAP.daily(sample,day+STEP);
assert.ok(a);assert.equal(a.points.length,1);assert.equal(a.points[0].value,first);
const b=VWAP.daily(sample,day+2*STEP);
const value=(first*10+second*30)/40;
assert.ok(b);
assert.ok(Math.abs(b.value-value)<1e-9,'5m HLC3 weighted by candle volume');
assert.equal(b.volume,40);
assert.equal(b.dayStart,day);
const future=VWAP.daily(sample,day+2*STEP-1);
assert.equal(future.points.length,1,'never use unfinished 5m history');
const minutes=Array.from({length:11},(_,i)=>({time:day+i*MIN}));
const view=VWAP.project(b,minutes,'1m');
assert.equal(view.length,7,'no VWAP before first completed 5m');
assert.equal(view[0].time,day+4*MIN,'first value appears with 00:05 minute close');
assert.equal(view[0].value,first);
assert.equal(view[5].time,day+9*MIN);
assert.equal(view[5].value,value,'second VWAP not leaked before 00:10');
assert.equal(view[6].value,value);
const bars15=[{time:day},{time:day+900}];
const larger=VWAP.project(b,bars15,'15m');
assert.equal(larger.length,2);
assert.equal(larger[0].value,value);
assert.deepEqual(Array.from(VWAP.project(b,bars15,'1d')),[]);
const relation=VWAP.relationship(110,b);
assert.equal(relation.position,'ABOVE');
assert.ok(Math.abs(relation.distancePct-(110/value-1)*100)<1e-9);
const gap=[sample[0],sample[2]];
assert.equal(VWAP.daily(gap,day+3*STEP),null,'must reject missing 5m candle');
assert.equal(VWAP.daily(sample.slice(1),day+3*STEP),null,'must anchor at 00 UTC');
assert.equal(VWAP.daily(sample,day+86400),null,'no previous day VWAP leakage');
assert.equal(VWAP.daily([...sample.slice(0,2),{...sample[2],volume:-2}],day+3*STEP),null);
const html=await readFile('index.html','utf8');
const inline=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
assert.ok(inline.length>=4);
for(const [i,m] of inline.entries())if(m[1].trim())new vm.Script(m[1],{filename:'index.inline.'+i+'.js'});
for(const anchor of [
  'function renderAscendVwap(){','renderAscendVwap();','vwapLine.setData(projected)',
  "localStorage.setItem('ascend_vwap_chart_v1'",'ascendLiquidityRender();',
  'window.ASCEND_DAILY_VWAP','VWAP · ON',
])assert.ok(html.includes(anchor),anchor+' required');
assert.ok(html.includes('state.vwap=vw'),'legacy VWAP Core context retained');
assert.ok(html.includes("series.applyOptions({visible:false})"),'other studies hidden');
console.log('PASS: daily VWAP UTC closed 5m HLC3, missing candles, projected TF/no-lookahead, toggle, syntax');
