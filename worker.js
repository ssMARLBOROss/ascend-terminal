const UPSTREAM = "https://ascend-terminal-api-production.up.railway.app";
const FRONTEND = "https://raw.githubusercontent.com/ssMARLBOROss/ascend-terminal/main/index.html";

export default {
  async fetch(request) {
    const incoming = new URL(request.url);

    if (incoming.pathname === "/" || incoming.pathname === "/analysis" || incoming.pathname === "/index.html") {
      const page = await fetch(FRONTEND, { cf: { cacheTtl: 30, cacheEverything: true } });
      const headers = new Headers(page.headers);
      headers.set("content-type", "text/html; charset=utf-8");
      headers.set("cache-control", "no-store, max-age=0");
      return new Response(page.body, { status: page.status, headers });
    }

    const target = new URL(incoming.pathname + incoming.search, UPSTREAM);
    const headers = new Headers(request.headers);
    headers.set("host", target.host);
    headers.set("x-forwarded-host", incoming.host);
    headers.set("x-forwarded-proto", "https");

    const init = { method: request.method, headers, redirect: "manual" };
    if (!["GET", "HEAD"].includes(request.method)) init.body = request.body;

    const response = await fetch(target, init);
    const out = new Headers(response.headers);
    out.set("cache-control", "no-store");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: out,
    });
  },
};
