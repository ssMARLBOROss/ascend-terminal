const UPSTREAM = "https://ascend-terminal-api-production.up.railway.app";
const FRONTEND = "https://raw.githubusercontent.com/ssMARLBOROss/ascend-terminal/main/index.html";


const OWNER_TOKEN_HASH = "d40b212fe51d0c456d7c5df5abe528df9817c646a63edcc38893a5063dc8a509";
const SHARE_TOKEN_HASH = "fa5ef0fe3a2ddb95cb234de5c9238e97761f3d198b64a87d950b3bbe3ae50cdd";
const SHARE_LINK_EXPIRES_AT = Date.parse("2026-10-02T16:48:00Z");
const SHARE_SESSION_TTL_MS = 2 * 60 * 60 * 1000;
const GUEST_API = new Set(["/api/v2/symbols","/api/v2/ticker","/api/v2/klines","/api/v2/volume-profile","/api/v2/breadth","/api/v2/radar-candidates","/api/v2/news"]);

function cookie(req,name){
  const raw=req.headers.get("cookie")||"";
  for(const p of raw.split(";")){
    const i=p.indexOf("="); if(i<0) continue;
    if(p.slice(0,i).trim()===name) return decodeURIComponent(p.slice(i+1).trim());
  }
  return "";
}
async function sha(v){
  const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(String(v)));
  return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,"0")).join("");
}
function eq(a,b){
  if(typeof a!=="string"||typeof b!=="string"||a.length!==b.length) return false;
  let d=0; for(let i=0;i<a.length;i++) d|=a.charCodeAt(i)^b.charCodeAt(i); return d===0;
}
async function owner(req){
  const t=cookie(req,"ascend_owner"); return !!t && eq(await sha(t),OWNER_TOKEN_HASH);
}
function gate(env){
  return env.SHARE_GATE.get(env.SHARE_GATE.idFromName(SHARE_TOKEN_HASH));
}
async function guest(req,env){
  const s=cookie(req,"ascend_guest"); if(!s) return false;
  const r=await gate(env).fetch("https://gate/check",{method:"POST",headers:{"x-session":s}});
  return r.ok;
}
async function guestTab(req,env){
  const s=cookie(req,"ascend_guest"), t=req.headers.get("x-guest-tab")||"";
  if(!s||!t) return false;
  const r=await gate(env).fetch("https://gate/check-tab",{method:"POST",headers:{"x-session":s,"x-tab":t}});
  return r.ok;
}
function locked(status=401,title="ASCEND · PRIVATE"){
  const body='<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><title>'+title+'</title><style>html,body{margin:0;min-height:100%;background:#020711;color:#eef5ff;font-family:system-ui,-apple-system,Segoe UI,Arial,sans-serif}main{min-height:100vh;display:grid;place-items:center;padding:24px}.b{max-width:540px;border:1px solid #1b2e45;border-radius:14px;background:#07101c;padding:24px;text-align:center}.t{font-weight:900;letter-spacing:.14em;color:#59e7ff}.m{margin-top:12px;color:#8493aa;line-height:1.5}</style></head><body><main><div class="b"><div class="t">'+title+'</div><div class="m">Доступ закрыт. Нужна персональная ссылка владельца или действующая одноразовая гостевая ссылка.</div></div></main></body></html>';
  return new Response(body,{status,headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store","x-robots-tag":"noindex, nofollow, noarchive","referrer-policy":"no-referrer"}});
}
function burned(msg="Эта гостевая ссылка уже использована или недействительна."){
  return new Response('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;background:#020711;color:#eef5ff;font-family:system-ui;display:grid;place-items:center;min-height:100vh"><div style="max-width:560px;padding:24px;text-align:center"><b style="color:#ff667b">ASCEND · LINK CLOSED</b><p>'+msg+'</p></div></body>',{status:410,headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store","x-robots-tag":"noindex, nofollow, noarchive","referrer-policy":"no-referrer"}});
}
async function frontend(isGuest){
  const p=await fetch(FRONTEND,{cf:{cacheTtl:30,cacheEverything:true}});
  const h=new Headers(p.headers);
  h.set("content-type","text/html; charset=utf-8"); h.set("cache-control","no-store, max-age=0");
  h.set("x-robots-tag","noindex, nofollow, noarchive"); h.set("referrer-policy","no-referrer");
  h.set("permissions-policy","camera=(), microphone=(), geolocation=(), clipboard-read=(), clipboard-write=()");
  h.delete("content-security-policy"); h.delete("content-security-policy-report-only"); h.delete("x-frame-options"); h.delete("content-length"); h.delete("content-encoding");
  h.set("content-security-policy","default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; font-src 'self' data:; frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'none';");
  if(!isGuest) return new Response(p.body,{status:p.status,headers:h});
  let x=await p.text();
  const inject='<style>html,body{user-select:none;-webkit-user-select:none}.tradebox,#paperStrip,#shadowNotebook,#journal,.nav a:not([data-view-link="market"]),.mobile-nav a:not([data-view-link="market"]){display:none!important}a[href^="http"]{pointer-events:none!important}@media print{body{display:none!important}}body:before{content:"ГОСТЕВОЙ ПРОСМОТР · READ ONLY";position:fixed;right:10px;bottom:10px;z-index:99999;padding:7px 10px;border:1px solid #48d6ff66;border-radius:8px;background:#04111be8;color:#8fe9ff;font:800 10px system-ui;pointer-events:none}</style><script>(()=>{const m=location.hash.match(/(?:^#|&)gt=([^&]+)/);if(m){sessionStorage.setItem("ascend_guest_tab",decodeURIComponent(m[1]));history.replaceState(null,"",location.pathname+location.search)}const raw=window.fetch.bind(window);window.fetch=(input,init={})=>{const t=sessionStorage.getItem("ascend_guest_tab"),h=new Headers(init.headers||{});if(t)h.set("x-guest-tab",t);return raw(input,{...init,headers:h})};document.addEventListener("DOMContentLoaded",()=>{document.body.dataset.view="market";document.querySelectorAll("[data-view-link]").forEach(a=>{if(a.dataset.viewLink!=="market")a.remove()});["sellBtn","buyBtn","paperCloseBtn"].forEach(id=>{const e=document.getElementById(id);if(e)e.style.display="none"});document.querySelectorAll("a[href^=\\"http\\"]").forEach(a=>a.removeAttribute("href"))},{once:true});["contextmenu","copy","cut","dragstart"].forEach(n=>document.addEventListener(n,e=>e.preventDefault()))})();</script>';
  x=x.replace("</head>",inject+"</head>"); return new Response(x,{status:p.status,headers:h});
}
async function api(req,u,isGuest){
  if(isGuest && (!["GET","HEAD"].includes(req.method)||!GUEST_API.has(u.pathname))) return Response.json({ok:false,error:"guest_read_only"},{status:403,headers:{"cache-control":"no-store"}});
  const proxyHeaders={accept:"application/json","user-agent":isGuest?"ASCEND-Guest/1.0":"ASCEND-Terminal/1.0"}; const auth=req.headers.get("authorization"); if(auth) proxyHeaders.authorization=auth; if(req.headers.get("content-type")) proxyHeaders["content-type"]=req.headers.get("content-type");
  const init={method:req.method,headers:proxyHeaders,redirect:"follow"}; if(!["GET","HEAD"].includes(req.method)) init.body=req.body;
  const r=await fetch(new URL(u.pathname+u.search,UPSTREAM),init);
  const h=new Headers(r.headers); h.set("cache-control","no-store"); h.set("x-ascend-upstream-status",String(r.status)); h.set("access-control-allow-origin",u.origin); h.delete("set-cookie");
  return new Response(r.body,{status:r.status,statusText:r.statusText,headers:h});
}
async function legacy(req){
  const u=new URL(req.url);
  if(u.pathname.startsWith("/api/")) return api(req,u,false);
  if(u.pathname==="/"||u.pathname==="/analysis"||u.pathname==="/index.html") return frontend(false);
  const t=new URL(u.pathname+u.search,UPSTREAM),h=new Headers(req.headers);
  h.set("host",t.host); h.set("x-forwarded-host",u.host); h.set("x-forwarded-proto","https");
  const init={method:req.method,headers:h,redirect:"manual"}; if(!["GET","HEAD"].includes(req.method)) init.body=req.body;
  const r=await fetch(t,init),out=new Headers(r.headers); out.set("cache-control","no-store");
  return new Response(r.body,{status:r.status,statusText:r.statusText,headers:out});
}

export class ShareGate{
  constructor(state){this.state=state}
  async fetch(req){
    const u=new URL(req.url);
    if(u.pathname==="/claim"&&req.method==="POST"){
      const session=crypto.randomUUID()+"."+crypto.randomUUID(), tab=crypto.randomUUID()+"."+crypto.randomUUID(), sessionHash=await sha(session), tabHash=await sha(tab), expiresAt=Date.now()+SHARE_SESSION_TTL_MS;
      const result=await this.state.storage.transaction(async tx=>{
        if(await tx.get("used")) return {ok:false};
        await tx.put("used",true); await tx.put("sessionHash",sessionHash); await tx.put("tabHash",tabHash); await tx.put("expiresAt",expiresAt); return {ok:true,session,tab};
      });
      return Response.json(result,{status:result.ok?200:410,headers:{"cache-control":"no-store"}});
    }
    if((u.pathname==="/check"||u.pathname==="/check-tab")&&req.method==="POST"){
      const s=req.headers.get("x-session")||"", sh=await this.state.storage.get("sessionHash"), ex=await this.state.storage.get("expiresAt");
      if(!s||!sh||!ex||Date.now()>Number(ex)||!eq(await sha(s),String(sh))) return new Response(null,{status:403});
      if(u.pathname==="/check-tab"){
        const t=req.headers.get("x-tab")||"", th=await this.state.storage.get("tabHash");
        if(!t||!th||!eq(await sha(t),String(th))) return new Response(null,{status:403});
      }
      return new Response(null,{status:204});
    }
    return new Response(null,{status:404});
  }
}

export default{
  async fetch(req,env){
    const u=new URL(req.url);
    if(u.pathname==="/health") return Response.json({ok:true,service:"ascend-terminal-edge"},{headers:{"cache-control":"no-store"}});
    if(!env||!env.SHARE_GATE) return legacy(req);

    if(u.pathname.startsWith("/owner/")){
      const t=decodeURIComponent(u.pathname.slice(7));
      if(!t||!eq(await sha(t),OWNER_TOKEN_HASH)) return locked(403,"ASCEND · OWNER LINK INVALID");
      return new Response(null,{status:302,headers:{location:"/?view=market","set-cookie":"ascend_owner="+encodeURIComponent(t)+"; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Strict","cache-control":"no-store","referrer-policy":"no-referrer"}});
    }
    if(u.pathname.startsWith("/guest/")) return locked(403,"ASCEND · OWNER ONLY");

    const own=await owner(req), gst=false;
    if(!own) return locked();
    if(gst&&u.pathname==="/"&&u.searchParams.get("view")!=="market") return Response.redirect(u.origin+"/?view=market&guest=1",302);
    if(u.pathname.startsWith("/api/")){
      if(gst && !(await guestTab(req,env))) return Response.json({ok:false,error:"guest_tab_closed"},{status:403,headers:{"cache-control":"no-store"}});
      return api(req,u,gst);
    }
    if(u.pathname==="/"||u.pathname==="/analysis"||u.pathname==="/index.html"){
      if(gst&&u.pathname!=="/") return locked(403,"ASCEND · GUEST READ ONLY");
      return frontend(gst);
    }
    if(gst) return locked(403,"ASCEND · GUEST READ ONLY");
    return legacy(req);
  }
};
