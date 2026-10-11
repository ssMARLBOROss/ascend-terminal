import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';

const target=resolve(tmpdir(),'ascend-chart-display-visibility-tests.mjs');
await build({entryPoints:['src/market/chartDisplay.ts'],
  outfile:target,bundle:true,platform:'node',format:'esm',logLevel:'silent'});
const {resolveChartLayers}=await import(pathToFileURL(target).href);
const flags={volume:true,vwap:true,sessions:true,sessionClock:true,
  dayLevels:true,sessionLevels:true,book:true,stops:true,tpo:true,
  fvg:true,liquidityMap:false,liquidityOnly:true};
const active=resolveChartLayers(flags);
assert.equal(active.liquidityMap,true,'Liquidity Map is mandatory in clean mode');
for(const [k,v] of Object.entries(active)){
  if(k!=='liquidityMap')assert.equal(v,false,'Hidden from central chart: '+k);
}
const legacy=resolveChartLayers({...flags,liquidityOnly:false});
assert.equal(legacy.liquidityMap,false);
for(const [k,v] of Object.entries(legacy)){
  if(k!=='liquidityMap')assert.equal(v,true,'Restore saved layer: '+k);
}
console.log('PASS: clean Liquidity Map masks all overlays and preserves saved research toggles');
