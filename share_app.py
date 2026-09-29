from __future__ import annotations

import hashlib
import hmac
from pathlib import Path
from urllib.parse import urlencode

import httpx
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, RedirectResponse, Response

app = FastAPI(title="ASCEND Terminal Share", docs_url=None, redoc_url=None, openapi_url=None)

UPSTREAM = "https://ascend-terminal-api-production.up.railway.app"
INDEX_PATH = Path(__file__).with_name("index.html")
COOKIE_NAME = "ascend_share"
MULTI_SHARE_TOKEN_HASH = "d328e25505cd4d511c234adfb1143e6339fe7491fec35cd7cc7306b4e376fbbc"

GUEST_API = {
    "/api/v2/symbols",
    "/api/v2/ticker",
    "/api/v2/klines",
    "/api/v2/volume-profile",
    "/api/v2/breadth",
    "/api/v2/radar-candidates",
    "/api/v2/bybit-symbols",
    "/api/v2/session-radar",
    "/api/v2/news",
    "/api/v2/history/transitions",
}

GUEST_INJECT = r"""
<style>
html,body{user-select:none;-webkit-user-select:none}
.tradebox,#paperStrip,#shadowNotebook,#journal,#usersPanel,
.nav a:not([data-view-link="market"]),
.mobile-nav a:not([data-view-link="market"]){display:none!important}
a[href^="http"]{pointer-events:none!important}
@media print{body{display:none!important}}
body:before{
  content:"ASCEND · SHARED READ ONLY";
  position:fixed;right:10px;bottom:10px;z-index:99999;
  padding:7px 10px;border:1px solid #48d6ff66;border-radius:8px;
  background:#04111be8;color:#8fe9ff;font:800 10px system-ui;pointer-events:none
}
</style>
<script>
document.addEventListener("DOMContentLoaded",()=>{
  document.body.dataset.view="market";
  document.querySelectorAll("[data-view-link]").forEach(a=>{
    if(a.dataset.viewLink!=="market") a.remove();
  });
  ["sellBtn","buyBtn","paperCloseBtn","adminLogin","adminRefresh"].forEach(id=>{
    const e=document.getElementById(id); if(e)e.style.display="none";
  });
  document.querySelectorAll('a[href^="http"]').forEach(a=>a.removeAttribute("href"));
},{once:true});
["contextmenu","copy","cut","dragstart"].forEach(n=>document.addEventListener(n,e=>e.preventDefault()));
</script>
"""


def _sha256(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _valid_token(value: str | None) -> bool:
    if not value:
        return False
    return hmac.compare_digest(_sha256(value), MULTI_SHARE_TOKEN_HASH)


def _locked(status_code: int = 401, title: str = "ASCEND · PRIVATE") -> HTMLResponse:
    html = f"""<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow,noarchive">
<title>{title}</title>
<style>
html,body{{margin:0;min-height:100%;background:#020711;color:#eef5ff;font-family:system-ui,-apple-system,Segoe UI,Arial,sans-serif}}
main{{min-height:100vh;display:grid;place-items:center;padding:24px}}
.b{{max-width:540px;border:1px solid #1b2e45;border-radius:14px;background:#07101c;padding:24px;text-align:center}}
.t{{font-weight:900;letter-spacing:.14em;color:#59e7ff}}
.m{{margin-top:12px;color:#8493aa;line-height:1.5}}
</style>
</head>
<body><main><div class="b"><div class="t">{title}</div><div class="m">Доступ закрыт. Используйте постоянную ссылку, выданную владельцем.</div></div></main></body>
</html>"""
    return HTMLResponse(
        html,
        status_code=status_code,
        headers={
            "Cache-Control": "no-store",
            "X-Robots-Tag": "noindex, nofollow, noarchive",
            "Referrer-Policy": "no-referrer",
        },
    )


@app.get("/healthz")
async def healthz():
    return {"ok": True, "service": "ascend-terminal-share"}


@app.get("/guest/{token:path}")
async def guest_login(token: str):
    if not _valid_token(token):
        return _locked(403, "ASCEND · GUEST LINK INVALID")
    response = RedirectResponse(url="/?view=market&guest=1", status_code=302)
    response.set_cookie(
        COOKIE_NAME,
        token,
        max_age=31536000,
        httponly=True,
        secure=True,
        samesite="lax",
        path="/",
    )
    response.headers["Cache-Control"] = "no-store"
    response.headers["Referrer-Policy"] = "no-referrer"
    return response


@app.get("/")
async def terminal(request: Request):
    if not _valid_token(request.cookies.get(COOKIE_NAME)):
        return _locked()
    html = INDEX_PATH.read_text(encoding="utf-8")
    html = html.replace("</head>", GUEST_INJECT + "\n</head>", 1)
    return HTMLResponse(
        html,
        headers={
            "Cache-Control": "no-store, max-age=0",
            "Pragma": "no-cache",
            "Expires": "0",
            "X-Robots-Tag": "noindex, nofollow, noarchive",
            "Referrer-Policy": "no-referrer",
            "Permissions-Policy": "camera=(), microphone=(), geolocation=(), clipboard-read=(), clipboard-write=()",
        },
    )


@app.get("/analysis")
async def analysis(request: Request):
    if not _valid_token(request.cookies.get(COOKIE_NAME)):
        return _locked()
    return _locked(403, "ASCEND · GUEST READ ONLY")


@app.api_route(
    "/api/v2/{subpath:path}",
    methods=["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
)
async def proxy_v2(subpath: str, request: Request):
    if not _valid_token(request.cookies.get(COOKIE_NAME)):
        return Response(status_code=401, headers={"Cache-Control": "no-store"})

    path = "/api/v2/" + subpath
    if request.method not in {"GET", "HEAD"} or path not in GUEST_API:
        return Response(
            content='{"ok":false,"error":"guest_read_only"}',
            status_code=403,
            media_type="application/json",
            headers={"Cache-Control": "no-store"},
        )

    query = request.url.query
    target = UPSTREAM + path + (("?" + query) if query else "")
    headers = {
        "Accept": request.headers.get("accept", "application/json"),
        "User-Agent": "ASCEND-Shared/1.0",
    }

    async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
        upstream = await client.request(request.method, target, headers=headers)

    out_headers = {
        "Cache-Control": "no-store",
        "X-ASCEND-Upstream-Status": str(upstream.status_code),
    }
    content_type = upstream.headers.get("content-type")
    if content_type:
        out_headers["Content-Type"] = content_type

    return Response(
        content=upstream.content if request.method != "HEAD" else b"",
        status_code=upstream.status_code,
        headers=out_headers,
    )
