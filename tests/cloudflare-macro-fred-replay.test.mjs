import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const replaySrc=await readFile('btc-sweep-crossmarket-replay.js','utf8');
const uiSrc=await readFile('macro-fred-ui.js','utf8');
const marketUi=await readFile('cross-market-ui.js','utf8');
for(const [name,s] of [['btc-sweep-crossmarket-replay.js',replaySrc],
  ['macro-fred-ui.js',uiSrc],['cross-market-ui.js',marketUi]])
  new vm.Script(s,{filename:name});
const sandbox={};
vm.runInNewContext(replaySrc,sandbox);
const R=sandbox.ASCEND_BTC_SWEEP_REPLAY;
const DAY=Date.UTC(2026,9,11)/1000,AT=DAY+2*3600;
const one=Array.from({length:121},(_,i)=>({
 time:AT-3600+i*60,close:100+(i-60)*.01
}));
const candles5=(factor)=>Array.from({length:26},(_,i)=>({
 time:AT-3600+i*300,close:100+factor*(i-12)
}));
const ETH=candles5(.12),SOL=candles5(-.08);
const results=R.response(AT,one,ETH,SOL,AT+60*60);
assert.equal(results.at,AT);
assert.equal(results.btcPrice,99.99, 'close at event minute (not next minute)');
assert.equal(results.horizons.length,4);
const btc15=results.horizons.find(x=>x.minute===15);
assert.equal(btc15.btc,0.15);
assert.equal(btc15.pending,false);
assert.ok(btc15.eth>0&&btc15.sol<0);
const future=R.response(AT,one,ETH,SOL,AT+10*60);
assert.equal(future.horizons[1].pending,true);
assert.equal(future.horizons[1].btc,null);
const noFuture=one.map((b,i)=>i>60?{...b,close:100000}:b);
assert.equal(R.response(AT,noFuture,ETH,SOL,AT).horizons[1].btc,null,
  'future extreme cannot affect as-of baseline');
const bad=one.filter(b=>b.time!==AT-60);
assert.equal(R.response(AT,bad,ETH,SOL,AT+3600),null,
  'missing starting exact candle must fail closed');
const samples=[
 {key:'YL',type:'SWEEP',at:AT,depthPct:1.25},
 {key:'YL',type:'SWEEP',at:AT,depthPct:1.25},
 {key:'ONL',type:'SWEEP',at:AT-60,depthPct:0.5},
];
assert.equal(R.replay(samples,one,ETH,SOL,AT+3600).length,1);
const html=await readFile('index.html','utf8');
for(const [name,code] of [['btc-sweep-crossmarket-replay.js',replaySrc],
  ['macro-fred-ui.js',uiSrc],['cross-market-ui.js',marketUi]]){
 const start=html.indexOf(code.split('\n')[0]);
 const end=html.indexOf('\n</script>',start);
 assert.ok(start>=0&&end>start,name+' must be embedded');
 assert.equal(html.slice(start,end).trim(),code.trim(),
  'Cloudflare inline copy must equal verified module '+name);
}
for(const id of ['pMacroSP500','pMacroNASDAQ','pMacroUST10','pMacroUST2',
 'pMacroBroadUSD','pMacroWTI','pMacroDXY','pMacroGold',
 'pMacroFREDNote','pMacroFREDStatus','pMacroSweepReplay'])
 assert.ok(html.includes('id="'+id+'"'),id+' present');
assert.ok(uiSrc.includes("'/api/v2/macro/daily'"));
assert.ok(uiSrc.includes("data-view='market'")||uiSrc.includes("dataset.view==='market'"));
assert.ok(uiSrc.includes('setInterval(()=>{if(visible())refresh();},5*60*1000)'));
assert.ok(html.includes('root.ASCEND_CROSS_MARKET=Object.freeze'));
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
for(const [i,m] of scripts.entries())
 if(m[1].trim())new vm.Script(m[1],{filename:'index.inline.'+i+'.js'});
console.log('PASS: macro FRED UI, protected endpoint, no lookahead BTC/ETH/SOL 5/15/30/60 replay, exact inline scripts');
