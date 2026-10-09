import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const output=resolve(tmpdir(),'ascend-market-participation-tests.mjs');
await build({entryPoints:['src/market/marketParticipationEngine.ts'],outfile:output,
  bundle:true,platform:'node',format:'esm',logLevel:'silent'});
const {buildParticipationSnapshot,frozenReferences,detectObservedLevelEvents}=
  await import(pathToFileURL(output).href);
const now=1760000000000,step=300000,symbol='BTCUSDT';
const candle=(t,high,low,close)=>({timestamp:t,open:close,high,low,close,volume:100});
const base=[candle(now-3*step,103,101,102),
  candle(now-2*step,103,101,102),candle(now-step,103,99,102)];
const ready=data=>({symbol,status:'ready',data,updatedAt:now-2000});
const dummy={symbol,status:'loading'};
const sample={
  symbol,now,price:102,priceAt:now-1000,candles:base,timeframe:'5m',
  tpo:ready({poc:102,vah:105,val:100,to:now-1800000,from:now-24*3600000,bars:48,coveragePct:70}),
  oi:ready({value:1000,previous:990,deltaPercent:1000/990*100-100,timestamp:now-300000,history:[]}),
  cvd:ready({buyVolume:120,sellVolume:150,delta:-30,from:now-80000,to:now-70000,trades:1000,history:[]}),
  vwap:{value:101.5,updatedAt:now-10000,points:[],symbol,dayStartUtc:0},
  levels:[],orderbook:{symbol,receivedAt:now-10000,mid:102,levelsPerSide:200,
    clusters:[{id:'bid',side:'bid',low:99,high:101,center:100,notionalUsdt:200000,orders:13},
      {id:'ask',side:'ask',low:103,high:104,center:103.5,notionalUsdt:300000,orders:14}]}
};
let s=buildParticipationSnapshot(sample);
assert.equal(s.context,'BALANCE');
assert.equal(s.delta.status,'STALE','stale trade window never reported as fresh CVD');
assert.equal(s.oi.status,'READY');
assert.equal(s.bookBid.value,200000);
assert.equal(s.structure,'NOT_CONNECTED');
assert.equal(s.coreDecision,'NOT_CONNECTED');
assert.equal(buildParticipationSnapshot({...sample,priceAt:now+1000}).price.status,'NO_DATA',
  'future data never appears current');
assert.equal(buildParticipationSnapshot({...sample,cvd:dummy,oi:dummy,tpo:dummy,vwap:undefined,orderbook:undefined}).context,
  'OBSERVING','missing metrics cannot fabricate a scenario');
const frozen=frozenReferences({symbol,dayStartUtc:now-2*86400000,high:105,low:100});
assert.equal(frozen[0].availableFrom,now-86400000);
const fields={...s,observedAt:now};
const observed=detectObservedLevelEvents({symbol,candles:base,timeframe:'5m',
  levels:frozen,startedAt:now-15*60000,now,snapshot:fields});
assert.equal(observed.length,1);
assert.equal(observed[0].type,'SWEEP_RECLAIM_BAR');
assert.equal(observed[0].level,'YL');
assert.equal(observed[0].occurredAt,now);
assert.equal(observed[0].source,'CLOSED_OHLC');
assert.equal(new Set(observed.map(x=>x.id)).size,observed.length);
assert.equal(detectObservedLevelEvents({symbol,candles:base,timeframe:'5m',
  levels:frozen,startedAt:now-15*60000,now:now-1,snapshot:fields}).length,0,
  'no event from still-open candle');
assert.equal(detectObservedLevelEvents({symbol,candles:base,timeframe:'5m',
  levels:[{...frozen[1],availableFrom:now+1000}],
  startedAt:now-15*60000,now,snapshot:fields}).length,0,
  'never use future frozen levels');
console.log('PASS: Participation snapshots, stale/future/missing guards, frozen-level events and CORE isolation');
