const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const html=readFileSync(require('node:path').resolve(__dirname,'../index.html'),'utf8');
function extract(id) {
 const start='<script id="'+id+'">',i=html.indexOf(start);
 assert.ok(i>=0,'Missing script '+id);
 const j=html.indexOf('</script>',i+start.length);
 assert.ok(j>i);
 const js=html.slice(i+start.length,j);
 new Function(js);
 return js;
}
const pure=extract('ascGlobalTrendEngineV1');
const view=extract('ascGlobalBiasUiV1');
const mod={exports:{}};
new Function('module','globalThis',pure)(mod,{});
const E=mod.exports,now=1800000000;
function bars(sec,d,n=90) {
 const end=Math.floor(now/sec)*sec;
 return Array.from({length:n},(_,i)=>{
 const p=100+d*i*.20+Math.sin(i*.85)*2.1;
 return {time:end-(n-i)*sec,open:p-.12,high:p+.35,low:p-.35,close:p+.12,volume:100+i};
 });
}
const majors=d=>Object.fromEntries(['BTC_USDT','ETH_USDT','SOL_USDT'].map(k=>[k,{'1h':bars(3600,d),'30m':bars(1800,d)}]));
const coin=d=>({'30m':bars(1800,d),'15m':bars(900,d)});
const breadth={long:110,short:40,neutral:50,available:200,source:'radar',running:true};
test('Cloudflare main markup and independent UI parse',()=>{
 assert.ok(html.includes('ASCEND MARKET BIAS · CLOUDFLARE MAIN'));
 assert.equal(E.isTradingSignal,false);
 assert.match(view,/\['1h','15m'\]/);
 assert.match(view,/aggregate30m/);
 assert.doesNotMatch(view,/\['1h','30m'\]/);
});
test('aligned and conflict states, partial coverage',()=>{
 const yes=E.evaluate({asOf:now,leaders:majors(1),coin:coin(1),breadth});
 const no=E.evaluate({asOf:now,leaders:majors(1),coin:coin(-1),breadth});
 assert.equal(yes.market.state,'BULLISH');
 assert.equal(yes.alignment.state,'ALIGNED');
 assert.equal(yes.market.status,'PARTIAL');
 assert.equal(no.alignment.state,'CONFLICT');
});
test('missing, stale and gapped candles',()=>{
 assert.equal(E.evaluate({asOf:now,leaders:{},coin:coin(1),breadth}).market.state,'NO_DATA');
 assert.equal(E.structure(bars(3600,1).slice(0,-6),3600,now).status,'NO_DATA');
 const x=bars(3600,1);x.splice(85,1);
 assert.equal(E.structure(x,3600,now).status,'NO_DATA');
});
test('forming candle excluded',()=>{
 const a=E.structure(bars(3600,1),3600,now);
 const b=E.structure(bars(3600,1).concat({time:now,open:900,high:1000,low:899,close:999,volume:22}),3600,now);
 assert.equal(a.close,b.close);assert.equal(a.shape,b.shape);
});
test('UI renders on repeated chart mount',()=>{
 const nodes={};
 const chart={querySelector:()=>null,insertBefore:el=>{nodes[el.id]=el}};
 nodes.chartShell={closest:()=>chart,appendChild:el=>{nodes[el.id]=el}};
 const document={hidden:true,readyState:'complete',body:{dataset:{view:'market'}},
 head:{appendChild(){}},createElement:tag=>({tag,setAttribute(){},innerHTML:'',textContent:'',id:''}),
 getElementById:id=>nodes[id]||null,addEventListener(){}};
 const window={ASCEND_GLOBAL_TREND_V1:E},state={symbol:'TIA_USDT',tf:{},breadth};
 new Function('window','document','state','setInterval','setTimeout','fetch','AbortController',view)(
 window,document,state,()=>0,()=>0,()=>{},AbortController);
 assert.ok(nodes.ascGlobalBiasV1);
 assert.match(nodes.ascGlobalBiasV1.innerHTML,/GLOBAL/);
 assert.match(nodes.ascGlobalBannerV1.innerHTML,/MARKET STATE/);
});

test('visible UI loads 1H and aggregates closed 15m into 30m without runtime errors',async()=>{
 const nodes={};
 const card={querySelector:()=>null,insertBefore:el=>{nodes[el.id]=el}};
 nodes.chartShell={closest:()=>card,appendChild:el=>{nodes[el.id]=el}};
 const document={hidden:false,readyState:'complete',body:{dataset:{view:'market'}},
   head:{appendChild(){}},createElement:tag=>({tag,setAttribute(){},innerHTML:'',textContent:'',id:''}),
   getElementById:id=>nodes[id]||null,addEventListener(){}};
 const fakeWindow={ASCEND_GLOBAL_TREND_V1:E};
 const state={symbol:'TIA_USDT',tf:{'30m':bars(1800,1),'15m':bars(900,1),'5m':bars(300,1)},breadth};
 class Clock extends Date{static now(){return now*1000}}
 const fetched=[];
 const fetch=async url=>{
   const u=new URL(url,'https://example.invalid');
   const symbol=u.searchParams.get('symbol'),timeframe=u.searchParams.get('timeframe');
   fetched.push([symbol,timeframe]);
   const candles=timeframe==='1h'?bars(3600,1,90):bars(900,1,190);
   return {ok:true,json:async()=>({symbol,candles})};
 };
 new Function('window','document','state','setInterval','setTimeout','fetch','AbortController','Date',view)(
   fakeWindow,document,state,()=>0,()=>0,fetch,AbortController,Clock);
 for(let i=0;i<4;i++)await new Promise(resolve=>setImmediate(resolve));
 assert.equal(fetched.length,6,'Should request 1h and native 15m for three leaders');
 assert.equal(fakeWindow.ASCEND_GLOBAL_BIAS_LAST?.market?.state,'BULLISH');
 assert.equal(fakeWindow.ASCEND_GLOBAL_BIAS_LAST?.alignment?.state,'ALIGNED');
 assert.match(nodes.ascGlobalBiasV1.innerHTML,/BULLISH/);
 assert.match(nodes.ascGlobalBannerV1.innerHTML,/MARKET STATE/);
});
