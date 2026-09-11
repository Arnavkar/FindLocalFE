import { describe, expect, it } from 'vitest';
import {
  CITIES, canonicalQuery, canonicalUrl, categoryBySlug, cityBySlug, citySlug, dateRangeFor,
  filtersToQuery, formatEventDate, formatTime, getCity, GONE_PATHS, isGonePath, isUuid, nearestCity,
  parseFilters, redirectTargetFor, REGION_GROUPS, regionGroupBySlug, regionGroupCities, regionGroupCityNames, slugForToken, slugsForTokens, timeOfDayBucket, todayIn, addDays,
} from '../src/index.js';

const NY = getCity('New York')!;
const LA = cityBySlug('los-angeles')!;
// Saturday 2026-09-05 03:00 UTC = Fri 2026-09-04 23:00 in New York, 20:00 in LA.
const NOW = new Date('2026-09-05T03:00:00Z');

describe('cities', () => {
  it('loads 83 metros and looks up case-insensitively', () => {
    expect(CITIES.length).toBe(83);
    expect(getCity('new york')?.slug).toBe('new-york');
    expect(getCity('nope')).toBeUndefined();
    expect(cityBySlug('st-louis')?.name).toBe('St. Louis');
  });
  it('citySlug drops dots and dashes spaces', () => {
    expect(citySlug('St. Louis')).toBe('st-louis');
    expect(citySlug('Washington DC')).toBe('washington-dc');
    for (const c of CITIES) expect(citySlug(c.name)).toBe(c.slug);
  });
  it('nearestCity by haversine', () => {
    expect(nearestCity(42.36, -71.06).name).toBe('Boston');
    expect(nearestCity(34.0, -118.2).name).toBe('Los Angeles');
  });
});

describe('region groups', () => {
  it('every slug in every group resolves to a city, with no duplicates', () => {
    for (const g of REGION_GROUPS) {
      expect(new Set(g.cities).size).toBe(g.cities.length);
      for (const slug of g.cities) expect(cityBySlug(slug), `${g.slug}: ${slug}`).toBeDefined();
      expect(regionGroupCities(g).length).toBe(g.cities.length);
    }
  });
  it('new-england has the 18 partitions and resolves names for the query layer', () => {
    const ne = regionGroupBySlug('New-England')!;
    expect(ne.cities.length).toBe(18);
    expect(ne.tz).toBe('America/New_York');
    const names = regionGroupCityNames(ne);
    expect(names).toContain('Boston');
    expect(names).toContain('Portland ME');
    expect(names).not.toContain('Portland');
    expect(regionGroupBySlug('nope')).toBeUndefined();
    expect(regionGroupBySlug(null)).toBeUndefined();
  });
});

describe('categories (parity with categories.py)', () => {
  it('slugForToken rules', () => {
    expect(slugForToken('Live Jazz Music')).toBe('music');
    expect(slugForToken('Free')).toBeNull();
    expect(slugForToken('Culture')).toBe('art');
    expect(slugForToken('jazz')).toBe('music');
    expect(slugForToken('  Stand-Up ')).toBe('comedy');
    expect(slugForToken('')).toBeNull();
    expect(slugForToken(null)).toBeNull();
    expect(slugForToken('xyzzy')).toBeNull();
    expect(slugForToken('bar')).toBeNull(); // ignored token
  });
  it('slugsForTokens returns distinct slugs in category order', () => {
    expect(slugsForTokens(['comedy', 'jazz', 'Free', 'rock'])).toEqual(['music', 'comedy']);
    expect(categoryBySlug('MUSIC')?.label).toBe('Music');
  });
});

describe('dates', () => {
  it('todayIn resolves per time zone', () => {
    expect(todayIn('America/New_York', NOW)).toBe('2026-09-04');
    expect(todayIn('UTC', NOW)).toBe('2026-09-05');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('dateRangeFor buckets in NY vs LA', () => {
    expect(dateRangeFor('today', NY.tz, NOW)).toEqual({ from: '2026-09-04', to: '2026-09-04' });
    expect(dateRangeFor('today', LA.tz, NOW)).toEqual({ from: '2026-09-04', to: '2026-09-04' });
    expect(dateRangeFor('tomorrow', NY.tz, NOW)).toEqual({ from: '2026-09-05', to: '2026-09-05' });
    // Friday -> this Fri..Sun.
    expect(dateRangeFor('weekend', NY.tz, NOW)).toEqual({ from: '2026-09-04', to: '2026-09-06' });
    // Saturday (UTC) -> today..Sun.
    expect(dateRangeFor('weekend', 'UTC', NOW)).toEqual({ from: '2026-09-05', to: '2026-09-06' });
    // Wednesday -> upcoming Fri..Sun.
    expect(dateRangeFor('weekend', 'UTC', new Date('2026-09-02T12:00:00Z'))).toEqual({ from: '2026-09-04', to: '2026-09-06' });
    // Sunday -> just today.
    expect(dateRangeFor('weekend', 'UTC', new Date('2026-09-06T12:00:00Z'))).toEqual({ from: '2026-09-06', to: '2026-09-06' });
    expect(dateRangeFor('week', NY.tz, NOW)).toEqual({ from: '2026-09-04', to: '2026-09-10' });
    expect(dateRangeFor('2026-10-31', NY.tz, NOW)).toEqual({ from: '2026-10-31', to: '2026-10-31' });
    expect(dateRangeFor('anytime', NY.tz, NOW)).toEqual({ from: '2026-09-04', to: null });
    expect(dateRangeFor('garbage', NY.tz, NOW)).toEqual({ from: '2026-09-04', to: null });
  });
  it('formats', () => {
    expect(formatEventDate('2026-09-04', NY.tz)).toBe('Fri, Sep 4');
    expect(formatEventDate('2026-09-04', NY.tz, { relative: true, now: NOW })).toBe('Today');
    expect(formatEventDate('2026-09-05', NY.tz, { relative: true, now: NOW })).toBe('Tomorrow');
    expect(formatEventDate('2026-09-04', NY.tz, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })).toBe('Friday, September 4, 2026');
    expect(formatTime('19:30')).toBe('7:30 PM');
    expect(formatTime('19:30:00')).toBe('7:30 PM');
    expect(formatTime('00:15')).toBe('12:15 AM');
    expect(formatTime('12:00')).toBe('12:00 PM');
    expect(formatTime(null)).toBe('');
    expect(formatTime('tbd')).toBe('');
  });
  it('timeOfDayBucket', () => {
    expect(timeOfDayBucket('05:00')).toBe('morning');
    expect(timeOfDayBucket('11:59')).toBe('morning');
    expect(timeOfDayBucket('12:00')).toBe('afternoon');
    expect(timeOfDayBucket('16:59:00')).toBe('afternoon');
    expect(timeOfDayBucket('17:00')).toBe('evening');
    expect(timeOfDayBucket('04:59')).toBe('evening');
    expect(timeOfDayBucket(null)).toBeNull();
    expect(timeOfDayBucket('noon')).toBeNull();
  });
});

describe('filters', () => {
  it('parseFilters maps every key', () => {
    const p = new URLSearchParams('when=weekend&cat=music,comedy,bogus&free=1&paid=1&max=25&tod=evening,morning&region=Brooklyn&q=%20jazz%20&page=3');
    const f = parseFilters(p, NY, NOW);
    expect(f).toEqual({
      city: 'New York', from: '2026-09-04', to: '2026-09-06', categories: ['music', 'comedy'], free: true, paid: true,
      maxPrice: 25, timeOfDay: ['morning', 'evening'], region: 'Brooklyn', text: 'jazz', limit: 100, offset: 200,
    });
    const d = parseFilters(new URLSearchParams(''), NY, NOW);
    expect(d).toEqual({ city: 'New York', from: '2026-09-04', to: null, limit: 100, offset: 0 });
    expect(parseFilters(new URLSearchParams('page=0&max=-3&free=yes'), NY, NOW)).toEqual(d);
  });
  it('canonicalQuery sorts, normalises and drops defaults/unknowns', () => {
    expect(canonicalQuery(new URLSearchParams('utm_source=x&when=anytime&page=1&cat=&free=0'))).toBe('');
    expect(canonicalQuery(new URLSearchParams('q=jazz&when=today&cat=comedy,music,music&free=1&tod=evening'))).toBe('cat=music%2Ccomedy&free=1&q=jazz&tod=evening&when=today');
    expect(canonicalQuery(new URLSearchParams('page=2&max=20.5&region=Back+Bay'))).toBe('max=20.5&page=2&region=Back+Bay');
    expect(canonicalQuery(new URLSearchParams('when=2026-10-31'))).toBe('when=2026-10-31');
  });
  it('filtersToQuery round-trips through parseFilters', () => {
    const q = filtersToQuery({ when: 'today', categories: ['music'], free: true, page: 2, text: 'x' });
    expect(q).toBe('cat=music&free=1&page=2&q=x&when=today');
    expect(filtersToQuery({})).toBe('');
    expect(filtersToQuery({ from: '2026-10-01', to: '2026-10-01', offset: 300 })).toBe('page=4&when=2026-10-01');
  });
});

describe('seo', () => {
  it('isUuid / canonicalUrl', () => {
    expect(isUuid('AAAAAAAA-0000-4000-8000-000000000001')).toBe(true);
    expect(isUuid('nope')).toBe(false);
    expect(canonicalUrl('/about/')).toBe('https://findlocal.community/about');
    expect(canonicalUrl('/', 'cat=music')).toBe('https://findlocal.community/?cat=music');
    expect(canonicalUrl('/', '')).toBe('https://findlocal.community/');
  });
  it('redirectTargetFor', () => {
    expect(redirectTargetFor('/about/')).toBe('/about');
    expect(redirectTargetFor('/')).toBeNull();
    expect(redirectTargetFor('/about')).toBeNull();
    expect(redirectTargetFor('/event/AAAAAAAA-0000-4000-8000-000000000001')).toBe('/event/aaaaaaaa-0000-4000-8000-000000000001');
    expect(redirectTargetFor('/event/aaaaaaaa-0000-4000-8000-000000000001')).toBeNull();
    expect(redirectTargetFor('/boston')).toBe('/city/boston');
    expect(redirectTargetFor('/boston/')).toBe('/city/boston');
    expect(redirectTargetFor('/city/boston')).toBeNull();
    expect(redirectTargetFor('/venues')).toBeNull();
    expect(redirectTargetFor('/map')).toBe('/?view=map');
    expect(redirectTargetFor('/filters')).toBe('/');
    expect(redirectTargetFor('/sitemap')).toBe('/sitemap.xml');
    expect(redirectTargetFor('/sitemap-blog.xml')).toBe('/sitemap.xml');
    expect(redirectTargetFor('/sitemaps')).toBe('/sitemap.xml');
    expect(redirectTargetFor('/sitemaps/events-1.xml')).toBeNull();
    expect(redirectTargetFor('/sitemaps/static.xml/')).toBe('/sitemaps/static.xml');
    expect(redirectTargetFor('/sitemap.xml')).toBeNull();
  });
  it('GONE_PATHS', () => {
    for (const p of ['/friends', '/create', '/home', '/profile', '/support', '/discover-creators', '/followed-venues', '/following-activity', '/followers', '/user/abc', '/user', '/auth/callback', '/invite/xyz']) {
      expect(GONE_PATHS.some((re) => re.test(p)), p).toBe(true);
      expect(isGonePath(p)).toBe(true);
    }
    for (const p of ['/', '/event/x', '/venues', '/users', '/authors', '/city/boston']) {
      expect(isGonePath(p), p).toBe(false);
    }
  });
});
