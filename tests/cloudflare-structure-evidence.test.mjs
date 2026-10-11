import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile('structure-evidence.js','utf8');
new vm.Script(source,{filename:'structure-evidence.js'});
const context={};
vm.runInNewContext(source,context,{filename:'structure-evidence.js'});
const E=context.ASCEND_STRUCTURE_EVIDENCE;
assert.ok(E&&typeof E.analyze==='function');
const D=Date.UTC(2026,9,11)/1000,base=D+6*3600;
const bar=(time)=>({time,open:100,high:100.5,low:99.5,close:100,volume:30});
const one=Array.from({length:260},(_,i)=>bar(base+i*60));
one[5]={...one[5],low:98.5,close:100}; // wick under YL, same 1m closed back above
one[12]={...one[12],open:100,low:98.7,close:98.8};
one[13]={...one[13],open:98.8,low:98.5,close:98.7};
one[14]={...one[14],open:98.7,high:100.2,low:98.5,close:99.2};
one[15]={...one[15],open:99.2,high:100.3,low:98.97,close:99.4};
const YL={key:'YL',level:99,side:'lower',
  zone:{low:98.95,high:99.05},freezeAt:D};
const R=E.levelHistory(E.prepared(one,60,base+one.length*60),YL,base+one.length*60);
assert.equal(R.status,'PARTIAL','late observation cannot reconstruct missing early day');
const events=R.events.filter(x=>x.key==='YL');
for(const type of ['TOUCH','SWEEP','BREAK','ACCEPTANCE','RECLAIM','RETEST']){
 assert.ok(events.some(x=>x.type===type),'expected '+type);
}
assert.equal(events.find(x=>x.type==='SWEEP').at,base+6*60);
assert.equal(events.find(x=>x.type==='RETEST').at,base+16*60);
const early=E.levelHistory(one,YL,base+12*60);
assert.ok(!early.events.some(x=>x.type==='BREAK'||x.type==='RETEST'),
  'must not read post-asOf candles');
const live=E.levelHistory(one,{...YL,freezeAt:base+3600},base+600);
assert.equal(live.status,'LIVE');
assert.equal(live.events.length,0);
const strong=Array.from({length:40},(_,i)=>bar(base+i*60));
for(let i=10;i<21;i++)strong[i]={...strong[i],open:99.5,high:99.6,low:98,close:98.5};
const strongR=E.levelHistory(strong,YL,base+40*60);
const accept5=strongR.events.find(e=>e.type==='ACCEPT_5M');
assert.ok(accept5,'2 fully CLOSED 5m bars beyond the level confirm 5m acceptance');
assert.equal(accept5.at,base+20*60);
assert.equal(E.levelHistory(strong,YL,base+19*60).events.some(e=>e.type==='ACCEPT_5M'),
  false,'no future 5m confirmation before second bar has closed');
const prior=Array.from({length:40},(_,i)=>({
  time:D+i*900,open:100,high:101,low:99,close:100,volume:50
}));
const frame=E.analyze({
 asOf:base+one.length*60,wallClock:base+one.length*60,
 one,fifteen:prior,levels:{all:{uppers:[],lowers:[YL]}},
 levelMeta:{YL:{freezeAt:D}}
});
assert.equal(frame.status,'READY');
assert.ok(frame.frames['30m'].count>=9,'complete 30m built from 15m pairs');
assert.ok(frame.frames['3m'].count>40,'complete 3m built from 1m candles');
assert.ok(frame.recent.some(e=>e.type==='RETEST'));
assert.equal(frame.aligned,false,'sweep alone is not entry ready');
const stale=E.analyze({...{
 asOf:base+one.length*60,one,fifteen:prior,
 levels:{all:{uppers:[],lowers:[YL]}},levelMeta:{YL:{freezeAt:D}}
},wallClock:base+one.length*60+600});
assert.equal(stale.status,'STALE');
const gapped=one.slice();gapped.splice(255,1);
const discontinuous=E.analyze({asOf:base+one.length*60,one:gapped,fifteen:prior});
assert.equal(discontinuous.status,'NODATA','no inference over missing 1m candle');
const pBars=[100,98,99,104,99,100,101,105].map((h,i)=>({
 time:base+i*60,open:98,high:h,low:97,close:98,volume:1
}));
const p=E.pivots(pBars,60);
assert.ok(p.highs.some(x=>x.at===base+3*60&&x.knownAt===base+6*60),
 'pivot only confirmed after two right-side candles close');
const h=await readFile('index.html','utf8');
const start=h.indexOf('/* ASCEND Structure Evidence V1');
const end=h.indexOf('\n</script>',start);
assert.ok(start>=0&&end>start);
assert.equal(h.slice(start,end).trim(),source.trim(),
 'Cloudflare embeds exact tested structure evidence source');
for(const id of ['ascendStructureToggle','ascStructurePanel','ascStructureRibbon',
  'ascStructureMini','ascStructureFrames','ascStructureEvents'])
 assert.ok(h.includes('id="'+id+'"'),id+' must be present');
assert.ok(h.includes('renderStructureEvidence();'));
assert.ok(h.includes('renderAscendVwap();')&&h.includes('ascendLiquidityRender();'));
const scripts=[...h.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
for(const [i,m] of scripts.entries())
 if(m[1].trim())new vm.Script(m[1],{filename:'index.inline.'+i+'.js'});
console.log('PASS: causal SWEEP/TOUCH/BREAK/ACCEPT/RECLAIM/RETEST, 30m/15m/3m, no lookahead, stale/gap, full HTML scripts');