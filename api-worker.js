const ALLOWED_ORIGINS = [
  "https://music-streaming-site.pages.dev",
  "https://auralis-music.pages.dev",
  "http://localhost:8787",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];

const ROUTES = {
  "/itunes/search": "https://itunes.apple.com/search",
  "/itunes/lookup": "https://itunes.apple.com/lookup",
  "/lrclib/get": "https://lrclib.net/api/get",
  "/lrclib/search": "https://lrclib.net/api/search",
};

const RATE_LIMIT = new Map();
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_REQUESTS = 60;
const MAX_TRACKED_IPS = 5000;
const UPSTREAM_CACHE_TTL = 300;

function originOf(value) {
  if (!value) return "";
  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
}

function isAllowedOrigin(origin) {
  if (!origin) return true;
  const normalized = originOf(origin);
  return ALLOWED_ORIGINS.some((allowed) => normalized === originOf(allowed));
}

function corsHeaders(origin) {
  const headers = {
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (origin) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function checkRateLimit(ip) {
  const now = Date.now();
  if (RATE_LIMIT.size > MAX_TRACKED_IPS) {
    for (const [key, record] of RATE_LIMIT) {
      if (now - record.start > RATE_WINDOW_MS) RATE_LIMIT.delete(key);
    }
  }
  const record = RATE_LIMIT.get(ip);
  if (!record || now - record.start > RATE_WINDOW_MS) {
    RATE_LIMIT.set(ip, { start: now, count: 1 });
    return true;
  }
  record.count++;
  return record.count <= RATE_MAX_REQUESTS;
}

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get("Origin") || "";
    if (!isAllowedOrigin(origin)) {
      return json({ error: "Origin not allowed" }, 403);
    }

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (request.method !== "GET") {
      return json({ error: "Method not allowed" }, 405, origin);
    }

    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return json({ ok: true }, 200, origin);
    }

    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    if (!checkRateLimit(ip)) {
      return json({ error: "Rate limit exceeded. Try again later." }, 429, origin);
    }

    const upstreamBase = ROUTES[url.pathname];
    if (!upstreamBase) {
      return json({
        error: "Unsupported proxy path",
        path: url.pathname,
        supportedPaths: Object.keys(ROUTES),
      }, 404, origin);
    }

    const cacheKey = new Request(
      `https://auralis-cache.local/${encodeURIComponent(origin || "direct")}${url.pathname}${url.search}`,
      { method: "GET" }
    );
    const cached = await caches.default.match(cacheKey);
    if (cached) return cached;

    try {
      const upstream = await fetch(`${upstreamBase}${url.search}`, {
        headers: {
          Accept: "application/json, text/javascript, */*;q=0.8",
          "User-Agent": "AuralisMusic/1.0 (https://music-streaming-site.pages.dev)",
        },
        cf: {
          cacheEverything: true,
          cacheTtl: UPSTREAM_CACHE_TTL,
        },
      });
      const body = await upstream.text();

      const headers = {
        ...corsHeaders(origin),
        "Content-Type": upstream.headers.get("Content-Type") || "application/json; charset=utf-8",
        "Cache-Control": upstream.ok ? `public, max-age=${UPSTREAM_CACHE_TTL}` : "no-store",
        "X-Upstream-Status": String(upstream.status),
      };
      const response = new Response(body, { status: upstream.status, headers });
      if (upstream.ok && ctx) {
        ctx.waitUntil(caches.default.put(cacheKey, response.clone()));
      }
      return response;
    } catch (error) {
      return json({
        error: "Proxy request failed",
        message: error.message,
      }, 502, origin);
    }
  },
};

function json(data, status = 200, origin = "") {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders(origin),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
