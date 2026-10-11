import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile('choch-10m.js','utf8');
const mtf=await readFile('structure-evidence.js','utf8');
const sandbox={};
vm.runInNewContext(source,sandbox);
vm.runInNewContext(mtf,sandbox);
const C=sandbox.ASCEND_CHOCH_10M,E=sandbox.ASCEND_STRUCTURE_EVIDENCE;
assert.ok(C&&E);

const STEP=600,MIN=60,origin=Date.UTC(2026,9,11)/1000;
function bullishTrend(){
  return Array.from({length:27},(_,i)=>{
    const high=104+i*.6,low=98+i*.6,close=101+i*.6;
    return {time:origin+i*STEP,open:close,high,low,close,volume:200};
  }).map((b,i)=>{
    if([2,8,14].includes(i))b.high={2:110,8:117,14:124}[i];
    if([5,11,17].includes(i))b.low={5:95,11:98,17:101}[i];
    if(i===20){b.close=99;b.open=110;b.low=98;}
    if(i===21){b.close=108;b.open=106;}
    if(i===22){b.close=99;b.open=107;b.low=98;}
    return b;
  });
}
const all=bullishTrend();
const at21=origin+21*STEP;
const before=C.scan(all,origin+20*STEP);
assert.ok(!before.events.some(e=>e.at>=at21),
  'event on unclosed candle must not exist');
const signal=C.scan(all,at21);
assert.equal(signal.status,'CONFIRMED');
assert.equal(signal.direction,'SHORT');
assert.equal(signal.latest.type,'CHOCH');
assert.equal(signal.latest.priorTrend,'LONG');
assert.equal(signal.latest.protectedAt,origin+17*STEP);
assert.equal(signal.latest.protectedKnownAt,origin+20*STEP,
  'pivot known only after two right-side ten-minute bars close');
assert.equal(signal.latest.level,101);
assert.equal(signal.latest.price,99);
assert.equal(signal.latest.at,at21,'CHOCH time is 10m candle close');
assert.equal(signal.events.length,1);
const onlyWick=all.map(x=>({...x}));
onlyWick[20]={...onlyWick[20],low:98,close:108};
assert.equal(C.scan(onlyWick,at21).events.length,0,
  'lower wick alone is NOT a CHOCH without 10m close');
const recross=C.scan(all,origin+23*STEP);
assert.equal(recross.events.length,1,
  'same protected trend may not produce repeated CHOCH on recrossing');
const old=C.scan(all,origin+27*STEP);
assert.equal(old.status,'WAIT');
assert.equal(old.latest.dir,'SHORT');
assert.equal(old.direction,null,'historical CHOCH is not active confirmation');
const mirror=all.map(b=>({
 time:b.time,open:300-b.open,high:300-b.low,
 low:300-b.high,close:300-b.close,volume:b.volume
}));
const buy=C.scan(mirror,at21);
assert.equal(buy.status,'CONFIRMED');
assert.equal(buy.direction,'LONG');
assert.equal(buy.latest.level,199);
assert.equal(buy.latest.priorTrend,'SHORT');
const gap=all.slice(0,21).filter((_,i)=>i!==8);
assert.equal(C.scan(gap,at21).status,'NO_DATA');
assert.equal(C.scan(all.slice(0,10),at21).status,'NO_DATA');
const tooSoon=all.slice(0,21).map(x=>({...x}));
tooSoon[20]={...tooSoon[20],close:99,low:98};
assert.equal(C.scan(tooSoon,at21-STEP).events.length,0);
function oneMinute(rows){
 return rows.flatMap(b=>Array.from({length:10},(_,i)=>({
  time:b.time+i*MIN,open:b.close,high:b.high,low:b.low,
  close:b.close,volume:20
 })));
}
const one=oneMinute(all.slice(0,21));
const fifteen=E.grouped(one,900);
const report=E.analyze({one,fifteen,asOf:at21,wallClock:at21,levels:{all:{uppers:[],lowers:[]}}});
assert.equal(report.status,'READY');
assert.equal(report.choch.status,'CONFIRMED');
assert.equal(report.choch.latest.dir,'SHORT');
assert.equal(report.aligned,false,'new research CHOCH cannot set ENTRY_READY');
const stale=E.analyze({one,fifteen,asOf:at21,wallClock:at21+600});
assert.equal(stale.status,'STALE','stale feed must not be displayed as fresh confirmation');

const html=await readFile('index.html','utf8');
for(const [name,body] of [['choch-10m.js',source],['structure-evidence.js',mtf]]){
 const anchor=body.split('\n')[0],start=html.indexOf(anchor),stop=html.indexOf('\n</script>',start);
 assert.ok(start>=0&&stop>start,name+' must be in Cloudflare HTML');
 assert.equal(html.slice(start,stop).trim(),body.trim(),
  name+' inline content and tested source must be byte-identical');
}
for(const id of ['pStructChoch','ascChochDecision','ascChochStatus',
  'ascChochDetails','ascChochConfirmedAt'])
 assert.ok(html.includes('id="'+id+'"'),id+' UI is required');
assert.ok(html.includes('1m Micro-BREAK (не CHOCH)'),
  'must not mislabel simple 1m break as CHOCH');
assert.ok(html.includes('10m CHOCH')&&html.includes("status==='READY'"));
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
for(const [i,m] of scripts.entries())if(m[1].trim())
  new vm.Script(m[1],{filename:'inline'+i+'.js'});
console.log('PASS: CHOCH LONG/SHORT protected pivots and strict 10m close, no wick/lookahead/duplicates, timestamps, HTML, Core unchanged');
