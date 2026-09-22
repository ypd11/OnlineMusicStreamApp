/**
 * Auralis Music — Cloudflare Worker proxy
 */
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};
const TARGETS = {
  itunes: "https://itunes.apple.com",
  lrclib: "https://lrclib.net/api",
  youtube: "https://www.googleapis.com/youtube/v3",
};
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
    if (url.pathname === "/" || url.pathname === "/health") {
      return new Response(JSON.stringify({ status: "ok" }), { headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
    }
    const parts = url.pathname.replace(/^\/+/, "").split("/");
    const service = parts[0];
    const endpoint = parts.slice(1).join("/");
    if (!TARGETS[service]) return new Response("Unknown service", { status: 400, headers: CORS_HEADERS });
    const searchParams = new URLSearchParams(url.search);
    if (service === "youtube" && env?.YOUTUBE_API_KEY && !searchParams.has("key")) searchParams.set("key", env.YOUTUBE_API_KEY);
    const targetUrl = `${TARGETS[service]}/${endpoint}${searchParams.toString() ? `?${searchParams}` : ""}`;
    try {
      const upstream = await fetch(targetUrl, { headers: { "User-Agent": "AuralisMusic/1.0" } });
      const body = await upstream.arrayBuffer();
      const headers = new Headers(upstream.headers);
      for (const [k,v] of Object.entries(CORS_HEADERS)) headers.set(k,v);
      return new Response(body, { status: upstream.status, headers });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 502, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
    }
  }
};
