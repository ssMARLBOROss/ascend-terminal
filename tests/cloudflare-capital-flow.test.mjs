import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const module=await readFile('capital-flow-ui.js','utf8');
const html=await readFile('index.html','utf8');
new vm.Script(module,{filename:'capital-flow-ui.js'});
const marker=module.split('\n')[0],begin=html.indexOf(marker),end=html.indexOf('\n</script>',begin);
assert.ok(begin>=0&&end>begin,'Cloudflare HTML must embed new Capital Flow UI');
assert.equal(html.slice(begin,end).trim(),module.trim(),'Embedded module must equal tested source');
for(const id of ['pCapitalSpot','pCapitalFutures','pCapitalSpotRatio','pCapitalTradeDelta',
  'pCapitalCVD','pCapitalOI','pCapitalFunding','pCapitalLiquidations',
  'pCapitalSample','pCapitalObservationTime'])
 assert.ok(html.includes('id="'+id+'"'),id+' exists');
assert.ok(html.includes('id="pCapitalScore"')&&html.includes('id="pCapitalVolume"'));
assert.ok(module.includes("card.classList.contains('collapsed')"));
assert.ok(module.includes("!document.hidden"));
assert.ok(module.includes("setInterval(()=>{if(visible())refresh();},30000)"));
assert.ok(!module.includes('WebSocket('));
assert.ok(!module.includes('ENTRY_READY'));
assert.ok(module.includes("state.symbol!==symbol"),'reject stale responses after pair change');
const blocks=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
for(const [i,m] of blocks.entries())if(m[1].trim())
 new vm.Script(m[1],{filename:'index.inline.'+i+'.js'});
console.log('PASS capital-flow: fields, session guard, stale symbol rejection, no extra socket, all inline scripts');
