// /sitemaps/static.xml   static pages, blog posts (real lastmod), indexable city pages
// /sitemaps/venues.xml   active venues with >= 1 upcoming event
// /sitemaps/events-N.xml upcoming events, series-collapsed, 180-day horizon, 10k per chunk
// <lastmod> on venues/events comes from updated_at, which the pipeline only
// bumps when a visible column changes (FindLocalData PR #28).
import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { CITIES, SITE } from '@findlocal/shared';
import { countUpcomingEventsByCity, getDb, listSitemapEvents, listSitemapVenues } from '../../lib/db.js';
import { MIN_CITY_EVENTS, eventChunk, parseSitemapName, toLastmod, urlsetXml, xmlResponse, type SitemapUrl } from '../../lib/sitemap.js';

const STATIC_PATHS = ['/', '/venues', '/about', '/platform', '/developers', '/developers/api', '/developers/mcp', '/developers/widgets', '/privacy', '/terms', '/blog'];

async function staticUrls(): Promise<SitemapUrl[]> {
  const [posts, byCity] = await Promise.all([getCollection('blog', (p) => !p.data.draft), countUpcomingEventsByCity(getDb())]);
  return [
    ...STATIC_PATHS.map((p) => ({ loc: `${SITE}${p}` })),
    ...posts.map((p) => ({ loc: `${SITE}/blog/${p.id}`, lastmod: (p.data.updated ?? p.data.date).toISOString().slice(0, 10) })),
    ...CITIES.filter((c) => (byCity.get(c.name) ?? 0) >= MIN_CITY_EVENTS).map((c) => ({ loc: `${SITE}/city/${c.slug}` })),
  ];
}

export const GET: APIRoute = async ({ params }) => {
  const parsed = parseSitemapName(params.name);
  if (!parsed) return xmlResponse('<?xml version="1.0" encoding="UTF-8"?><error>not found</error>', 404);
  const db = getDb();
  let urls: SitemapUrl[];
  if (parsed.name === 'static') urls = await staticUrls();
  else if (parsed.name === 'venues') urls = (await listSitemapVenues(db)).map((v) => ({ loc: `${SITE}/venue/${v.id}`, lastmod: toLastmod(v.updated_at) }));
  else {
    const rows = eventChunk(await listSitemapEvents(db), parsed.chunk ?? 1);
    if (rows.length === 0) return xmlResponse('<?xml version="1.0" encoding="UTF-8"?><error>not found</error>', 404);
    urls = rows.map((e) => ({ loc: `${SITE}/event/${e.id}`, lastmod: toLastmod(e.updated_at) }));
  }
  return xmlResponse(urlsetXml(urls));
};
