// Edge-cache key for SSR responses: origin + path + canonicalised known
// filter params (sorted, defaults dropped, unknown stripped) — plus `view=map`
// where a map is offered, and `_city=<fl_city cookie>` on the two routes whose
// content depends on the cookie (/ and /venues). Pure so it can be unit-tested.
import { canonicalQuery } from '@findlocal/shared';

export const CITY_COOKIE = 'fl_city';
export const DEFAULT_CITY_NAME = 'Boston';

/** Routes whose HTML depends on the fl_city cookie. */
export function isCityCookieRoute(pathname: string): boolean {
  return pathname === '/' || pathname === '/venues';
}

/** Routes keyed on their whole sorted query (they take params outside the filter contract). */
export function isFullQueryRoute(pathname: string): boolean {
  return pathname.startsWith('/api/') || pathname.startsWith('/embed/');
}

/** Routes that offer `?view=map` (the map variant must not collide with the list). */
export function hasMapView(pathname: string): boolean {
  return pathname === '/' || pathname.startsWith('/city/');
}

/** Read one cookie value (URL-decoded) from a Cookie header; null when absent. */
export function readCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(eq + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

/** Canonical query for a request URL, with the extra keys this site caches on. */
export function cacheQueryFor(url: URL, cookieCity: string | null): string {
  if (isFullQueryRoute(url.pathname)) {
    // API and embed routes take extra params (city, ids, venue, limit, view,
    // theme, region group): key on the whole sorted query so distinct requests
    // never share a cache entry.
    const all = new URLSearchParams(url.searchParams);
    all.sort();
    return all.toString();
  }
  const parts: string[] = [];
  const canon = canonicalQuery(url.searchParams);
  if (canon) parts.push(canon);
  if (hasMapView(url.pathname) && url.searchParams.get('view') === 'map') parts.push('view=map');
  if (isCityCookieRoute(url.pathname)) parts.push(`_city=${encodeURIComponent(cookieCity ?? DEFAULT_CITY_NAME)}`);
  return parts.join('&');
}

/** Absolute cache-key URL for a request (origin + pathname + cacheQueryFor). */
export function cacheKeyFor(url: URL, cookieCity: string | null): string {
  const q = cacheQueryFor(url, cookieCity);
  return `${url.origin}${url.pathname}${q ? `?${q}` : ''}`;
}
