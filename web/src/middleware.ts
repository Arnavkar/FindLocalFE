import { defineMiddleware } from 'astro:middleware';
import { getCity, isGonePath, redirectTargetFor, type City } from '@findlocal/shared';
import { browserCacheControl, cachePolicyFor, edgeCacheControl } from './lib/cacheHeaders.js';
import { CITY_COOKIE, DEFAULT_CITY_NAME, cacheKeyFor, readCookie } from './lib/cacheKey.js';

const GONE_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Gone | Find Local</title>
<meta name="robots" content="noindex"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{font-family:system-ui,sans-serif;max-width:40rem;margin:4rem auto;padding:0 1.5rem;color:#111827}a{color:#006565}</style></head>
<body><h1>This page is gone</h1><p>Find Local no longer has accounts, profiles or social features. <a href="/">Browse upcoming local events</a> instead.</p></body></html>`;

function resolveCity(cookieHeader: string | null): { city: City; raw: string | null } {
  const raw = readCookie(cookieHeader, CITY_COOKIE);
  const city = getCity(raw) ?? (getCity(DEFAULT_CITY_NAME) as City);
  return { city, raw: getCity(raw) ? city.name : null };
}

// Static assets (public/, prerendered pages, /_astro) are served by Workers
// assets before this runs, so only SSR routes pass through here.
export const onRequest = defineMiddleware(async (context, next) => {
  const { url, request } = context;

  // --- 301 table: trailing slash, uppercase uuid, /boston, /map, /filters, /sitemap(s).
  // Route prefixes are case-insensitive too (/EVENT/<id> -> /event/<id>): the
  // old SPA answered any casing, so those variants exist in the wild.
  const lowered = url.pathname.replace(/^\/(event|venue|city)(?=\/)/i, (m) => m.toLowerCase());
  // www is served by the same Worker (second custom domain) and canonicalises to the apex.
  if (url.hostname === 'www.findlocal.community') {
    return Response.redirect(`https://findlocal.community${url.pathname}${url.search}`, 301);
  }
  const target = redirectTargetFor(lowered) ?? (lowered !== url.pathname ? lowered : null);
  if (target) {
    const dest = target.includes('?') ? target + (url.search ? `&${url.search.slice(1)}` : '') : target + url.search;
    return Response.redirect(new URL(dest, url.origin).toString(), 301);
  }

  // --- 410 table: legacy account/social routes. Not blocked in robots.txt on
  // purpose — crawlers must fetch these to drop them from the index.
  if (isGonePath(url.pathname)) {
    return new Response(GONE_HTML, {
      status: 410,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Robots-Tag': 'noindex', 'Cache-Control': 'public, max-age=3600' },
    });
  }

  const { city, raw: cookieCity } = resolveCity(request.headers.get('cookie'));
  context.locals.city = city;

  const policy = cachePolicyFor(url.pathname);
  // `s-maxage` alone does not populate Cloudflare's cache for Worker responses —
  // the Worker stores and looks the response up itself via the Cache API.
  // Skipped under `astro dev` (platformProxy provides a persistent miniflare
  // cache that would otherwise serve stale pages while editing).
  const cache = typeof caches !== 'undefined' ? (caches as unknown as { default?: Cache }).default : undefined;
  const cacheable = !!cache && !import.meta.env.DEV && request.method === 'GET' && policy.edge > 0;
  const keyReq = cacheable ? new Request(cacheKeyFor(url, cookieCity), { method: 'GET' }) : null;

  if (cacheable && keyReq) {
    const hit = await cache!.match(keyReq);
    if (hit) {
      const res = new Response(hit.body, hit);
      res.headers.set('Cache-Control', browserCacheControl(policy));
      res.headers.set('X-Edge-Cache', 'HIT');
      return res;
    }
  }

  const response = await next();

  // Machine feeds shouldn't compete with the HTML pages in search results;
  // no _headers file can do this because it doesn't apply to SSR responses.
  if (url.pathname.startsWith('/api/')) response.headers.set('X-Robots-Tag', 'noindex');
  if (url.pathname === '/saved') response.headers.set('X-Robots-Tag', 'noindex');
  // Embeddable widgets: framable from any origin (the only routes that are), never indexed.
  if (url.pathname.startsWith('/embed/')) {
    response.headers.set('X-Robots-Tag', 'noindex');
    response.headers.set('Content-Security-Policy', 'frame-ancestors *');
    response.headers.delete('X-Frame-Options');
  }

  if (cacheable && keyReq && response.ok) {
    const stored = new Response(response.clone().body, response);
    stored.headers.set('Cache-Control', edgeCacheControl(policy));
    stored.headers.delete('Set-Cookie');
    const store = cache!.put(keyReq, stored).catch(() => {});
    const ctx = context.locals.cfContext;
    if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(store);
    response.headers.set('X-Edge-Cache', 'MISS');
  } else if (request.method === 'GET') {
    response.headers.set('X-Edge-Cache', 'BYPASS');
  }
  if (!response.headers.has('Cache-Control')) {
    response.headers.set('Cache-Control', response.ok ? browserCacheControl(policy) : 'private, no-store');
  }
  return response;
});
