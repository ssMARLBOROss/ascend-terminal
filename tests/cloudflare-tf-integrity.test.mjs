import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const qa=await readFile('market-timeframe-quality.js','utf8');
const struct=await readFile('structure-evidence.js','utf8');
const choch=await readFile('choch-10m.js','utf8');
for(const [n,s] of [['qa.js',qa],['structure.js',struct],['choch.js',choch]])
 new vm.Script(s,{filename:n});
const ctx={};
vm.runInNewContext(qa,ctx);
vm.runInNewContext(choch,ctx);
vm.runInNewContext(struct,ctx);
const Q=ctx.ASCEND_TF_QA,E=ctx.ASCEND_STRUCTURE_EVIDENCE;
assert.ok(Q&&E);
const D=Date.UTC(2026,9,11)/1000,H=3600;
const create=(start,tf,count)=>Array.from({length:count},(_,i)=>{
  const price=100+2*Math.sin(i*.24)+Math.sin(i*.074);
  return {time:start+i*tf,open:price,close:price+.03,
    high:price+.8,low:price-.8,volume:100+i};
});
const five=create(D+300,300,103);
const asOf=D+108*300;
const oldByIndex=Array.from({length:Math.floor(five.length/2)},(_,i)=>({
  time:five[i*2].time,close:five[i*2+1].close
}));
assert.equal(oldByIndex[0].time,D+300,'old code starts malformed 10m at 00:05 UTC');
const ten=Q.aggregate(five,300,600,asOf);
assert.equal(ten[0].time,D+600,'new 10m candle starts aligned at 00:10 UTC');
assert.equal(ten[0].open,five[1].open);
assert.equal(ten[0].close,five[2].close);
assert.equal(ten.at(-1).time%600,0);
assert.ok(ten.every((x,i)=>x.time%600===0));
const incomplete=create(D,300,2);
assert.equal(Q.aggregate(incomplete,300,600,D+300).length,0,
  '10m candle may not be formed from one completed 5m bar');
const gap=five.filter(b=>b.time!==D+30*300);
const afterGap=Q.aggregate(gap,300,600,asOf);
assert.ok(!afterGap.some(x=>x.time===D+30*300),
  'missing 5m sub-candle must exclude corresponding 10m group');
const fifteen=create(D+900,900,21);
const thirty=Q.aggregate(fifteen,900,1800,D+23*900);
assert.ok(thirty.every(x=>x.time%1800===0&&x.time+1800<=D+23*900));
assert.equal(thirty[0].time,D+1800,'first unpaired 15m bar rejected');
const dup=[...incomplete,incomplete[0]];
assert.equal(Q.complete(dup,300,D+600).length,2);
assert.equal(Q.complete(incomplete,300,D+300).length,1);
const finalEnd=incomplete.at(-1).time+300;
assert.equal(Q.status(incomplete,300,finalEnd+40).state,'LIVE');
assert.equal(Q.status(incomplete,300,finalEnd+1200).state,'STALE');
assert.equal(Q.status([],300).state,'NO DATA');

const one=create(D+H,60,140);
const full5=create(D+H,300,260);
const full15=create(D+H,900,95);
const stamp=D+H+140*60;
const result=E.analyze({asOf:stamp,wallClock:stamp,one,five:full5,fifteen:full15,
  levels:{all:{uppers:[],lowers:[]}}});
assert.equal(result.status,'READY');
assert.ok(result.frames['5m'].count>=25,'5m not limited to 1m slice');
assert.ok(result.frames['10m'].count>=10,'10m built from 5m source');
assert.equal(result.choch.status!=='undefined',true);
assert.equal(result.aligned,false,'data quality cannot silently authorize entry');
const without=E.analyze({asOf:stamp,wallClock:stamp,one,fifteen:full15});
assert.ok(result.frames['10m'].count>without.frames['10m'].count,
 'longer verified source must extend 10m CHOCH context');
const openFuture={...full5.at(-1),time:stamp-60*0,high:999999,close:999999,
 low:1,open:100};
const withFuture=E.analyze({asOf:stamp,wallClock:stamp,one,
 five:[...full5,openFuture],fifteen:full15});
assert.equal(result.frames['10m'].count,withFuture.frames['10m'].count,
 '10m must not include unclosed out-of-time 5m input');

const html=await readFile('index.html','utf8');
const readInline=(module)=>{
 const key=module.split('\n')[0],pos=html.indexOf(key),end=html.indexOf('\n</script>',pos);
 assert.ok(pos>=0&&end>pos,'module embedded');
 assert.equal(html.slice(pos,end).trim(),module.trim(),'embedded copy in Cloudflare must match tested source');
};
readInline(qa);readInline(struct);
for(const anchor of ["function renderTFHealth(){","function qaRows(rows,tf)","function aggregate10m(rows){",
 "function aggregate30m(rows){","qaRows(currentRows(),state.timeframe)","chartBarsSignature",
 "id=\"ascTFHealth\"","latestStructureEvidence=null;structureEvidenceKey=''"])
 assert.ok(html.includes(anchor),'requires '+anchor);
console.log('PASS MTF/time integrity: 10m/30m aligned; incomplete no future; QA LIVE/STALE; deep 5m MTF; inline');
