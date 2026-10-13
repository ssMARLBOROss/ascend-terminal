import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const src=readFileSync('smc-poi-research-v1.js','utf8');
const html=readFileSync('index.html','utf8');
assert.ok(html.includes(src.trim()),'POI inline engine must match tested source');
const context={};vm.runInNewContext(src,context);
const E=context.ASCEND_SMC_POI_RESEARCH_V1;
assert.ok(E?.scan,'POI engine missing');
const start=Date.UTC(2026,9,7)/1000;
const make=(n=75)=>Array.from({length:n},(_,i)=>({
 time:start+i*300,open:100,high:100.2,low:99.8,close:100,volume:100
}));
const report=(arr,i=arr.length-1)=>E.scan(arr,arr[i]?.time?arr[i].time+300:start);
assert.equal(report([]).status,'NO DATA');
assert.equal(report(make(30)).status,'NO DATA');
const base=make(75);
base[50]={...base[50],open:101.6,high:102.5,low:101.2,close:102};
base[51]={...base[51],open:102,high:102.2,low:99,close:99.4};
base[52]={...base[52],open:99.4,high:100,low:99,close:99.5};
assert.equal(report(base,50).zones.some(x=>x.type==='ifvg'),false,
 'Future 51st bar cannot invert gap at end of bar 50');
const inverted=report(base,51).zones.filter(x=>x.type==='ifvg');
assert.ok(inverted.some(x=>x.side==='SHORT'&&x.lower===100.2&&x.upper===101.2),
 'Bull gap inverted by later close through far edge');
assert.ok(!E.prepare(base,base[50].time+299).some(x=>x.time===base[50].time),
 'Candle not yet closed must be excluded');
const ob=make(75);
ob[54]={...ob[54],open:100,high:100.2,low:99.6,close:99.7};
ob[55]={...ob[55],open:99.8,high:103,low:99.7,close:102.5};
assert.ok(report(ob).zones.some(x=>x.type==='ob'&&x.side==='LONG'),
 'Opposite candle + displacement should define OB proxy');
const reject=make(75);
reject[55]={...reject[55],open:100,high:100.2,low:98.7,close:100};
reject[56]={...reject[56],open:100,high:100.7,low:99.9,close:100.5};
assert.ok(report(reject).zones.some(x=>x.type==='rb'&&x.side==='LONG'),
 'Sweep / wick / followthrough should identify RB proxy');
assert.equal(report(reject,55).zones.some(x=>x.type==='rb'),false,
 'No RB before following confirmation bar is closed');
const stb=make(75);
stb[55]={...stb[55],open:100,high:100.3,low:98.6,close:100.1};
stb[56]={...stb[56],open:100.2,high:102,low:100.1,close:101.5};
assert.ok(report(stb).zones.some(x=>x.type==='stb'&&x.side==='LONG'),
 'Sweep reclaim impulse should identify STB proxy');
const ote=make(75);
ote[35]={...ote[35],open:100,high:100.1,low:95,close:100};
ote[56]={...ote[56],open:100,high:110,low:99.9,close:100};
assert.ok(report(ote).zones.some(x=>x.type==='ote'&&x.side==='LONG'),
 'OTE from 48-bar completed leg');
const missing=make(75);missing[65]={...missing[65],time:missing[65].time+300};
assert.ok(E.prepare(missing,missing.at(-1).time+300).length<75,
 'No OHLC gap bridging');
for(const [i,m] of [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].entries())
 if(m[1].trim())new vm.Script(m[1],{filename:'inline-'+i+'.js'});
assert.ok(!src.includes('ENTRY READY'),'No POI engine should emit ENTRY READY');
console.log('PASS: causal IFVG / OB / RB / STB / OTE; no look-ahead, no silent gaps, source parity');
