const UPSTREAM = "https://ascend-terminal-api-production.up.railway.app";

export default {
  async fetch(request) {
    const incoming = new URL(request.url);
    const target = new URL(incoming.pathname + incoming.search, UPSTREAM);

    const headers = new Headers(request.headers);
    headers.set("host", target.host);
    headers.set("x-forwarded-host", incoming.host);
    headers.set("x-forwarded-proto", "https");

    const init = {
      method: request.method,
      headers,
      redirect: "manual",
    };

    if (!["GET", "HEAD"].includes(request.method)) {
      init.body = request.body;
    }

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
