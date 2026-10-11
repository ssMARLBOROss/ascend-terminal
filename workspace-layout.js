/* ASCEND Workspace Layout V1 — view-only controls, preserve live charts and Core. */
(function(){
  'use strict';
  const KEY='ascend_workspace_layout_v1';
  const $=id=>document.getElementById(id);
  const mobile=()=>window.matchMedia('(max-width: 820px)').matches;
  function saved(){
    try{const v=JSON.parse(localStorage.getItem(KEY)||'{}');
      return v&&typeof v==='object'?v:{};}catch(_){return {}}
  }
  const stored=saved();
  const view={
    menu:typeof stored.menu==='boolean'?stored.menu:!mobile(),
    radar:typeof stored.radar==='boolean'?stored.radar:true,
    focus:false
  };
  let scheduled=false;
  function resizeChart(){
    if(scheduled)return;
    scheduled=true;
    window.requestAnimationFrame(()=>{
      window.requestAnimationFrame(()=>{
        scheduled=false;
        const element=$('chart');
        if(!element)return;
        try{
          if(typeof chart!=='undefined'&&chart&&element.clientWidth>0&&element.clientHeight>0){
            chart.applyOptions({width:element.clientWidth,height:element.clientHeight});
          }
          if(typeof scheduleOverlay==='function')scheduleOverlay();
          if(typeof ascendLiquidityDraw==='function')ascendLiquidityDraw();
        }catch(err){console.warn('ASCEND workspace resize',err);}
      });
    });
  }
  function persist(){
    try{localStorage.setItem(KEY,JSON.stringify({menu:view.menu,radar:view.radar}))}catch(_){}
  }
  function sync(){
    document.body.classList.toggle('asc-layout-menu-open',view.menu);
    document.body.classList.toggle('asc-layout-menu-hidden',!view.menu);
    document.body.classList.toggle('asc-layout-radar-hidden',!view.radar);
    document.body.classList.toggle('asc-layout-focus',view.focus);
    const menu=$('ascendLayoutMenu'),radar=$('ascendLayoutRadar'),focus=$('ascendLayoutFocus');
    if(menu){
      menu.setAttribute('aria-expanded',String(view.menu));
      menu.textContent=view.menu?'☰ Скрыть меню':'☰ Открыть меню';
      menu.title=view.menu?'Скрыть левую навигацию':'Открыть левую навигацию';
    }
    if(radar){
      radar.setAttribute('aria-expanded',String(view.radar));
      radar.textContent=view.radar?'◫ Скрыть радар':'◫ Показать радар';
    }
    if(focus){
      focus.setAttribute('aria-pressed',String(view.focus));
      focus.textContent=view.focus?'↙ Вернуть график':'⛶ На весь экран';
      focus.title=view.focus?'Вернуться к рабочему столу (Esc)':'Развернуть график почти на весь экран';
    }
    resizeChart();
  }
  function menuToggle(){view.menu=!view.menu;persist();sync();}
  function radarToggle(){view.radar=!view.radar;persist();sync();}
  function focusToggle(force){
    const next=typeof force==='boolean'?force:!view.focus;
    if(next&&document.body.dataset.view!=='market')return;
    view.focus=next;sync();
  }
  function button(id,cls,ariaControls){
    const b=document.createElement('button');
    b.type='button';b.id=id;b.className=cls;
    if(ariaControls)b.setAttribute('aria-controls',ariaControls);
    return b;
  }
  function mount(){
    if($('ascendLayoutMenu'))return;
    const topbar=document.querySelector('.main .topbar');
    const tfbar=$('tfBar'),sidebar=document.querySelector('.app > aside.sidebar');
    const radar=$('ascendRadarRail');
    if(!topbar||!tfbar||!sidebar||!radar)return;
    sidebar.id='ascendNavSidebar';
    const menu=button('ascendLayoutMenu','asc-layout-action','ascendNavSidebar');
    const radarButton=button('ascendLayoutRadar','asc-layout-action','ascendRadarRail');
    const focus=button('ascendLayoutFocus','asc-layout-focus-action',null);
    topbar.insertBefore(menu,topbar.firstChild);
    topbar.insertBefore(radarButton,menu.nextSibling);
    tfbar.appendChild(focus);
    menu.addEventListener('click',menuToggle);
    radarButton.addEventListener('click',radarToggle);
    focus.addEventListener('click',()=>focusToggle());
    document.addEventListener('keydown',event=>{
      if(event.key==='Escape'){
        if(view.focus){focusToggle(false);event.preventDefault();}
        else if(mobile()&&view.menu){view.menu=false;persist();sync();}
      }
    });
    const nav=sidebar.querySelector('nav');
    nav?.addEventListener('click',event=>{
      if(mobile()&&event.target.closest('a')){
        view.menu=false;persist();sync();
      }
    });
    window.addEventListener('resize',()=>{
      if(view.focus)resizeChart();
      else resizeChart();
    },{passive:true});
    window.addEventListener('popstate',()=>{
      if(document.body.dataset.view!=='market'&&view.focus)focusToggle(false);
      else sync();
    });
    sync();
  }
  // The UI V1.1 shell uses DOMContentLoaded to move existing panels.
  if(document.readyState==='loading')
    document.addEventListener('DOMContentLoaded',mount,{once:true});
  else mount();
  window.ASCEND_WORKSPACE_LAYOUT={
    toggleMenu:menuToggle,toggleRadar:radarToggle,toggleFocus:focusToggle,
    getState:()=>({...view}),sync
  };
})();
