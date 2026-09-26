from __future__ import annotations
import os
import httpx
from fastapi import Request, HTTPException
from fastapi.responses import Response, JSONResponse

CORE = (os.getenv("ASCEND_CORE_URL") or "https://ascend-clean-production.up.railway.app").rstrip("/")

async def _proxy(request: Request, path: str):
    auth = request.headers.get("authorization") or ""
    headers = {"accept":"application/json"}
    if auth:
        headers["authorization"] = auth
    body = await request.body()
    async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
        r = await client.request(request.method, CORE + path, params=request.query_params, headers=headers, content=body or None)
    out = {"content-type": r.headers.get("content-type","application/json"), "cache-control":"no-store"}
    return Response(content=r.content, status_code=r.status_code, headers=out)

def install(app):
    @app.get("/api/v2/admin/users")
    async def users(request: Request):
        return await _proxy(request, "/api/platform/admin/users")

    @app.post("/api/v2/admin/users/{user_id}/access")
    async def access(user_id: int, request: Request):
        return await _proxy(request, f"/api/platform/admin/users/{user_id}/access")

    @app.post("/api/v2/admin/users/{user_id}/preferences")
    async def prefs(user_id: int, request: Request):
        return await _proxy(request, f"/api/platform/admin/users/{user_id}/preferences")

    @app.get("/api/v2/admin/trades")
    async def trades(request: Request):
        return await _proxy(request, "/api/platform/admin/trades")

    @app.post("/api/v2/admin/trades")
    async def create_trade(request: Request):
        return await _proxy(request, "/api/platform/admin/trades")

    @app.post("/api/v2/admin/trades/{trade_id}/close")
    async def close_trade(trade_id: str, request: Request):
        return await _proxy(request, f"/api/platform/admin/trades/{trade_id}/close")

    @app.get("/api/v2/admin/status")
    async def status(request: Request):
        return await _proxy(request, "/api/platform/admin/status")
