import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source=await readFile('setup-decision-v2.js','utf8');
new vm.Script(source,{filename:'setup-decision-v2.js'});
const scope={};
vm.runInNewContext(source,scope);
const engine=scope.ASCEND_SETUP_DECISION_V2;
assert.ok(engine&&typeof engine.resolve==='function');

const asOf=3000,now=3008;
const names=['context','sweep','choch','mss','retest','micro','risk'];
const stages=names.map((name,i)=>({
 name,status:'CONFIRMED',at:i===0?asOf:2400+i*60,
 level:100,price:100
}));
const base={
 symbol:'BTC_USDT',asOf,status:'CONFIRMED',side:'LONG',ready:true,
 steps:stages,plan:{entry:100,stop:95,target:112,rr:2.4}
};
const call=(override={})=>engine.resolve({
 report:base,legacy:{confirmed:true,side:'LONG'},
 symbol:'BTC_USDT',asOf,now,price:100,...override
});
const isBlocked=(report,label)=>{
 assert.equal(report.ready,false,label);
 assert.notEqual(report.status,'ENTRY READY',label);
 assert.equal(report.plan,null,label);
};
const ok=call();
assert.equal(ok.status,'ENTRY READY');
assert.equal(ok.ready,true);
assert.equal(ok.side,'LONG');
assert.equal(ok.plan.entry,100);
assert.equal(ok.plan.stop,95);
assert.equal(ok.plan.target,112);
assert.equal(ok.plan.rr,2.4);
assert.equal(ok.plan.source,'CONFIRMATION_V2_FROZEN_LIQUIDITY');
assert.equal(ok.plan.microAt,stages[5].at);
assert.equal(call({price:99}).ready,true,'favorable retracement within drift');
isBlocked(call({price:101}),'R:R must be recalculated at the actual quote');
isBlocked(call({price:101.3}),'no chasing beyond 0.25 original R');
isBlocked(call({price:94}),'stop crossed');
isBlocked(call({price:113}),'target crossed');
isBlocked(call({price:NaN}),'missing current quote');
isBlocked(call({report:null}),'missing report');
isBlocked(call({report:{...base,symbol:'ETH_USDT'}}),'wrong symbol evidence');
isBlocked(call({report:{...base,asOf:asOf-60}}),'wrong minute');
isBlocked(call({now:asOf+181}),'stale input');
isBlocked(call({now:asOf-100}),'future report');
isBlocked(call({legacy:{confirmed:false,side:'LONG'}}),'legacy gate missing');
isBlocked(call({legacy:{confirmed:true,side:'SHORT'}}),'legacy direction disagrees');
isBlocked(call({report:{...base,ready:false}}),'V2 not actually ready');
isBlocked(call({report:{...base,status:'INVALIDATED'}}),'invalidated V2');
isBlocked(call({report:{...base,steps:stages.slice(1)}}),'incomplete stages');
isBlocked(call({report:{...base,steps:stages.map((x,i)=>i===3?{...x,status:'WAIT'}:x)}}),'MSS WAIT');
isBlocked(call({report:{...base,steps:stages.map((x,i)=>i===4?{...x,at:stages[2].at}:x)}}),'out-of-order retest');
isBlocked(call({report:{...base,steps:stages.map((x,i)=>i===5?{...x,at:asOf+60}:x)}}),'future micro');
isBlocked(call({report:{...base,plan:{...base.plan,target:109}}}),'too little reward');

const short={...base,side:'SHORT',plan:{entry:100,stop:105,target:88,rr:2.4}};
const shortReady=call({report:short,legacy:{confirmed:true,side:'SHORT'}});
assert.equal(shortReady.ready,true);
assert.equal(shortReady.plan.rr,2.4);
isBlocked(call({report:short,legacy:{confirmed:true,side:'SHORT'},price:99}),
 'short chase worsens RR');
isBlocked(call({report:short,legacy:{confirmed:true,side:'SHORT'},price:98.7}),
 'short drift limit');
assert.equal(call({report:short,legacy:{confirmed:true,side:'SHORT'},price:101}).ready,true,
 'favorable short price');

const html=await readFile('index.html','utf8');
const marker=source.split('\n')[0],start=html.indexOf(marker),
 end=html.indexOf('\n</script>',start);
assert.ok(start>=0&&end>start,'decision engine must be inline in Cloudflare HTML');
assert.equal(html.slice(start,end).trim(),source.trim(),
 'tested source must exactly match live inline decision');
assert.ok(html.includes('report:latestConfirmationV2,legacy:{confirmed:legacyConfirmed,side}'));
assert.ok(html.includes('if(!setup?.ready||setup.side!==side)'));
assert.ok(html.includes('sl:setup.plan.stop,tp1:setup.plan.target'));
assert.ok(html.includes('source:\'CONFIRMATION_V2_FROZEN_LIQUIDITY\''));
assert.ok(html.includes('function recordConfirmationV2(report,decision)'));
assert.ok(html.includes('state.projection=projection(r); // sync chart/paper prices with latest V2 result'));
assert.ok(html.includes('НЕ ENTRY READY: открыть для проверки V2'));
for(const [i,tag] of [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].entries()){
 if(tag[1].trim())new vm.Script(tag[1],{filename:'index.inline.'+i+'.js'});
}
console.log('PASS V2 unified setup: 7 stages, stale/mismatch/out-of-order veto, bid/ask drift and RR, shadow gate, tested Cloudflare inline');
