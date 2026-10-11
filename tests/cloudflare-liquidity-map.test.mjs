import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const src=await readFile('liquidity-map.js','utf8');
new vm.Script(src,{filename:'liquidity-map.js'});
const context={};vm.runInNewContext(src,context,{filename:'liquidity-map.js'});
const L=context.AscendLiquidityMap;
assert.ok(L&&typeof L.build==='function');
const D=86400,day=Date.UTC(2026,9,9)/1000;
const bar=(time,value=100)=>({time,open:value,high:value+1,low:value-1,close:value,volume:5});
const prev=Array.from({length:96},(_,i)=>bar(day-D+i*900));
const current=Array.from({length:25},(_,i)=>bar(day+i*900));
const five=Array.from({length:90},(_,i)=>bar(day+(i*300)));
const first=L.levelsFromHistory([...prev,...current],five,day+5*3600);
assert.equal(first.levels.YH,101);
assert.equal(first.levels.YL,99);
assert.equal(first.meta.ONH.freezeAt,day+6*3600);
assert.equal(L.build({price:100,atr:1,levels:first.levels,meta:first.meta,asOf:day+5*3600})
  .all.uppers.find(x=>x.key==='ONH').state,'LIVE');
const frozen=L.levelsFromHistory([...prev,...current],five,day+6*3600);
assert.equal(L.build({price:100,atr:1,levels:frozen.levels,meta:frozen.meta,asOf:day+6*3600})
  .all.uppers.find(x=>x.key==='ONH').state,'FROZEN');
const minuteBars=[
 {time:day+6*3600,high:102,low:99,close:100},
 {time:day+6*3600+60,high:103,low:100,close:102},
 {time:day+6*3600+120,high:103,low:100,close:102}
];
const cls=L.classify(101,minuteBars,'upper',day+6*3600,day+6*3600+180);
assert.equal(cls.state,'ACCEPTANCE');
assert.equal(cls.sweepDepthPct,100*(103-101)/101);
assert.equal(cls.acceptanceAt,day+6*3600+180);
assert.equal(cls.sweepAt,day+6*3600+60);
assert.equal(L.classify(101,minuteBars,'upper',day+8*3600,day+6*3600+180).state,'LIVE');
const jan=Date.UTC(2026,0,12)/1000;
assert.equal(L.newYorkCash(jan).open,jan+14.5*3600);
assert.equal(L.newYorkCash(day).open,day+13.5*3600);
const incomplete=prev.slice(1);
const notY=L.levelsFromHistory([...incomplete,...current],five,day+6*3600);
assert.equal(notY.levels.YH,undefined);
const html=await readFile('index.html','utf8');
assert.ok(html.includes('ASCEND_LIQUIDITY_ONLY=true'));
assert.ok(html.includes('ascendLiquidityDraw()'));
assert.ok(!html.includes('<script src="/liquidity-map.js"></script>'));
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
assert.ok(scripts.length>=3);
for(const [i,match] of scripts.entries()){
  if(match[1].trim())new vm.Script(match[1],{filename:'index.inline.'+i+'.js'});
}
console.log('PASS worker Liquidity Map: full YH/YL, overnight LIVE/FROZEN, 1m events, NY DST and inline chart scripts');
