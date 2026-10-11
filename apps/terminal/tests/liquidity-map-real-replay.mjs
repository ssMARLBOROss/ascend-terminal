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
  const deepestClose=Date.parse(signal.sweep)+60000;
  assert.equal(yl.deepestAt,deepestClose,
    'Deepest historical wick must match minute reported by signal: '+name);
  assert.equal(yl.deepestPrice,signal.sweepLow,
    'Deepest historical wick must match price reported by signal: '+name);
  assert.ok(yl.deepestDepthPct>0,'Sweep penetration must be positive');
  const crossing=map.events.find(e=>e.key==='YL'&&e.type==='SWEEP'&&e.at<=deepestClose);
  assert.ok(crossing,'A frozen-level crossing must precede deepest wick: '+name);
  const reclaim=map.events.find(e=>e.key==='YL'&&e.type==='RECLAIM'&&
    e.at>=deepestClose&&e.at<=lastAlert);
  assert.ok(reclaim,'Real closed-candle reclaim missing after deepest wick: '+name);
  console.log(name,'YL',yl.price,
    'CROSS',new Date(crossing.at).toISOString(),
    'DEEPEST',new Date(deepestClose).toISOString(),
    'depth',yl.deepestDepthPct.toFixed(2)+'%',
    'RECLAIM',new Date(reclaim.at).toISOString(),'ATR',map.atr.toPrecision(4));
}
console.log('PASS: six archived MEXC Futures 1m YL sweeps/reclaims replayed from real OHLCV');
