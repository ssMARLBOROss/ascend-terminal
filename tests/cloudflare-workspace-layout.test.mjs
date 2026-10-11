import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source=await readFile('workspace-layout.js','utf8');
new vm.Script(source,{filename:'workspace-layout.js'});
const html=await readFile('index.html','utf8');
const inline=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
for(const [i,m] of inline.entries()){
  if(m[1].trim())new vm.Script(m[1],{filename:'index.inline.'+i+'.js'});
}
assert.ok(html.includes('body.asc-layout-menu-hidden .app'));
assert.ok(html.includes('body.asc-layout-radar-hidden #ascendRadarRail'));
assert.ok(html.includes('body.asc-layout-focus #market .chart-card'));
assert.ok(html.includes('body.asc-layout-focus #market .chart-card>.chart-shell'));
assert.ok(html.includes('id="ascendRadarRail"'));
assert.ok(html.includes('id="chartShell"'));
assert.match(html, /<button id="ascendLayoutMenu"[^>]*class="asc-layout-action"/);
assert.match(html, /<button id="ascendLayoutRadar"[^>]*class="asc-layout-action"/);
assert.match(html, /<button id="ascendLayoutFocus"[^>]*class="asc-layout-focus-action"/);
assert.ok(!/candles\.setData|renderChart\(|chart\.remove\(/.test(source),
  'workspace controls must not redraw or recreate candle series');

function environment({mobile=false,initial=null,preexisting=false,radarReady=true}={}){
  const handlers=new Map(),nodes=new Map(),stored=new Map();
  if(initial!==null)stored.set('ascend_workspace_layout_v1',JSON.stringify(initial));
  class FakeNode{
    constructor(id=''){this.id=id;this.className='';this.title='';this.textContent='';
      this.attrs=new Map();this.listeners=new Map();this.clientWidth=800;this.clientHeight=600;
      this.classList={classes:new Set(),toggle:(c,v)=>{
        if(v)this.classList.classes.add(c);else this.classList.classes.delete(c);
      },contains:c=>this.classList.classes.has(c)};}
    setAttribute(k,v){this.attrs.set(k,v)}
    getAttribute(k){return this.attrs.get(k)}
    addEventListener(k,cb){this.listeners.set(k,cb)}
    click(){this.listeners.get('click')?.({target:{closest:()=>null}})}
    insertBefore(child){nodes.set(child.id,child)}
    appendChild(child){nodes.set(child.id,child)}
    querySelector(selector){return selector==='nav'?nav:null}
  }
  const topbar=new FakeNode('topbar'),tfbar=new FakeNode('tfBar');
  const sidebar=new FakeNode('sidebar'),nav=new FakeNode('nav'),
    radar=new FakeNode('ascendRadarRail'),graph=new FakeNode('chart');
  graph.clientWidth=920;graph.clientHeight=650;
  nodes.set('tfBar',tfbar);
  if(radarReady)nodes.set('ascendRadarRail',radar);
  nodes.set('chart',graph);
  if(preexisting){
    for(const id of ['ascendLayoutMenu','ascendLayoutRadar','ascendLayoutFocus']){
      const el=new FakeNode(id);el.parentNode=id==='ascendLayoutFocus'?tfbar:topbar;
      nodes.set(id,el);
    }
  }
  const body=new FakeNode('body');body.dataset={view:'market'};
  const document={
    readyState:'complete',body,
    getElementById:id=>nodes.get(id)??null,
    querySelector:s=>s==='.main .topbar'?topbar:s==='.app > aside.sidebar'?sidebar:null,
    createElement:()=>new FakeNode(),
    addEventListener:(type,fn)=>handlers.set(type,fn)
  };
  const applied=[],keys=[];
  const chart={applyOptions:x=>applied.push(x)};
  const store={
    getItem:key=>stored.get(key)??null,
    setItem:(key,value)=>stored.set(key,value)
  };
  const window={
    matchMedia:()=>({matches:mobile}),
    requestAnimationFrame:f=>f(),
    addEventListener:(type,fn)=>handlers.set('window:'+type,fn),
  };
  let redraws=0;
  const ctx={document,window,localStorage:store,chart,
    scheduleOverlay:()=>{redraws++},
    ascendLiquidityDraw:()=>{},console};
  vm.runInNewContext(source,ctx);
  return {ctx,nodes,stored,handlers,body,applied,redraws:()=>redraws};
}
const x=environment();
assert.equal(x.ctx.window.ASCEND_WORKSPACE_LAYOUT.getState().menu,true);
assert.equal(x.ctx.window.ASCEND_WORKSPACE_LAYOUT.getState().radar,true);
assert.equal(x.nodes.get('ascendLayoutMenu').getAttribute('aria-expanded'),'true');
x.nodes.get('ascendLayoutMenu').click();
assert.equal(x.ctx.window.ASCEND_WORKSPACE_LAYOUT.getState().menu,false);
assert.equal(x.body.classList.contains('asc-layout-menu-hidden'),true);
x.nodes.get('ascendLayoutRadar').click();
assert.equal(x.ctx.window.ASCEND_WORKSPACE_LAYOUT.getState().radar,false);
assert.equal(x.body.classList.contains('asc-layout-radar-hidden'),true);
assert.equal(JSON.parse(x.stored.get('ascend_workspace_layout_v1')).menu,false);
assert.ok(x.applied.some(v=>v.width===920&&v.height===650));
x.nodes.get('ascendLayoutFocus').click();
assert.equal(x.ctx.window.ASCEND_WORKSPACE_LAYOUT.getState().focus,true);
assert.equal(x.body.classList.contains('asc-layout-focus'),true);
assert.equal(x.nodes.get('ascendLayoutFocus').getAttribute('aria-pressed'),'true');
x.handlers.get('keydown')({key:'Escape',preventDefault:()=>{}});
assert.equal(x.ctx.window.ASCEND_WORKSPACE_LAYOUT.getState().focus,false);
assert.equal(x.body.classList.contains('asc-layout-focus'),false);
const staticFirst=environment({preexisting:true,radarReady:false});
assert.equal(staticFirst.body.dataset.ascWorkspaceBound,'true');
assert.equal(staticFirst.nodes.get('ascendLayoutRadar').getAttribute('aria-expanded'),'true');
staticFirst.nodes.get('ascendLayoutMenu').click();
assert.equal(staticFirst.body.classList.contains('asc-layout-menu-hidden'),true,
  'static button works even before radar mounts');
staticFirst.nodes.get('ascendLayoutRadar').click();
assert.equal(staticFirst.body.classList.contains('asc-layout-radar-hidden'),true);
staticFirst.handlers.get('window:load')();
assert.equal(staticFirst.body.dataset.ascWorkspaceBound,'true','late load must be idempotent');
staticFirst.nodes.get('ascendLayoutMenu').click();
assert.equal(staticFirst.body.classList.contains('asc-layout-menu-hidden'),false,
  'no duplicated event listener');
const persisted=environment({initial:{menu:false,radar:false}});
assert.equal(persisted.ctx.window.ASCEND_WORKSPACE_LAYOUT.getState().menu,false);
assert.equal(persisted.ctx.window.ASCEND_WORKSPACE_LAYOUT.getState().radar,false);
const mob=environment({mobile:true});
assert.equal(mob.ctx.window.ASCEND_WORKSPACE_LAYOUT.getState().menu,false);
mob.nodes.get('ascendLayoutMenu').click();
assert.equal(mob.ctx.window.ASCEND_WORKSPACE_LAYOUT.getState().menu,true);
mob.handlers.get('keydown')({key:'Escape',preventDefault:()=>{}});
assert.equal(mob.ctx.window.ASCEND_WORKSPACE_LAYOUT.getState().menu,false);
console.log('PASS Workspace: static buttons bind without Radar, no double listeners, persists state, focus/Escape, responsive resize');
