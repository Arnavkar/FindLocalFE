import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { CITIES, SITE } from '@findlocal/shared';
import { getDb, listSitemapEvents, listSitemapVenues } from '../lib/db.js';

/** ISO timestamp -> W3C date for <lastmod>; null when malformed (omit rather than lie). */
export function toLastmod(updatedAt: string | null | undefined): string | null {
  if (!updatedAt) return null;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(updatedAt);
  return m ? (m[1] as string) : null;
}

// Single urlset (~36k URLs today; the 50k limit is far off — chunk if we pass 45k).
export const GET: APIRoute = async () => {
  const db = getDb();
  const [events, venues, posts] = await Promise.all([
    listSitemapEvents(db),
    listSitemapVenues(db),
    getCollection('blog', (p) => !p.data.draft),
  ]);
  const urls: { loc: string; lastmod?: string | null }[] = [
    { loc: `${SITE}/` },
    { loc: `${SITE}/venues` },
    { loc: `${SITE}/about` },
    { loc: `${SITE}/platform` },
    { loc: `${SITE}/developers` },
    { loc: `${SITE}/developers/api` },
    { loc: `${SITE}/developers/mcp` },
    { loc: `${SITE}/developers/widgets` },
    { loc: `${SITE}/privacy` },
    { loc: `${SITE}/terms` },
    { loc: `${SITE}/blog` },
    ...posts.map((p) => ({ loc: `${SITE}/blog/${p.id}`, lastmod: (p.data.updated ?? p.data.date).toISOString().slice(0, 10) })),
    ...CITIES.map((c) => ({ loc: `${SITE}/city/${c.slug}` })),
    ...venues.map((v) => ({ loc: `${SITE}/venue/${v.id}`, lastmod: toLastmod(v.updated_at) })),
    ...events.map((e) => ({ loc: `${SITE}/event/${e.id}`, lastmod: toLastmod(e.updated_at) })),
  ];
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u.loc}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}</url>`).join('\n')}
</urlset>
`;
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
