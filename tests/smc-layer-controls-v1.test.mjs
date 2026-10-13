import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const start='<!-- ASCEND SMC LAYER MANAGER V1 — display-only, no trading-signal changes -->';
const end='<!-- ASCEND SMC LAYER MANAGER V1 END -->';
assert.equal(html.split(start).length,2,'SMC manager must occur exactly once');
assert.equal(html.split(end).length,2,'SMC manager end must occur exactly once');
const fragment=html.split(start)[1].split(end)[0];
const scripts=[...fragment.matchAll(/<script>([\s\S]*?)<\/script>/g)];
assert.equal(scripts.length,1,'SMC manager must contain exactly one script');
new vm.Script(scripts[0][1],{filename:'ascend-smc-layer-manager-v1.js'});
assert.match(html,/ASCEND_SMC_UI_V1\.isEnabled\('liquidity'\)/);
assert.match(html,/ASCEND_SMC_UI_V1\.draw\(ctx,priceToY,w,h\)/);
assert.ok(html.includes('function ascendLiquidityDraw()'));
assert.ok(html.includes('function renderConfirmationV2()'));

const map=new Map();
const storage={getItem:k=>map.has(k)?map.get(k):null,setItem:(k,v)=>map.set(k,v)};
const context={
 localStorage:storage,
 document:{readyState:'loading',addEventListener:()=>{},getElementById:()=>null,querySelector:()=>null},
 window:null,
 console
};
context.window=context;
vm.createContext(context);
vm.runInContext(scripts[0][1],context);
const api=context.ASCEND_SMC_UI_V1;
assert.equal(api.isEnabled('liquidity'),true);
assert.equal(api.isEnabled('structure'),false);
assert.equal(api.isEnabled('fvg'),false);
assert.equal(api.isEnabled('orders'),true);
assert.equal(api.set('fvg',true),true);
assert.equal(api.isEnabled('fvg'),true);
assert.equal(JSON.parse(map.get('ascend_smc_layers_v1')).fvg,true);
assert.equal(api.set('unknown',true),false);
assert.equal(api.preset('minimum'),undefined);
assert.equal(api.isEnabled('orders'),false);
assert.equal(api.isEnabled('liquidity'),true);
assert.equal(api.isEnabled('fvg'),false);
assert.equal(api.preset('smc'),undefined);
assert.equal(api.isEnabled('fvg'),true);
assert.equal(api.isEnabled('ifvg'),false);
console.log('PASS: syntax, read-only hooks, persisted toggles and presets.');
