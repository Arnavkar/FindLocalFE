import { describe, expect, it } from 'vitest';
import { cacheKeyFor, cacheQueryFor, hasMapView, isCityCookieRoute, isFullQueryRoute, readCookie } from '../src/lib/cacheKey.js';
import { browserCacheControl, cachePolicyFor, edgeCacheControl } from '../src/lib/cacheHeaders.js';

const u = (s: string) => new URL(s, 'https://findlocal.community');

describe('readCookie', () => {
  it('reads and URL-decodes one cookie', () => {
    expect(readCookie('a=1; fl_city=New%20York; b=2', 'fl_city')).toBe('New York');
    expect(readCookie('fl_city=Boston', 'fl_city')).toBe('Boston');
    expect(readCookie(null, 'fl_city')).toBeNull();
    expect(readCookie('other=x', 'fl_city')).toBeNull();
    expect(readCookie('fl_city=%E0%A4%A', 'fl_city')).toBeNull();
  });
});

describe('cacheQueryFor', () => {
  it('canonicalises known params, drops unknown ones and defaults', () => {
    expect(cacheQueryFor(u('/city/boston?utm=1&when=anytime&cat=music,nope&page=1'), null)).toBe('cat=music');
    expect(cacheQueryFor(u('/city/boston?when=weekend&cat=comedy,music&tod=evening'), null)).toBe('cat=music%2Ccomedy&tod=evening&when=weekend');
  });
  it('keys / and /venues on the fl_city cookie (default Boston)', () => {
    expect(cacheQueryFor(u('/'), null)).toBe('_city=Boston');
    expect(cacheQueryFor(u('/'), 'New York')).toBe('_city=New%20York');
    expect(cacheQueryFor(u('/venues'), 'Denver')).toBe('_city=Denver');
    expect(cacheQueryFor(u('/city/boston'), 'Denver')).toBe('');
    expect(cacheQueryFor(u('/event/abc'), 'Denver')).toBe('');
  });
  it('keeps view=map distinct from the list view where a map exists', () => {
    expect(cacheQueryFor(u('/?view=map'), null)).toBe('view=map&_city=Boston');
    expect(cacheQueryFor(u('/city/boston?view=map&when=today'), null)).toBe('when=today&view=map');
    expect(cacheQueryFor(u('/venues?view=map'), null)).toBe('_city=Boston');
    expect(hasMapView('/city/austin')).toBe(true);
    expect(hasMapView('/venues')).toBe(false);
    expect(isCityCookieRoute('/venues')).toBe(true);
  });
  it('keys embed routes on the whole sorted query and never on the cookie', () => {
    expect(cacheQueryFor(u('/embed/events?theme=dark&region=new-england&view=map&cat=literary'), 'Denver')).toBe('cat=literary&region=new-england&theme=dark&view=map');
    expect(cacheQueryFor(u('/embed/events?city=boston&limit=50'), null)).toBe('city=boston&limit=50');
    expect(isFullQueryRoute('/embed/events')).toBe(true);
    expect(isFullQueryRoute('/event/abc')).toBe(false);
    expect(cachePolicyFor('/embed/events').edge).toBe(600);
    // UTM params from widget links do not fragment the event-page cache.
    expect(cacheQueryFor(u('/event/abc?utm_source=widget&utm_medium=embed&utm_campaign=x'), null)).toBe('');
  });
  it('keys API routes on the whole sorted query', () => {
    expect(cacheQueryFor(u('/api/events?limit=2&city=Boston'), 'X')).toBe('city=Boston&limit=2');
    expect(cacheQueryFor(u('/api/events?ids=a,b'), null)).toBe('ids=a%2Cb');
    expect(cacheQueryFor(u('/api/venues?city=Denver'), null)).toBe('city=Denver');
  });
  it('builds an absolute key URL', () => {
    expect(cacheKeyFor(u('/city/boston/?when=today&junk=1'), 'X')).toBe('https://findlocal.community/city/boston/?when=today');
    expect(cacheKeyFor(u('/event/x'), null)).toBe('https://findlocal.community/event/x');
  });
});

describe('cache policy', () => {
  it('uses the TTLs from the plan and never caches /saved', () => {
    expect(cachePolicyFor('/').edge).toBe(600);
    expect(cachePolicyFor('/city/boston').edge).toBe(600);
    expect(cachePolicyFor('/event/x').edge).toBe(3600);
    expect(cachePolicyFor('/venue/x').edge).toBe(3600);
    expect(cachePolicyFor('/sitemap.xml').edge).toBe(86400);
    expect(cachePolicyFor('/sitemaps/events-3.xml').edge).toBe(86400);
    expect(cachePolicyFor('/api/events').edge).toBe(300);
    expect(cachePolicyFor('/saved').edge).toBe(0);
  });
  it('makes per-city pages uncacheable in browsers but cacheable at the edge', () => {
    const p = cachePolicyFor('/');
    expect(p.perCity).toBe(true);
    expect(browserCacheControl(p)).toBe('private, no-cache');
    expect(edgeCacheControl(p)).toBe('public, s-maxage=600, stale-while-revalidate=86400');
    expect(browserCacheControl(cachePolicyFor('/event/x'))).toContain('max-age=300');
    expect(browserCacheControl(cachePolicyFor('/saved'))).toBe('private, no-store');
  });
});
