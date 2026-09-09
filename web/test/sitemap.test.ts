import { describe, expect, it } from 'vitest';
import { EVENTS_CHUNK, eventChunk, eventChunkCount, parseSitemapName, sitemapIndexXml, toLastmod, urlsetXml } from '../src/lib/sitemap.js';

describe('sitemap helpers', () => {
  it('parseSitemapName accepts only the names we serve', () => {
    expect(parseSitemapName('static')).toEqual({ name: 'static', chunk: null });
    expect(parseSitemapName('venues')).toEqual({ name: 'venues', chunk: null });
    expect(parseSitemapName('events-1')).toEqual({ name: 'events-1', chunk: 1 });
    expect(parseSitemapName('events-12')).toEqual({ name: 'events-12', chunk: 12 });
    for (const bad of ['events-0', 'events-01', 'events', 'events-x', 'blog', '', undefined]) expect(parseSitemapName(bad), String(bad)).toBeNull();
  });
  it('chunks events at 10k and never emits an empty middle chunk', () => {
    expect(EVENTS_CHUNK).toBe(10_000);
    expect(eventChunkCount(0)).toBe(1);
    expect(eventChunkCount(10_000)).toBe(1);
    expect(eventChunkCount(10_001)).toBe(2);
    expect(eventChunkCount(46_766)).toBe(5);
    const rows = Array.from({ length: 25 }, (_, i) => i);
    expect(eventChunk(rows, 1, 10)).toEqual(rows.slice(0, 10));
    expect(eventChunk(rows, 3, 10)).toEqual([20, 21, 22, 23, 24]);
    expect(eventChunk(rows, 4, 10)).toEqual([]);
    expect(eventChunk(rows, 0, 10)).toEqual([]);
  });
  it('toLastmod truncates ISO timestamps and drops junk', () => {
    expect(toLastmod('2026-09-05T16:54:41.188Z')).toBe('2026-09-05');
    expect(toLastmod('2026-09-05')).toBe('2026-09-05');
    expect(toLastmod('yesterday')).toBeNull();
    expect(toLastmod(null)).toBeNull();
  });
  it('renders a urlset and a sitemapindex', () => {
    const xml = urlsetXml([{ loc: 'https://findlocal.community/' }, { loc: 'https://findlocal.community/blog/a&b', lastmod: '2026-09-04' }]);
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml).toContain('<url><loc>https://findlocal.community/</loc></url>');
    expect(xml).toContain('<loc>https://findlocal.community/blog/a&amp;b</loc><lastmod>2026-09-04</lastmod>');
    const idx = sitemapIndexXml(['static', 'venues', 'events-1', 'events-2']);
    expect(idx).toContain('<sitemapindex');
    expect(idx.match(/<sitemap>/g)?.length).toBe(4);
    expect(idx).toContain('<loc>https://findlocal.community/sitemaps/events-2.xml</loc>');
  });
});

describe('withoutPage', async () => {
  const { withoutPage } = await import('../src/lib/feed.js');
  it('strips only the page key', () => {
    expect(withoutPage('page=2')).toBe('');
    expect(withoutPage('cat=music&page=2')).toBe('cat=music');
    expect(withoutPage('')).toBe('');
  });
});
