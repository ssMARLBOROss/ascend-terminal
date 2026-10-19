import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

const {calculateRadarAgreement,RADAR_AGREEMENT_TFS}=
  await import(pathToFileURL(process.env.RADAR_TF_BUNDLE||'/tmp/ascend-radar-tf.mjs').href);
const NOW=1800000000000;
function series(minutes,sign,n=160){
 const step=minutes*60000,end=Math.floor(NOW/step)*step;
 return Array.from({length:n},(_,i)=>{
  const m=100+sign*i*.22+2.2*Math.sin(i*.85);
  return {timestamp:end-(n-i)*step,open:m-.13,
   high:m+.35,low:m-.35,close:m+.13,volume:100+i};
 });
}
const input=(d5,d15,d60,d240)=>({
 asOf:NOW,bars5:series(5,d5),bars15:series(15,d15),
 bars60:series(60,d60),bars240:series(240,d240)
});
test('fixed periods are 5m 10m 15m 30m 1H 4H',()=>{
 assert.deepEqual(RADAR_AGREEMENT_TFS.map(x=>x[0]),
  ['5m','10m','15m','30m','1H','4H']);
});
test('6/6 coherent up structure is LONG but not an entry signal',()=>{
 const a=calculateRadarAgreement(input(1,1,1,1));
 assert.equal(a.status,'READY');
 assert.equal(a.direction,'LONG');
 assert.equal(a.count,6);
 assert.equal(a.matched.length,6);
 assert.equal(a.isTradingSignal,false);
});
test('5/6 and 4/6 trend matches are distinguished',()=>{
 const five=calculateRadarAgreement(input(1,1,1,-1));
 const four=calculateRadarAgreement(input(1,1,-1,-1));
 assert.equal(five.status,'READY');
 assert.equal(five.direction,'LONG');
 assert.equal(five.count,5);
 assert.equal(four.status,'READY');
 assert.equal(four.direction,'LONG');
 assert.equal(four.count,4);
});
test('bearish matches work independently from direction of 24h change',()=>{
 const a=calculateRadarAgreement(input(-1,-1,-1,-1));
 assert.equal(a.status,'READY');
 assert.equal(a.direction,'SHORT');
 assert.equal(a.count,6);
 assert.equal(a.isTradingSignal,false);
});
test('missing/gapped/stale data do not invent TF alignment',()=>{
 const missing=calculateRadarAgreement({...input(1,1,1,1),bars240:[]});
 assert.equal(missing.status,'NO_DATA');
 const g=input(1,1,1,1);
 g.bars60.splice(g.bars60.length-6,1);
 assert.equal(calculateRadarAgreement(g).status,'NO_DATA');
 const stale=input(1,1,1,1);
 stale.bars5=stale.bars5.slice(0,-7);
 assert.equal(calculateRadarAgreement(stale).status,'NO_DATA');
});
test('unclosed future candle is never included',()=>{
 const a=input(1,1,1,1);
 const normal=calculateRadarAgreement(a);
 a.bars15.push({timestamp:NOW,open:900,high:910,low:890,close:900,volume:99});
 const altered=calculateRadarAgreement(a);
 assert.equal(altered.count,normal.count);
 assert.equal(altered.direction,normal.direction);
});
test('radar screens use only a candidates mode; do not alter core signals',()=>{
 const ui=readFileSync('apps/terminal/src/components/RadarView.tsx','utf8');
 const scanner=readFileSync('apps/terminal/src/market/useRadarScanner.ts','utf8');
 assert.match(ui,/СОВПАДЕНИЕ ТФ · 4–6/);
 assert.match(ui,/minMatch/);
 assert.match(ui,/row\.tfAgreement\?\.count/);
 assert.match(ui,/ВХОД НЕ ПРОВЕРЕН/);
 assert.match(scanner,/Math\.min\(limit,40\)/);
 assert.match(scanner,/matchMode\?180000:120000/);
 assert.doesNotMatch(scanner,/placeOrder|submitOrder|createOrder/);
});
