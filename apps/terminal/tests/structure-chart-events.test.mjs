import assert from 'node:assert/strict';
import {computeStructureChartEvents} from '../src/market/structureChartEvents.ts';

const MIN=60000;
const highs=[11,12,16,12,11,12,17,12,11,11,16,12,11,19,12,11,12];
const bars=highs.map((high,i)=>({
  timestamp:Date.UTC(2026,9,17,9,0)+i*MIN,
  high,low:high-3,open:high-2,close:i===13?18.5:high-1.5,volume:100+i
}));
const t=i=>bars[i].timestamp;
const before=computeStructureChartEvents(bars,'1m',t(8));
assert.equal(before.some(e=>e.type==='HH'&&e.formedAt===t(6)),false,
  'HH is invisible before the second right bar closes');
const after=computeStructureChartEvents(bars,'1m',t(8)+MIN);
const hh=after.find(e=>e.type==='HH'&&e.formedAt===t(6));
assert.ok(hh,'HH is confirmed at close of the second right candle');
assert.equal(hh.confirmedAt,t(9));
assert.ok(after.every(e=>e.confirmedAt<=t(9)));
const all=computeStructureChartEvents(bars,'1m',t(16)+MIN);
assert.ok(all.some(e=>e.type==='LH'),'lower high is labelled separately');
assert.ok(all.some(e=>e.type.startsWith('BOS')||e.type.startsWith('CHoCH')),
  'close beyond confirmed swing produces structure break');
assert.ok(all.every(e=>e.confirmedAt>e.formedAt));
const partial=computeStructureChartEvents(bars,'1m',t(16)+1000);
assert.ok(partial.every(e=>e.confirmedAt<=t(16)+1000),
  'current unclosed candle never leaks into the chart');
console.log('PASS: clickable structure labels are closed-candle causal; HH and BOS chronology');
