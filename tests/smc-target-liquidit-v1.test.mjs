import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const script=fs.readFileSync(new URL('../smc-target-liquidit.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../smc-target-liquidit.css',import.meta.url),'utf8');
const listeners=[];
const context={
  window:{},
  document:{readyState:'loading',addEventListener:(event,cb)=>listeners.push({event,cb})}
};
vm.runInNewContext(script,context,{timeout:2000});
const api=context.window.ASCEND_SMC_TARGET_LIQUIDIT_V1;
const asOf=1800000000,step=300;

function sample(n=180){
  const start=asOf-n*step;
  return Array.from({length:n},(_,i)=>{
    const val=101+10*Math.sin(i*Math.PI/12)+i*.01;
    return {time:start+i*step,open:val,high:val+1.1,low:val-1,close:val+.5,volume:100};
  });
}
function sessionUTC(hour,minute=0){return Date.UTC(2026,9,19,hour,minute)/1000;}

test('mounted as one named switchable tool, without changing existing 20 axes',()=>{
  assert.match(html,/<link rel="stylesheet" href="\.\/smc-target-liquidit\.css">/);
  assert.match(html,/<script defer src="\.\/smc-target-liquidit\.js"><\/script>/);
  assert.match(script,/const NAME='SMC Target Liquidit'/);
  assert.match(script,/targets:false,structure:false,blocks:false/);
  assert.match(script,/panel\.appendChild\(opts\)/);
  assert.match(css,/#chartShell #ascTLCanvas/);
  assert.match(css,/pointer-events:none/);
  assert.match(css,/z-index:85/);
});
test('pure scanner exists without DOM initialization or order-routing side effects',()=>{
  assert.equal(typeof api.scan,'function');
  assert.equal(listeners.length,1);
  assert.equal(listeners[0].event,'DOMContentLoaded');
  assert.doesNotMatch(script,/\b(?:executeOrder|placeOrder|sendOrder|openManualPaper)\s*\(/);
  assert.doesNotMatch(script,/\b(?:POST|PUT|PATCH|DELETE)\b/);
  assert.doesNotMatch(script,/\/api\/v2\/admin\//);
  assert.match(script,/only observation|ONLY draws/i);
});
test('user-supplied fixed UTC-4 session windows are correctly interpreted',()=>{
  assert.equal(api.sessionAt(sessionUTC(0))?.key,'ASIA'); // 20:00 previous day UTC-4
  assert.equal(api.sessionAt(sessionUTC(3,59))?.key,'ASIA');
  assert.equal(api.sessionAt(sessionUTC(4))||null,null);
  assert.equal(api.sessionAt(sessionUTC(6))?.key,'LONDON');
  assert.equal(api.sessionAt(sessionUTC(9))||null,null);
  assert.equal(api.sessionAt(sessionUTC(12,30))?.key,'NY_AM');
  assert.equal(api.sessionAt(sessionUTC(15))||null,null);
});
test('settings preserve screenshot lookbacks and caps',()=>{
  assert.equal(api.CONFIG.pivot,10);
  assert.equal(api.CONFIG.internal,3);
  assert.equal(api.CONFIG.external,25);
  assert.equal(api.CONFIG.maxTargets,5);
  assert.equal(api.CONFIG.maxBlocks,10);
  assert.equal(api.CONFIG.tzHours,-4);
});
test('no look-ahead: confirmed pivots appear only after closed right-hand bars',()=>{
  const bars=Array.from({length:80},(_,i)=>({
    time:asOf-80*step+i*step,open:8,close:8,high:i===35?20:10,low:i===35?7:5,volume:100
  }));
  const all=api.pivots(bars,step,10);
  const peak=all.find(p=>p.type==='HIGH');
  assert.ok(peak);
  assert.equal(peak.at,bars[35].time);
  assert.equal(peak.knownAt,bars[45].time+step);
  const prior=api.scan(bars,'5m',peak.knownAt-step);
  assert.ok(prior.external.every(p=>p.knownAt<=peak.knownAt-step));
  const now=api.scan(bars,'5m',asOf);
  assert.ok(now.internal.every(p=>p.knownAt<=asOf));
  assert.ok(now.external.every(p=>p.knownAt<=asOf));
});
test('incomplete or stale candles never create a live research state',()=>{
  const history=sample();
  const fresh=api.scan(history,'5m',asOf);
  assert.equal(fresh.status,'RESEARCH');
  assert.equal(fresh.bars.length,history.length);
  assert.ok(fresh.targets.length<=5);
  assert.ok(fresh.blocks.length<=10);
  assert.ok(fresh.events.every(e=>e.pivotKnownAt<=e.at));
  const extra={time:asOf,open:101,high:103,low:99,close:102,volume:200};
  assert.equal(api.scan(history.concat(extra),'5m',asOf).bars.length,history.length);
  const stale=api.scan(history,'5m',asOf+2*step+1);
  assert.equal(stale.status,'NO DATA');
  assert.match(stale.reason,/устарела/);
});
test('history gaps never bridged; insufficient history is NO DATA',()=>{
  const h=sample();
  const cut=h.filter((_,i)=>i<160||i>161);
  const result=api.scan(cut,'5m',asOf);
  assert.equal(result.status,'NO DATA');
  assert.equal(result.bars.length,18);
  assert.equal(api.scan(h.slice(0,40),'5m',asOf).status,'NO DATA');
});
test('forward information cannot change results at an earlier as-of',()=>{
  const h=sample();
  const a=api.scan(h,'5m',asOf);
  const futures=h.concat(Array.from({length:20},(_,i)=>({
    time:asOf+i*step,open:102,high:150,low:40,close:110,volume:400
  })));
  const b=api.scan(futures,'5m',asOf);
  assert.deepEqual(JSON.parse(JSON.stringify(a.targets)),JSON.parse(JSON.stringify(b.targets)));
  assert.deepEqual(JSON.parse(JSON.stringify(a.events)),JSON.parse(JSON.stringify(b.events)));
});
