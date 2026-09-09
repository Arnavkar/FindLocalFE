// /sitemap.xml is a sitemap index; the URL lists live under /sitemaps/<name>.xml
// (static + blog + cities, venues, events-N chunks of 10k). Google rejects a
// single file over 50,000 URLs, which the old urlset had passed.
import type { APIRoute } from 'astro';
import { getDb, listSitemapEvents } from '../lib/db.js';
import { eventChunkCount, sitemapIndexXml, xmlResponse, type SitemapName } from '../lib/sitemap.js';

export const GET: APIRoute = async () => {
  const events = await listSitemapEvents(getDb());
  const chunks = eventChunkCount(events.length);
  const names: SitemapName[] = ['static', 'venues', ...Array.from({ length: chunks }, (_, i) => `events-${i + 1}` as const)];
  return xmlResponse(sitemapIndexXml(names));
};
