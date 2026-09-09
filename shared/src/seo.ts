// Canonical-URL, redirect and 410 rules for findlocal.community. These encode
// years of Search Console cleanup — change them deliberately.
import { CITIES } from './cities.js';

export const SITE = 'https://findlocal.community';

/** Impact.com site verification meta (`<meta name="impact-site-verification" value=...>`). */
export const IMPACT_SITE_VERIFICATION = '69cc4690-1595-47a6-9724-1c86ad3258b6';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(s: unknown): s is string {
  return typeof s === 'string' && UUID.test(s);
}

/** Absolute canonical URL. `query` is a canonicalQuery() string (no '?'); '' is dropped. */
export function canonicalUrl(path: string, query?: string): string {
  let p = path.startsWith('/') ? path : `/${path}`;
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  return `${SITE}${p}${query ? `?${query}` : ''}`;
}

const CITY_SLUGS = new Set(CITIES.map((c) => c.slug));

/**
 * 301 target for a request pathname, or null when the path is already canonical:
 * trailing slash stripped; uppercase uuid segments lowercased; /<city-slug> ->
 * /city/<slug>; /map -> /?view=map; /filters -> /; /sitemap, /sitemap-blog.xml (old
 * sitemap-index children) -> /sitemap.xml. /sitemaps/<name>.xml is a real route.
 */
export function redirectTargetFor(pathname: string): string | null {
  let p = pathname;
  if (p.length > 1 && p.endsWith('/')) p = p.replace(/\/+$/, '') || '/';
  p = p
    .split('/')
    .map((seg) => (isUuid(seg) ? seg.toLowerCase() : seg))
    .join('/');
  const bare = /^\/([a-z0-9-]+)$/.exec(p);
  if (bare && CITY_SLUGS.has(bare[1] as string)) p = `/city/${bare[1]}`;
  if (p === '/map') p = '/?view=map';
  else if (p === '/filters') p = '/';
  else if (p === '/sitemap' || p === '/sitemap-blog.xml' || p === '/sitemaps') p = '/sitemap.xml';
  return p === pathname ? null : p;
}

/** Legacy app routes that no longer exist: answer 410 + noindex so crawlers drop them. */
export const GONE_PATHS: RegExp[] = [
  /^\/friends$/,
  /^\/create$/,
  /^\/home$/,
  /^\/profile$/,
  /^\/support$/,
  /^\/discover-creators$/,
  /^\/followed-venues$/,
  /^\/following-activity$/,
  /^\/followers$/,
  /^\/user(\/.*)?$/,
  /^\/auth(\/.*)?$/,
  /^\/invite(\/.*)?$/,
];

export function isGonePath(pathname: string): boolean {
  const p = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return GONE_PATHS.some((re) => re.test(p));
}
