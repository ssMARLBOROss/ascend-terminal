import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';

const target=resolve(tmpdir(),'ascend-liquidity-map-real-replay.mjs');
await build({entryPoints:['src/market/liquidityMapEngine.ts'],
  outfile:target,bundle:true,platform:'node',format:'esm',logLevel:'silent'});
const {computeLiquidityMap}=await import(pathToFileURL(target).href);
const names=['ONDO','ALGO','QNT','DOT','FARTCOIN','ZRO'];
const root=process.env.LIQUIDITY_REAL_FIXTURE_DIR;
assert.ok(root,'LIQUIDITY_REAL_FIXTURE_DIR must point to archived MEXC Futures 1m snapshots');
for(const name of names){
  const data=JSON.parse(await readFile(resolve(root,name+'_USDT.json'),'utf8'));
  const start=data.start*1000;
  const previous=data.day1.find(x=>x.time===data.start-86400);
  assert.ok(previous,'Missing actual prior UTC day data for '+name);
  assert.ok(data.gapCount===0,'Raw 1m history must be complete');
  const bars=data.candles.map(([t,o,h,l,c,v])=>({
    timestamp:t*1000,open:o,high:h,low:l,close:c,volume:v
  }));
  const signal=data.signal;
  assert.equal(previous.low,signal.yl,'Yesterdays low must match archived signal');
  const lastAlert=Date.parse(signal.alert);
  const map=computeLiquidityMap({
    symbol:signal.symbol,bars,asOf:lastAlert,
    previousDay:{symbol:signal.symbol,dayStartUtc:start-86400000,
      high:previous.high,low:previous.low}
  });
  assert.ok(map?.levels.length>=4,'Real 1m data must compute map: '+name);
  const yl=map.levels.find(l=>l.key==='YL');
  assert.equal(yl?.price,signal.yl,'Frozen YL was preserved');
  const sweepClose=Date.parse(signal.sweep)+60000;
  const candidate=map.events.find(e=>e.key==='YL'&&e.type==='SWEEP'&&e.at===sweepClose);
  assert.ok(candidate,'Archived real YL sweep not located at exact minute: '+name);
  assert.ok(candidate.depthPct>0,'Real sweep must have positive penetration');
  const reclaim=map.events.find(e=>e.key==='YL'&&e.type==='RECLAIM'&&
    e.at>=sweepClose&&e.at<=lastAlert);
  assert.ok(reclaim,'Real closed-candle reclaim missing before notice: '+name);
  console.log(name,'YL',yl.price,'SWEEP',new Date(sweepClose).toISOString(),
    'depth',candidate.depthPct.toFixed(2)+'%',
    'RECLAIM',new Date(reclaim.at).toISOString(),'ATR',map.atr.toPrecision(4));
}
console.log('PASS: six archived MEXC Futures 1m YL sweeps/reclaims replayed from real OHLCV');
