// Pure helpers for the sitemap index (/sitemap.xml) and its children
// (/sitemaps/<name>.xml). Google caps a sitemap at 50,000 URLs / 50 MB, so
// events are chunked; everything else fits in one file each.
import { SITE } from '@findlocal/shared';

/** URLs per events chunk. Well under the 50k cap so a chunk stays small and stable. */
export const EVENTS_CHUNK = 10_000;
/** A city page is submitted only when it is indexable (city/[slug].astro noindexes < 3 events). */
export const MIN_CITY_EVENTS = 3;

export interface SitemapUrl {
  loc: string;
  lastmod?: string | null;
}

export type SitemapName = 'static' | 'venues' | `events-${number}`;

const NAME_RE = /^(static|venues|events-([1-9]\d*))$/;

/** Parse a `/sitemaps/<name>.xml` param; null when it is not a sitemap we serve. */
export function parseSitemapName(raw: string | undefined): { name: SitemapName; chunk: number | null } | null {
  const m = NAME_RE.exec(raw ?? '');
  if (!m) return null;
  const chunk = m[2] ? Number(m[2]) : null;
  return { name: m[1] as SitemapName, chunk };
}

export function eventChunkCount(total: number, size = EVENTS_CHUNK): number {
  return Math.max(1, Math.ceil(total / size));
}

/** Rows for chunk `n` (1-based); [] when the chunk is past the end. */
export function eventChunk<T>(rows: T[], n: number, size = EVENTS_CHUNK): T[] {
  if (n < 1) return [];
  return rows.slice((n - 1) * size, n * size);
}

/** ISO timestamp -> W3C date for <lastmod>; null when malformed (omit rather than lie). */
export function toLastmod(updatedAt: string | null | undefined): string | null {
  if (!updatedAt) return null;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(updatedAt);
  return m ? (m[1] as string) : null;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function urlsetXml(urls: SitemapUrl[]): string {
  const body = urls
    .map((u) => `  <url><loc>${esc(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}</url>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

export function sitemapIndexXml(names: SitemapName[]): string {
  const body = names.map((n) => `  <sitemap><loc>${SITE}/sitemaps/${n}.xml</loc></sitemap>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</sitemapindex>\n`;
}

export function xmlResponse(body: string, status = 200): Response {
  return new Response(body, { status, headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
}
