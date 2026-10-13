import asyncio
import json
import math
import os
import pathlib
import shutil
import time
import urllib.parse
import urllib.request
from playwright.async_api import async_playwright

PUBLIC = "https://ascend-terminal.terna-boom2001.workers.dev/?view=market"
ROOT = pathlib.Path.cwd()
ART = ROOT / "ui-smoke-results"
ART.mkdir(exist_ok=True)

def probe_public():
    req=urllib.request.Request(PUBLIC,headers={"User-Agent":"Mozilla/5.0 ASCEND-UI-Smoke"})
    try:
        with urllib.request.urlopen(req,timeout=20) as res:
            raw=res.read(800000).decode("utf-8","replace")
            print("LIVE_HTTP", res.status)
            print("LIVE_FINAL_URL",res.url)
            print("LIVE_CONTENT_BYTES",len(raw))
            print("LIVE_TITLE_ASCEND", "<title>ASCEND Terminal</title>" in raw)
            print("LIVE_SESSION_TOGGLE", 'id="ascSessionHLToggle"' in raw)
            print("LIVE_PRIOR_TOGGLE", 'id="ascSessionHLPrevious"' in raw)
            print("LIVE_ENGINE", "root.ASCEND_SESSION_HL=Object.freeze" in raw)
            print("LIVE_AUTH_OR_CHALLENGE",any(x in raw.lower() for x in
                ("cloudflare access","sign in to","enter your email","authentication required")))
    except Exception as exc:
        print("LIVE_ACCESS_BLOCKED",type(exc).__name__,str(exc)[:180])

def make_candles(tf,limit,symbol):
    sec={"1m":60,"3m":180,"5m":300,"10m":600,"15m":900,
         "30m":1800,"1h":3600,"4h":14400,"1d":86400}.get(tf,300)
    now=int(time.time())
    last=(now//sec)*sec
    start=last-int(limit)*sec
    out=[]
    for i in range(limit+1):
        t=start+i*sec
        val=85000 + 140*math.sin(i*.12)+.45*i
        if symbol!="BTC_USDT":val=val/2000
        x=val + 14*math.cos(i*.42)*(1 if symbol=="BTC_USDT" else .0005)
        o=min(val,x)
        c=max(val,x) if i%2 else min(val,x)
        high=max(o,c)+max(.02,val*.0005)
        low=min(o,c)-max(.02,val*.0005)
        out.append(dict(time=t,open=o,high=high,low=low,close=c,volume=34+i%12))
    return out

def mock_payload(url):
    parsed=urllib.parse.urlsplit(url)
    params=urllib.parse.parse_qs(parsed.query)
    path=parsed.path
    if path.endswith("/klines"):
        sym=params.get("symbol",["BTC_USDT"])[0]
        tf=params.get("timeframe",["5m"])[0]
        limit=int(params.get("limit",["260"])[0])
        return {"symbol":sym,"timeframe":tf,
                "candles":make_candles(tf,limit,sym),"server_time":int(time.time())}
    if path.endswith("/ticker"):
        return {"symbol":params.get("symbol",["BTC_USDT"])[0],
                "last_price":85012.2,"high_24h":85200.0,"low_24h":84700.0,
                "change_24h":.7,"volume_24h":12345}
    if path.endswith("/breadth"):
        return {"available":100,"long":45,"short":30,"neutral":25,
                "source":"ascend-clean radar","running":True,"cycle":1}
    if path.endswith("/universe"): return {"symbols":["BTC_USDT","ETH_USDT","SOL_USDT"],"coins":[],"rows":[]}
    if path.endswith("/status"): return {"status":"ok"}
    if path.endswith("/news"):return {"rows":[],"items":[]}
    return {}

async def test_browser():
    async with async_playwright() as p:
        browser=await p.chromium.launch(channel="chrome",headless=True,args=["--no-sandbox"])
        page=await browser.new_page(viewport={"width":1440,"height":900},
            device_scale_factor=1,java_script_enabled=True)
        failures=[]
        page.on("pageerror",lambda err:failures.append("JS "+str(err)[:250]))
        async def mock(route):
            body=json.dumps(mock_payload(route.request.url))
            await route.fulfill(status=200,content_type="application/json",body=body)
        await page.route("**/api/v2/**",mock)
        await page.goto("http://127.0.0.1:8765/index.html?view=market",
                        wait_until="domcontentloaded",timeout=25000)
        await page.wait_for_timeout(6500)
        # New compact layer manager: reveal the same session/V2 panels without
        # depending on the legacy, intentionally hidden toolbar buttons.
        await page.locator('#ascSmcLayersBtn').click()
        await page.locator('#ascSmcSwitch_sessions').click()
        await page.locator('#ascSmcSwitch_confirmation').click()
        result=await page.evaluate("""() => ({
          loaded:document.readyState,
          pageTitle:document.title,
          chartReady:typeof state !=='undefined'?state.chartReady:false,
          selectedSymbol:typeof state !=='undefined'?state.symbol:null,
          sessionUI:typeof window.ASCEND_SESSION_HL,
          buttons:['ascSmcLayersBtn','ascSmcSwitch_sessions','ascSmcSwitch_previousSessions','ascendLayoutFocus']
            .map(id=>{let x=document.getElementById(id),r=x?.getBoundingClientRect();
              return {id,exists:!!x,text:x?.textContent.trim(),width:r?.width,
                height:r?.height,visible:!!r&&r.width>0&&r.height>0}}),
          items:[...document.querySelectorAll('#ascSessionHLRows .asc-session-hl-item')]
            .map(e=>e.textContent.trim().slice(0,160)),
          panelVisible:(()=>{const e=document.getElementById('ascSessionHLPanel');
            return !!e&&!e.hidden&&e.getBoundingClientRect().height>0})(),
          charts:[...document.querySelectorAll('#chart canvas')].length,
          canvas:!!document.querySelector('#liquidityZoneOverlay'),
          errorStatus:document.querySelector('#ascSessionHLStatus')?.textContent,
          appView:document.body.dataset.view,
          widget:typeof latestSessionHL==='undefined'?null:
            latestSessionHL?.rows?.map(x=>({s:x.name,cycle:x.cycle,status:x.status,
              high:x.high,low:x.low,timeframe:x.timeframe}))
        })""")
        print("LOCAL_DESKTOP",json.dumps(result,ensure_ascii=False)[:6000])
        print("PAGE_ERRORS",json.dumps(failures,ensure_ascii=False)[:3000])
        v2=await page.evaluate("""() => ({
          engine:typeof window.ASCEND_CONFIRMATION_V2,
          report:typeof latestConfirmationV2==='object'&&latestConfirmationV2!==null?
            {status:latestConfirmationV2.status,side:latestConfirmationV2.side,
             ready:latestConfirmationV2.ready,
             steps:latestConfirmationV2.steps.map(x=>({name:x.name,status:x.status}))}:null,
          panel:(()=>{const e=document.getElementById('ascConfirmationV2Panel'),
            r=e?.getBoundingClientRect();return !!r&&r.width>0&&r.height>0})(),
          title:document.querySelector('#ascConfirmV2Status')?.textContent,
          core:typeof entryModel==='function'?entryModel().status:null,
          global:document.querySelector('#v11GlobalSetup')?.textContent,
          stepCount:document.querySelectorAll('#ascConfirmV2Steps .asc-confirm-v2-step').length
        })""")
        print("CONFIRMATION_V2",json.dumps(v2,ensure_ascii=False))
        assert v2['engine']=='object' and v2['panel'] and v2['report']
        assert v2['stepCount']==7
        assert not v2['report']['ready'] and v2['core']!='ENTRY READY'
        assert v2['global']!='ENTRY READY'
        # The manual SHADOW control must be fail-closed when V2 is incomplete.
        denial=await page.evaluate("""async () => {
          let alertText='',posts=0;
          const savedAlert=window.alert,savedAdmin=window.adminFetch;
          const before=state.paperTrades.length;
          window.alert=message=>{alertText=String(message)};
          window.adminFetch=async()=>{posts++;throw Error('Unexpected server trade POST')};
          try{await openManualPaper('LONG')}finally{
            window.alert=savedAlert;window.adminFetch=savedAdmin;
          }
          return {alertText,posts,before,after:state.paperTrades.length};
        }""")
        print('V2_MANUAL_DENIAL',json.dumps(denial,ensure_ascii=False))
        assert denial['posts']==0 and denial['before']==denial['after']
        assert 'запрещён' in denial['alertText']
        await page.locator('#ascConfirmV2Toggle').click()
        assert await page.evaluate("document.getElementById('ascConfirmV2Steps').hidden")
        await page.locator('#ascConfirmV2Toggle').click()
        assert not await page.evaluate("document.getElementById('ascConfirmV2Steps').hidden")

        diagnostics=await page.evaluate("""() => ({
          health:document.querySelector('#ascTFHealth')?.innerText,
          quality:typeof ASCEND_TF_QA,
          ten:state.tf['10m']?.length||0,
          thirty:state.tf['30m']?.length||0,
          tenAligned:(state.tf['10m']||[]).every(b=>b.time%600===0),
          thirtyAligned:(state.tf['30m']||[]).every(b=>b.time%1800===0),
          tenClosing:(state.tf['10m']||[]).every(b=>b.time+600<=Date.now()/1000),
          latestOne:state.tf['1m']?.at(-1)?.time,
          evidenceFrames:latestStructureEvidence?.frames?.['10m']?.count||0
        })""")
        print("DATA_DIAGNOSTICS",json.dumps(diagnostics,ensure_ascii=False))
        assert diagnostics['quality']=='object'
        assert 'DATA HEALTH' in diagnostics['health']
        assert 'LIVE' in diagnostics['health']
        assert diagnostics['ten']>10 and diagnostics['thirty']>10
        assert diagnostics['tenAligned'] and diagnostics['thirtyAligned'] and diagnostics['tenClosing']
        assert diagnostics['evidenceFrames']>0

        await page.screenshot(path=str(ART/"session-hl-desktop.png"),full_page=True,
            animations="disabled",timeout=15000)
        if not all(x['visible'] for x in result["buttons"]):
            raise AssertionError("Layer-manager/session/focus controls not visible on desktop")
        if not result['panelVisible']:
            raise AssertionError("Session panel hidden by CSS")
        if not result['sessionUI']=="object":
            raise AssertionError("Engine not loaded")
        if not result["chartReady"]:
            raise AssertionError("Lightweight Charts was not initialized")
        if len(result["items"])<4:
            raise AssertionError("Four session cards not rendered")

        await page.locator('#ascSmcSwitch_previousSessions').click(timeout=5000)
        after=await page.evaluate("""() => ({
            count:document.querySelectorAll('#ascSessionHLRows .asc-session-hl-item').length,
            prior:document.querySelectorAll('#ascSessionHLRows .asc-session-hl-item.previous').length,
            text:document.querySelector('#ascSessionHLPrevious').textContent.trim()
        })""")
        print("PRIOR_CLICK",json.dumps(after,ensure_ascii=False))
        assert after['prior']>=4 and after['count']>=8,"Cannot reveal preceding sessions"
        await page.locator('#ascSmcSwitch_sessions').click(timeout=5000)
        hidden=await page.evaluate("""() => ({
          panel:document.querySelector('#ascSessionHLPanel').hidden,
          toggle:document.querySelector('#ascSessionHLToggle').textContent.trim()
        })""")
        print("TOGGLE_OFF",json.dumps(hidden,ensure_ascii=False))
        assert hidden['panel'] is True
        await page.locator('#ascSmcSwitch_sessions').click(timeout=5000)
        await page.locator('#ascendLayoutFocus').click(timeout=5000)
        focus=await page.evaluate("""() => ({
          active:document.body.classList.contains('asc-layout-focus'),
          chartWidth:Math.round(document.querySelector('#chartShell').getBoundingClientRect().width),
          windowWidth:innerWidth
        })""")
        print("FOCUS",json.dumps(focus,ensure_ascii=False))
        assert focus['active'] and focus['chartWidth']>focus['windowWidth']*.7
        await page.screenshot(path=str(ART/"session-hl-focus.png"),animations="disabled")
        await page.keyboard.press("Escape")
        assert await page.evaluate("!document.body.classList.contains('asc-layout-focus')")

        # Coin change must remove old BTC overlays, recompute 10m/30m and
        # never display stale previous-symbol High/Low.
        await page.evaluate("chooseSymbol('ETH_USDT')")
        await page.wait_for_timeout(4200)
        changed=await page.evaluate("""() => ({
          symbol:state.symbol,
          title:document.querySelector('#chartTitle')?.textContent,
          chartReady:state.chartReady,
          high:latestSessionHL?.rows?.find(x=>x.cycle==='latest'&&x.status!=='NO DATA')?.high,
          data:document.querySelector('#ascTFHealth')?.innerText,
          tenAligned:(state.tf['10m']||[]).every(b=>b.time%600===0)
        })""")
        print("SYMBOL_CHANGE",json.dumps(changed,ensure_ascii=False))
        newv2=await page.evaluate("""() => ({
           symbol:latestConfirmationV2?.symbol,
           ready:latestConfirmationV2?.ready,
           steps:document.querySelectorAll('#ascConfirmV2Steps .asc-confirm-v2-step').length,
           core:entryModel().status
        })""")
        print("V2_SYMBOL_CHANGE",json.dumps(newv2,ensure_ascii=False))
        assert newv2['symbol']=='ETH_USDT'
        assert newv2['ready'] is False
        assert newv2['steps']==7
        assert newv2['core']!='ENTRY READY'

        assert changed['symbol']=='ETH_USDT'
        assert 'ETH' in changed['title']
        assert changed['high'] is not None and changed['high']<1000
        assert 'LIVE' in changed['data'] and changed['tenAligned']
        await page.set_viewport_size({"width":390,"height":844})
        await page.wait_for_timeout(1000)
        mobile=await page.evaluate("""() => ({
           button: (()=>{let r=document.querySelector('#ascSmcLayersBtn').getBoundingClientRect();
             return {width:r.width,height:r.height,left:r.left,right:r.right}})(),
           scrollerWidth:document.documentElement.scrollWidth,
           width:innerWidth,
           itemCount:document.querySelectorAll('#ascSessionHLRows .asc-session-hl-item').length
        })""")
        print("MOBILE",json.dumps(mobile,ensure_ascii=False))
        await page.screenshot(path=str(ART/"session-hl-mobile.png"),full_page=True,
            animations="disabled",timeout=15000)
        print("PAGE_ERRORS_POST",json.dumps(failures[:20],ensure_ascii=False))
        await browser.close()

if __name__=="__main__":
    probe_public()
    asyncio.run(test_browser())
