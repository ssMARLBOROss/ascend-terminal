import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const src=await readFile('confirmation-engine-v2.js','utf8');
new vm.Script(src,{filename:'confirmation-engine-v2.js'});
const scope={};vm.runInNewContext(src,scope);
const X=scope.ASCEND_CONFIRMATION_V2;
assert.ok(X&&typeof X.analyze==='function');

const D=Date.UTC(2026,9,11)/1000,M=60;
const asOf=D+72*M,now=asOf+6;
function bar(time,open=132,high=136,low=131,close=132,volume=100){
 return {time,open,high,low,close,volume};
}
const one=Array.from({length:72},(_,i)=>bar(D+i*60));
one[10]={...one[10],low:119,close:132}; // closed 1m SWEEP+RECLAIM
one[20]={...one[20],low:128}; // earlier confirmed 3m low
one[45]={...one[45],low:125}; // a lower low, not yet eligible as HL

one[60]={...one[60],low:129.8}; // retest 3m pivot HL, known by t+69m
one[66]={...one[66],high:139}; // 1m pivot high, known by t+69m
one[70]={...one[70],close:140,high:141,volume:190};
const five=Array.from({length:39},(_,i)=>{
 const t=D-120*M+i*300;
 return bar(t,124,126,121,124,400);
});
const fiveAt=(m)=>five.findIndex(x=>x.time===D+m*M);
assert.ok(fiveAt(5)>=0);
five[fiveAt(5)]={...five[fiveAt(5)],high:130};
five[fiveAt(35)]={...five[fiveAt(35)],high:132,close:131,open:124};
const fifteen=Array.from({length:22},(_,i)=>bar(D-240*M+i*900,132,138,125,132,1000));
const base={
 symbol:'BTC_USDT',asOf,now,one,five,fifteen,
 levels:{all:{uppers:[{key:'YH',side:'upper',level:170}],
               lowers:[{key:'YL',side:'lower',level:120}]}},
 levelMeta:{YL:{freezeAt:D-3600},YH:{freezeAt:D-3600}},
 context:{t15:'LONG',t30:'MIXED'},feedStatuses:['LIVE','LIVE','LIVE'],
 chochEvents:[{type:'CHOCH',dir:'LONG',at:D+25*M,level:125,price:128}]
};
const first=X.sweeps(one,base.levels,base.levelMeta,asOf);
assert.ok(first.length>=1);
assert.equal(first[0].at,D+11*M);
assert.equal(first[0].dir,'LONG');
const mss=X.mssAfter(five,{dir:'LONG',at:D+25*M});
assert.equal(mss[0].at,D+40*M);
assert.equal(mss[0].level,130);
const three=X.combine(one,60,180,asOf);
const retr=X.retestAfter(three,five,mss[0],asOf);
assert.equal(retr[0].touchAt,D+63*M);
assert.equal(retr[0].at,D+69*M);
assert.ok(retr[0].extreme>125);
const micro=X.microAfter(one,retr[0]);
assert.equal(micro[0].at,D+71*M);
assert.equal(micro[0].price,140);
assert.ok(micro[0].volumeX>=1.2);
const r=X.analyze(base);
assert.equal(r.status,'CONFIRMED');
assert.equal(r.ready,true);
assert.equal(r.side,'LONG');
assert.deepEqual(Array.from(r.steps,x=>x.status),Array(7).fill('CONFIRMED'));
assert.deepEqual(Array.from(r.steps.slice(1,6),x=>x.at),
 [D+11*M,D+25*M,D+40*M,D+69*M,D+71*M]);
assert.ok(r.plan.rr>=2);
assert.equal(r.plan.entry,140);
assert.equal(r.plan.target,170);
assert.ok(r.plan.stop<140);
const mirror=(bars)=>bars.map(b=>({
 time:b.time,open:300-b.open,high:300-b.low,
 low:300-b.high,close:300-b.close,volume:b.volume
}));
const short=X.analyze({
 ...base,one:mirror(one),five:mirror(five),fifteen:mirror(fifteen),
 context:{t15:'SHORT',t30:'MIXED'},
 levels:{all:{
   uppers:[{key:'YH',side:'upper',level:180}],
   lowers:[{key:'YL',side:'lower',level:130}]
 }},
 chochEvents:[{type:'CHOCH',dir:'SHORT',at:D+25*M,level:175,price:172}]
});
assert.equal(short.status,'CONFIRMED','SHORT mirror must also validate');
assert.equal(short.side,'SHORT');
assert.ok(short.plan.stop>short.plan.entry);
assert.ok(short.plan.target<short.plan.entry);
assert.ok(short.plan.rr>=2);
const notReady=(x,message)=>{assert.equal(x.ready,false,message);assert.notEqual(x.status,'CONFIRMED',message)};
notReady(X.analyze({...base,feedStatuses:['STALE','LIVE','LIVE']}),'stale 1m blocks');
notReady(X.analyze({...base,feedStatuses:['LIVE','STALE','LIVE']}),'stale 5m blocks');
notReady(X.analyze({...base,feedStatuses:['LIVE','LIVE','STALE']}),'stale 15m blocks');
notReady(X.analyze({...base,now:asOf+300}),'expired 1m feed blocks');
notReady(X.analyze({...base,chochEvents:[]}), 'cannot skip CHOCH');
notReady(X.analyze({...base,chochEvents:[{type:'CHOCH',dir:'LONG',at:D+90*M}]}),
 'cannot use future CHOCH');
notReady(X.analyze({...base,context:{t15:'SHORT',t30:'MIXED'}}),'opposed 15m');
notReady(X.analyze({...base,context:{t15:'LONG',t30:'SHORT'}}),'opposed 30m');
const noSweep=one.map((x,i)=>i===10?{...x,low:131}:x);
notReady(X.analyze({...base,one:noSweep}),'cannot skip frozen sweep');
const noMss=five.map(x=>x.time===D+35*M?{...x,high:126,close:124}:x);
notReady(X.analyze({...base,five:noMss}),'cannot skip 5m MSS');
const noRetest=one.map((x,i)=>i===60?{...x,low:131}:x);
notReady(X.analyze({...base,one:noRetest}),'cannot skip 3m pivot retest');
const noVol=one.map((x,i)=>i===70?{...x,volume:100}:x);
notReady(X.analyze({...base,one:noVol}),'cannot skip 1m volume');
const shortTarget={...base,levels:{all:{
 uppers:[{key:'YH',side:'upper',level:145}],
 lowers:[{key:'YL',side:'lower',level:120}]
}}};
notReady(X.analyze(shortTarget),'R:R below 1:2');
const invalid=one.map((x,i)=>i===30?{...x,low:117,close:118,open:132}:x);
const invalidReport=X.analyze({...base,one:invalid});
notReady(invalidReport,'sweep extreme loss invalidates');
assert.equal(invalidReport.status,'INVALIDATED');
const afterStops=[
 {...bar(asOf,132,136,128,132),low:r.plan.stop-1},
 bar(asOf+60,132,136,131,132)
];
notReady(X.analyze({...base,asOf:asOf+120,now:asOf+125,one:[...one,...afterStops]}),
 'post-trigger structural stop invalidates entry');
const postTarget=[
 {...bar(asOf,132,180,131,132),high:r.plan.target+1},
 bar(asOf+60,132,136,131,132)
];
notReady(X.analyze({...base,asOf:asOf+120,now:asOf+125,one:[...one,...postTarget]}),
 'post-trigger target already reached blocks late entry');
const additional={...one.at(-1),time:asOf,close:99999,high:99999,low:131};
const future=X.analyze({...base,one:[...one,additional]});
assert.equal(future.status,'CONFIRMED','open 1m future bar cannot leak');
const h=await readFile('index.html','utf8');
const marker=src.split('\n')[0],begin=h.indexOf(marker),end=h.indexOf('\n</script>',begin);
assert.ok(begin>=0&&end>begin);
assert.equal(h.slice(begin,end).trim(),src.trim(),'Cloudflare inline engine must be tested source');
for(const id of ['ascConfirmationV2Panel','ascConfirmV2Status','ascConfirmV2Time',
 'ascConfirmV2Steps','ascConfirmV2Reason','ascConfirmV2Toggle'])
 assert.ok(h.includes('id="'+id+'"'),id+' must be in HTML');
assert.ok(h.includes('latestConfirmationV2?.ready===true'));
assert.ok(h.includes('legacyConfirmed,confirmed,status'));
assert.ok(h.includes('function renderConfirmationV2(){'));
assert.ok(h.includes("renderConfirmationV2();"));
const inline=[...h.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
for(const [i,m] of inline.entries())if(m[1].trim())
 new vm.Script(m[1],{filename:'index.inline.'+i+'.js'});
console.log('PASS Confirmation V2: seven causal stages, price/time, invalidation, no-lookahead, risk and legacy ENTRY veto');
