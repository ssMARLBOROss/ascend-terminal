import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const script=fs.readFileSync(new URL('../smc-target-liquidit.js',import.meta.url),'utf8');
const radarCode=fs.readFileSync(new URL('../smc-zone-radar.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../smc-target-liquidit.css',import.meta.url),'utf8');
const root={},callbacks=[];
const document={readyState:'loading',addEventListener:(e,cb)=>callbacks.push({e,cb})};
vm.runInNewContext(script,{window:root,document},{timeout:3000});
vm.runInNewContext(radarCode,{window:root},{timeout:3000});
const radar=root.ASCEND_SMC_ZONE_RADAR_V1;
const at=Date.UTC(2026,9,30,12,0)/1000;
function bars(seconds,qty,price=4000){
  return Array.from({length:qty},(_,i)=>{
    const t=at-seconds*qty+i*seconds;
    const move=4*Math.sin(i/7)+2*Math.sin(i/19);
    return {time:t,open:price+move,high:price+move+1.5,
      low:price+move-1.5,close:price+move+.2,volume:10+i%10};
  });
}
const thirty=bars(1800,120),five=bars(300,240);

test('single research UI, off by default; static load order',()=>{
  assert.match(script,/const NAME='SMC Target Liquidit'/);
  assert.match(script,/radar:false/);
  assert.match(script,/Радар зон · 2–3 ближайшие/);
  assert.match(css,/#ascTLRadar/);
  assert.ok(html.indexOf('smc-zone-radar.js')<html.indexOf('smc-target-liquidit.js'));
  assert.ok(callbacks.length===1);
});
test('never modifies trade functions, funds or ENTRY READY',()=>{
  assert.doesNotMatch(radarCode,/\b(?:executeOrder|placeOrder|openManualPaper|fetch|ENTRY READY)\s*\(/);
  assert.doesNotMatch(radarCode,/\b(?:POST|PUT|PATCH|DELETE)\b/);
  assert.equal(typeof radar.scan,'function');
});
test('valid 30m/5m history produces at most 3 ATR zones with known-before-now levels',()=>{
  const a=radar.scan({rows30:thirty,rows5:five,asOf:at});
  assert.equal(a.status,'RESEARCH');
  assert.ok(a.zones.length>0&&a.zones.length<=3);
  assert.ok(a.atr>0);
  for(const z of a.zones){
    assert.ok(z.knownAt<=at);
    assert.ok(z.sourceTimes.every(t=>t<=at));
    assert.ok(Math.abs(z.low-(z.price-a.atr*.25))<1e-8);
    assert.ok(Math.abs(z.high-(z.price+a.atr*.25))<1e-8);
    assert.ok(z.priority>=1&&z.priority<=4);
    assert.notEqual(z.status,'ENTRY READY');
  }
});
test('future bars and open bars do not rewrite past zone assessments',()=>{
  const first=radar.scan({rows30:thirty,rows5:five,asOf:at});
  const add5=five.concat(Array.from({length:6},(_,i)=>({...five.at(-1),time:at+i*300,
    high:9999,low:1})));
  const add30=thirty.concat(Array.from({length:2},(_,i)=>({...thirty.at(-1),time:at+i*1800,
    high:9999,low:1})));
  const again=radar.scan({rows30:add30,rows5:add5,asOf:at});
  assert.deepEqual(JSON.parse(JSON.stringify(first)),JSON.parse(JSON.stringify(again)));
});
test('no levels from incomplete previous day',()=>{
  const bad30=thirty.filter(b=>b.time!==at-86400-1800);
  const r=radar.scan({rows30:bad30,rows5:five,asOf:at});
  assert.equal(r.status,'RESEARCH'); // enough bars after the gap to recover
  assert.ok(r.zones.every(z=>!z.sources.some(s=>s.startsWith('YH')||s.startsWith('YL'))));
});
test('no data when history missing, outdated, or has unrepairable gaps',()=>{
  assert.equal(radar.scan({rows30:[],rows5:five,asOf:at}).status,'NO DATA');
  assert.equal(radar.scan({rows30:thirty,rows5:[],asOf:at}).status,'NO DATA');
  assert.equal(radar.scan({rows30:thirty,rows5:five,asOf:at+86400}).status,'NO DATA');
  const bad5=five.filter((_,i)=>i<200||i>201);
  assert.equal(radar.scan({rows30:thirty,rows5:bad5,asOf:at}).status,'NO DATA');
});
test('confirmed stages never appear before sweep, reclaim and a later break',()=>{
  const r=radar.scan({rows30:thirty,rows5:five,asOf:at});
  for(const z of r.zones){
    if(z.sweepAt!==null) assert.ok(z.sweepAt<=at);
    if(z.reclaimAt!==null) assert.ok(z.reclaimAt<=at&&z.sweepAt!==null);
    if(z.breakAt!==null)assert.ok(z.breakAt<=at&&z.reclaimAt!==null);
    if(z.status.startsWith('РЕАКЦИЯ ПОДТВЕРЖДЕНА')){
      assert.ok(z.volumeConfirmed&&z.breakAt!==null);
    }
  }
});
