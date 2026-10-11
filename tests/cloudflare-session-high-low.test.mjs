import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source=await readFile('session-high-low.js','utf8');
new vm.Script(source,{filename:'session-high-low.js'});
const global={};vm.runInNewContext(source,global);
const S=global.ASCEND_SESSION_HL;
assert.ok(S&&typeof S.build==='function');

const HOUR=3600,DAY=86400,FIVE=300,FIFTEEN=900;
const midnight=Date.UTC(2026,9,11)/1000;
const start=midnight+3*HOUR,end=start+9*HOUR;
const create=(t,s,i)=>({
 time:t,open:100,high:103+i*.1,low:95-i*.1,
 close:100,volume:15
});
const rows5=Array.from({length:9*12},(_,i)=>create(start+i*FIVE,FIVE,i));
const rows15=Array.from({length:9*4},(_,i)=>create(start+i*FIFTEEN,FIFTEEN,i));

const asOf=start+90*FIVE;
const live=S.build({windows:[{key:'asia',cycle:'latest',start,end}],
 bars5:rows5,bars15:rows15,asOf,price:100}).rows[0];
assert.equal(live.status,'LIVE');
assert.equal(live.timeframe,'5m');
assert.equal(live.high,103+89*.1);
assert.equal(live.low,95-89*.1);
assert.equal(live.highAt,asOf);
assert.equal(live.lowAt,asOf);
assert.equal(live.coveragePct,83.33);
const closed=S.build({windows:[{key:'asia',cycle:'latest',start,end}],
 bars5:rows5,bars15:rows15,asOf:end,price:100}).rows[0];
assert.equal(closed.status,'FROZEN');
assert.equal(closed.high,103+107*.1);
assert.equal(closed.timeframe,'5m');
assert.equal(closed.coveragePct,100);
const noFuture=S.build({windows:[{key:'asia',cycle:'latest',start,end}],
 bars5:[...rows5,{time:asOf,high:10000,low:1,close:100,volume:100}],
 bars15:rows15,asOf,price:100}).rows[0];
assert.equal(noFuture.high,live.high,'open 5m cannot leak extreme');

const gapped=rows5.filter(b=>b.time!==start+25*FIVE);
const fallback=S.build({windows:[{key:'asia',cycle:'latest',start,end}],
 bars5:gapped,bars15:rows15,asOf:end,price:100}).rows[0];
assert.equal(fallback.status,'FROZEN');
assert.equal(fallback.timeframe,'15m');
assert.equal(fallback.high,103+35*.1);
const noData=S.build({windows:[{key:'asia',cycle:'latest',start,end}],
 bars5:gapped,bars15:rows15.filter(b=>b.time!==start),asOf:end,price:100}).rows[0];
assert.equal(noData.status,'NO DATA');
assert.equal(noData.high,undefined);
assert.equal(noData.low,undefined);

const earlier=S.build({windows:[{key:'sydney',cycle:'previous',
 start:start-DAY,end:end-DAY}],bars5:rows5,bars15:rows15,asOf:end,price:100}).rows[0];
assert.equal(earlier.status,'NO DATA','past levels cannot be invented');
const stitched=[
 {key:'asia',cycle:'latest',start,end},
 {key:'asia',cycle:'previous',start:start-DAY,end:end-DAY},
 {key:'london',cycle:'latest',start:start+HOUR,end:end+HOUR}
];
const data=S.build({windows:stitched,bars5:rows5,bars15:rows15,asOf:end,price:100});
assert.equal(data.rows.length,3);
assert.equal(data.usable,2);
assert.equal(data.rows[0].name,'АЗИЯ');
assert.ok(data.rows[0].fromPriceToHighPct<0);
assert.ok(data.rows[0].fromPriceToLowPct>0);

const html=await readFile('index.html','utf8');
const anchor=source.split('\n')[0],begin=html.indexOf(anchor),stop=html.indexOf('\n</script>',begin);
assert.ok(begin>=0&&stop>begin,'module embedded in Cloudflare worker HTML');
assert.equal(html.slice(begin,stop).trim(),source.trim(),'embedded engine identical to tested source');
for(const key of ['sydney','asia','london','ny'])
  assert.ok(html.includes("['sydney','asia','london','ny']"),'four actual session windows used');
for(const id of ['ascSessionHLToggle','ascSessionHLPrevious',
  'ascSessionHLPanel','ascSessionHLRows','ascSessionHLStatus'])
  assert.ok(html.includes('id="'+id+'"'),id+' visible markup');
assert.ok(html.includes('drawSessionHL(ctx,priceToY,w,h);'),'chart canvas redraws session H/L on zoom/resize');
assert.ok(html.includes('renderSessionHL();'),'render invoked on candles update');
assert.ok(html.includes("sessionWindow(key,asOf)"),'identical existing session schedule');
assert.ok(html.includes("localStorage.setItem('asc_session_hl_v1'"),
 'visibility setting persists');
assert.ok(html.includes("localStorage.setItem('asc_session_hl_prev_v1'"),
 'previous visibility setting persists');
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
for(const [i,m] of scripts.entries())if(m[1].trim())
  new vm.Script(m[1],{filename:'index.inline.'+i+'.js'});
console.log('PASS session H/L: LIVE/FROZEN, prior, 5m/15m fallback, gaps, no lookahead, UI/toggle and inline syntax');
