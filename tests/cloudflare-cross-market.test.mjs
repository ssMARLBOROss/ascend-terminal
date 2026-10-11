import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const engine=await readFile('cross-market-crypto.js','utf8');
const ui=await readFile('cross-market-ui.js','utf8');
new vm.Script(engine,{filename:'cross-market-crypto.js'});
new vm.Script(ui,{filename:'cross-market-ui.js'});
const scope={};vm.runInNewContext(engine,scope);
const X=scope.ASCEND_CROSS_MARKET;
assert.ok(X&&typeof X.leader==='function'&&typeof X.aggregate==='function');
const day=Date.UTC(2026,9,11)/1000,step=300;
const generate=(slope=0.01)=>Array.from({length:180},(_,i)=>{
 const close=100+i*slope;
 return {time:day+i*step,open:close,high:close+.4,low:close-.4,
   close,volume:i%20===0?300:100};
});
const now=day+180*step;
const up=generate(.03),down=generate(-.03),flat=generate(0);
const btc=X.leader('BTC_USDT',up,now);
assert.equal(btc.status,'READY');
assert.equal(btc.trend,'NEUTRAL','linear no-pivot candles must not pretend HH/HL');
assert.ok(btc.above>0&&btc.impulse>0&&btc.score>0);
assert.equal(btc.asOf,now);
const eth=X.leader('ETH_USDT',down,now);
assert.equal(eth.status,'READY');
assert.ok(eth.above<0&&eth.score<0);
assert.equal(X.leader('BTC_USDT',flat,now).status,'READY');
const later=[...up,{time:now,open:100,high:9999,low:99,close:9999,volume:9999}];
assert.equal(X.leader('BTC_USDT',later,now).score,btc.score,'forming candle must never enter score');
const gap=up.slice();gap.splice(40,1);
assert.equal(X.leader('BTC_USDT',gap,now).status,'NODATA',
  '5m gap since UTC midnight invalidates daily VWAP');
assert.equal(X.leader('BTC_USDT',up,now+2000).status,'NODATA','old data fails closed');
const b={running:true,source:'ascend-clean radar',
  long:60,short:25,neutral:15,available:100,cycle:400};
assert.equal(X.breadthScore(b).status,'READY');
assert.equal(X.breadthScore({...b,available:120}).status,'NODATA');
assert.equal(X.breadthScore({...b,source:'fallback'}).status,'NODATA');
const trio={BTC_USDT:btc,ETH_USDT:btc,SOL_USDT:btc};
const aligned=X.aggregate(trio,b);
assert.equal(aligned.status,'READY');
assert.equal(aligned.conflict,false);
assert.ok(aligned.score>0);
const divergence=X.aggregate({...trio,SOL_USDT:eth},b);
assert.equal(divergence.conflict,true,'opposed crypto majors generate MARKET CONFLICT');
const missing=X.aggregate({BTC_USDT:btc,ETH_USDT:eth},b);
assert.equal(missing.status,'PARTIAL');
assert.equal(missing.score,null,'not enough crypto majors, no invented aggregate');
const noBreadth=X.aggregate(trio,{...b,running:false});
assert.equal(noBreadth.status,'PARTIAL');
assert.ok(noBreadth.score>0,'valid leaders survive missing independent breadth');
const html=await readFile('index.html','utf8');
for(const [name,src] of [['cross-market-crypto.js',engine],['cross-market-ui.js',ui]]){
 const marker=src.split('\n')[0];
 const start=html.indexOf(marker),end=html.indexOf('\n</script>',start);
 assert.ok(start>=0&&end>start,name+' must be embedded in Cloudflare main HTML');
 assert.equal(html.slice(start,end).trim(),src.trim(),
   name+' embedded copy must match tested source');
}
for(const id of ['pMacroBTC','pMacroETH','pMacroSOL','pMacroBreadth',
   'pMacroAgreement','pMacroTime','pMacroScore','pMacroExplanation'])
 assert.ok(html.includes('id="'+id+'"'),id+' must exist');
for(const sourceName of ['Nasdaq / S&amp;P 500','DXY / US yields','Gold / Oil']){
 assert.ok(html.includes(sourceName)&&html.includes('NO DATA'));
}
assert.ok(ui.includes('!document.hidden')&&ui.includes("!card.classList.contains('collapsed')"));
assert.ok(ui.includes('setInterval(()=>{if(eligible())refresh();},120000)'));
assert.ok(!ui.includes('WebSocket('));
const all=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
for(const [i,m] of all.entries())if(m[1].trim())
 new vm.Script(m[1],{filename:'index.inline.'+i+'.js'});
console.log('PASS Cross-Market: causality, UTC VWAP, conflicting majors, breadth validation, stale/gaps, UI guards, scripts');