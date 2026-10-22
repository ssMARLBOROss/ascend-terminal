import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../tpo-market-profile-v1.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const root={};vm.runInNewContext(source,{window:root});
const tpo=root.ASCEND_TPO_PROFILE_V1;
const DAY=86400,base=1790208000-(1790208000%DAY);
const makeDay=(day,price=100,volScale=1)=>{
 const bars=[];
 for(let i=0;i<288;i++){
   const t=day+i*300,move=(i%18<9?.07:-.07),p=price+move;
   bars.push({time:t,open:p,high:p+.19,low:p-.19,close:p+.04,volume:(i+1)*volScale});
 }
 return bars;
};
test('TPO counts time brackets once per level, not executed volume',()=>{
 const bars=makeDay(base);
 const p=tpo.study(bars,base+DAY,{period:30,dayOffset:0,now:base+DAY});
 assert.equal(p.status,'COMPLETE');
 assert.equal(p.actualBrackets,48);
 assert.equal(p.profile.countBrackets,48);
 assert.ok(p.profile.total>48);
 assert.ok(p.profile.coverage>=.7);
 const heavier=tpo.study(makeDay(base,100,1e8),base+DAY,{period:30});
 assert.equal(heavier.profile.poc,p.profile.poc);
 assert.equal(heavier.profile.total,p.profile.total);
});
test('No future candles and no unfinished 30-minute bracket',()=>{
 const bars=makeDay(base);
 const p=tpo.study(bars,base+35*60,{period:30});
 assert.equal(p.actualBrackets,1);
 assert.equal(p.profile.countBrackets,1);
 assert.equal(p.status,'PARTIAL');
 assert.equal(p.profile.rows.reduce((n,z)=>n+z.count,0),p.profile.total);
});
test('Missing 5-minute candle invalidates the entire affected time bracket',()=>{
 const bars=makeDay(base).filter(b=>b.time!==base+5*60);
 const p=tpo.study(bars,base+DAY,{period:30});
 assert.equal(p.actualBrackets,47);
 assert.equal(p.status,'PARTIAL');
});
test('Overlapping sessions are independent and do not multiply global TPO',()=>{
 const p=tpo.study(makeDay(base),base+DAY,{period:30});
 const byId=Object.fromEntries(p.sessions.map(s=>[s.id,s]));
 assert.equal(byId.asia.brackets,16);
 assert.equal(byId.frankfurt.brackets,6);
 assert.equal(byId.london.brackets,18);
 assert.equal(byId.newyork.brackets,18);
 assert.equal(p.book.length,48);
});
test('NPOC only from fully covered untouched previous day',()=>{
 const source=[...makeDay(base-86400,100),...makeDay(base,110)];
 const p=tpo.study(source,base+86400,{period:30});
 assert.equal(p.status,'COMPLETE');
 assert.ok(p.npoc?.price<105);
 assert.equal(p.npoc.day,base-86400);
 const touched=tpo.study([...makeDay(base-86400,100),...makeDay(base,100)],base+86400,{period:30});
 assert.equal(touched.npoc,null);
});
test('Supported alternative bracket widths and no partial source interpolation',()=>{
 const bars=makeDay(base);
 assert.equal(tpo.study(bars,base+DAY,{period:15}).actualBrackets,96);
 assert.equal(tpo.study(bars,base+DAY,{period:60}).actualBrackets,24);
 assert.equal(tpo.study([],base+DAY).status,'NO_DATA');
 assert.equal(tpo.study([bars[0]],base+DAY).status,'NO_DATA');
});
test('Dedicated TPO view and visual module do not alter entry routing',()=>{
 assert.match(html,/data-view-link="tpo"/);
 assert.match(html,/id="ascTpoAnalysis"/);
 assert.match(html,/currentView\(\)!=="market"&&currentView\(\)!=="tpo"/);
 assert.match(html,/root.ASCEND_TPO_UI_V1=Object.freeze/);
 assert.match(html,/TPO без сделок/);
 const start=html.indexOf('<!-- ASCEND TPO ENGINE V1 embedded exactly as tpo-market-profile-v1.js -->');
 const embed=html.slice(html.indexOf('<script>',start)+8,html.indexOf('</script>',start));
 assert.equal(embed.trim(),source.trim());
 assert.ok(start>0&&start<html.lastIndexOf('</body>'),'Script is inside body');
});
