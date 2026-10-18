import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const a=html.indexOf('<!-- ASCEND MULTI-TF FVG VISUAL RESEARCH V2');
const begin=html.indexOf('<script>',a)+8;
const end=html.indexOf('</script>',begin);
assert(a>=0&&begin>8&&end>begin,'Embedded FVG module missing');
const window={};
vm.runInNewContext(html.slice(begin,end),{window});
const scanner=window.ASCEND_FVG_MTF_VISUAL_V2;
const anchor=1790000000-(1790000000%60);
function series(){
 const arr=[];
 for(let i=0;i<30;i++){
  const p=100+i*.01;
  arr.push({time:anchor+i*60,open:p,high:p+.15,low:p-.15,close:p+.04});
 }
 arr[20]={time:anchor+20*60,open:101.1,high:101.5,low:101,close:101.3};
 arr[21]={time:anchor+21*60,open:101.4,high:102,low:100,close:101.2};
 return arr;
}
const options={tfs:['1m'],atr:7,minPercent:.05,max:4,onlyActive:false};
const identify=(r,formedAt)=>r.zones.find(z=>z.formedAt===formedAt);

test('FVG forms only on third candle close and never anticipates the next candle',()=>{
 const b=series(),formedAt=b[20].time+60;
 const before=scanner.scan({'1m':b},formedAt-1,101.3,options);
 const now=scanner.scan({'1m':b},formedAt,101.3,options);
 assert.equal(identify(before,formedAt),undefined);
 assert.equal(identify(now,formedAt)?.fillFraction,0);
 assert.equal(identify(now,formedAt)?.status,'OPEN');
});
test('Wick mitigation and close mitigation differ and future bars never leak',()=>{
 const b=series(),asOf=b[21].time+60,formedAt=b[20].time+60;
 const wick=identify(scanner.scan({'1m':b},asOf,101.2,{...options,fill:'wicks'}),formedAt);
 const closes=identify(scanner.scan({'1m':b},asOf,101.2,{...options,fill:'closes'}),formedAt);
 assert.equal(wick?.fillFraction,1);
 assert.equal(wick?.status,'FILLED');
 assert.equal(closes?.fillFraction,0);
 assert.equal(closes?.status,'OPEN');
});
test('Active-only suppresses filled zones; empty history gives NO DATA',()=>{
 const b=series(),asOf=b[21].time+60,formedAt=b[20].time+60;
 const active=scanner.scan({'1m':b},asOf,101.2,{...options,onlyActive:true});
 assert.equal(identify(active,formedAt),undefined);
 assert.equal(scanner.scan({'1m':[]},asOf,101.2,options).status,'NO DATA');
});
test('UI controls keep display research separate from trading engine',()=>{
 assert.match(html,/fvgDefaults=\{tfs:\['3m','5m','15m'\]/);
 assert.match(html,/max:4,opacity:42/);
 assert.match(html,/ascRefreshChartStudies\(r,\[ss20,ss50,ss200\]\)/);
 assert.match(html,/root\.ASCEND_FVG_MTF_VISUAL_V2=Object\.freeze/);
 assert.match(html,/MSS: данные не подключены к FVG слою/);
});
