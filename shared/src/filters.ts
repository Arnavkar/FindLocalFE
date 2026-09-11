// URL <-> EventFilters: the single filter contract shared by the site, its
// JSON API and the MCP worker. Known query keys:
//   when   anytime|today|tomorrow|weekend|week|YYYY-MM-DD (default anytime)
//   cat    comma list of category slugs (or repeated: cat=a&cat=b)
//   free=1 paid=1
//   max    number (USD)
//   tod    comma list of morning|afternoon|evening
//   region borough / neighbourhood label
//   q      free text
//   performer  performer/author/instructor name (substring match)
//   page   1-based, 100 events per page
import { CATEGORY_SLUGS } from './categories.js';
import type { City } from './cities.js';
import { dateRangeFor, isYmd, TIME_OF_DAY, type TimeOfDay, type When } from './dates.js';

export const PAGE_SIZE = 100;

export interface EventFilters {
  /** City.name, e.g. 'New York'. */
  city: string;
  region?: string;
  /** Inclusive 'YYYY-MM-DD' lower bound; queries default it to today in the city tz. */
  from?: string;
  /** Inclusive 'YYYY-MM-DD' upper bound; null/undefined = open-ended. */
  to?: string | null;
  categories?: string[];
  free?: boolean;
  paid?: boolean;
  maxPrice?: number;
  timeOfDay?: TimeOfDay[];
  text?: string;
  /** Substring match on performer names only (not roles/urls). */
  performer?: string;
  venueId?: string;
  ids?: string[];
  limit?: number;
  offset?: number;
  includeDeleted?: boolean;
}

export const FILTER_KEYS = ['when', 'cat', 'free', 'paid', 'max', 'tod', 'region', 'q', 'performer', 'page'] as const;
export type FilterKey = (typeof FILTER_KEYS)[number];

const WHEN_BUCKETS = new Set(['anytime', 'today', 'tomorrow', 'weekend', 'week']);
const MAX_TEXT = 100;

function normWhen(raw: string | null): When | null {
  const w = (raw ?? '').trim().toLowerCase();
  if (!w || w === 'anytime') return null;
  if (WHEN_BUCKETS.has(w) || isYmd(w)) return w;
  return null;
}

/** First non-empty value for a key (a form may submit `when=&when=weekend`). */
function firstNonEmpty(params: URLSearchParams, key: string): string | null {
  return params.getAll(key).find((v) => v.trim() !== '') ?? null;
}

/** Comma list, repeated params (`cat=a&cat=b`), or a mix — same result. */
function listParam(params: URLSearchParams, key: string): string | null {
  const all = params.getAll(key).filter((v) => v.trim() !== '');
  return all.length ? all.join(',') : null;
}

function normList(raw: string | null, allowed: readonly string[]): string[] {
  if (!raw) return [];
  const set = new Set(
    raw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter((s) => allowed.includes(s)),
  );
  return allowed.filter((a) => set.has(a));
}

function normMax(raw: string | null): number | null {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function normPage(raw: string | null): number | null {
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isInteger(n) && n > 1 ? n : null;
}

function normText(raw: string | null): string | null {
  const t = (raw ?? '').trim().replace(/\s+/g, ' ').slice(0, MAX_TEXT);
  return t || null;
}

/** Parse a request's search params into EventFilters for `city` (dates resolved in city.tz). */
export function parseFilters(params: URLSearchParams, city: City, now: Date = new Date()): EventFilters {
  const f: EventFilters = { city: city.name };
  const range = dateRangeFor(normWhen(firstNonEmpty(params, 'when')) ?? 'anytime', city.tz, now);
  f.from = range.from;
  f.to = range.to;
  const cats = normList(listParam(params, 'cat'), CATEGORY_SLUGS);
  if (cats.length) f.categories = cats;
  if (params.get('free') === '1') f.free = true;
  if (params.get('paid') === '1') f.paid = true;
  const max = normMax(params.get('max'));
  if (max !== null) f.maxPrice = max;
  const tod = normList(listParam(params, 'tod'), TIME_OF_DAY) as TimeOfDay[];
  if (tod.length) f.timeOfDay = tod;
  const region = normText(firstNonEmpty(params, 'region'));
  if (region) f.region = region;
  const q = normText(params.get('q'));
  if (q) f.text = q;
  const performer = normText(params.get('performer'));
  if (performer) f.performer = performer;
  const page = normPage(params.get('page')) ?? 1;
  f.limit = PAGE_SIZE;
  f.offset = (page - 1) * PAGE_SIZE;
  return f;
}

/**
 * Only the known keys, normalised and sorted, defaults dropped. Returns '' or
 * 'cat=music&when=today' (no leading '?'). Used as the edge-cache key and to
 * build the canonical URL for a filtered view.
 */
export function canonicalQuery(params: URLSearchParams): string {
  const out = new URLSearchParams();
  const when = normWhen(firstNonEmpty(params, 'when'));
  if (when) out.set('when', when);
  const cats = normList(listParam(params, 'cat'), CATEGORY_SLUGS);
  if (cats.length) out.set('cat', cats.join(','));
  if (params.get('free') === '1') out.set('free', '1');
  if (params.get('paid') === '1') out.set('paid', '1');
  const max = normMax(params.get('max'));
  if (max !== null) out.set('max', String(max));
  const tod = normList(listParam(params, 'tod'), TIME_OF_DAY);
  if (tod.length) out.set('tod', tod.join(','));
  const region = normText(firstNonEmpty(params, 'region'));
  if (region) out.set('region', region);
  const q = normText(params.get('q'));
  if (q) out.set('q', q);
  const performer = normText(params.get('performer'));
  if (performer) out.set('performer', performer);
  const page = normPage(params.get('page'));
  if (page) out.set('page', String(page));
  out.sort();
  return out.toString();
}

export interface QueryableFilters extends Partial<EventFilters> {
  /** Preferred over from/to when building a URL. */
  when?: When;
  page?: number;
}

/** Inverse of parseFilters (as far as possible): a canonical query string, '' when empty. */
export function filtersToQuery(f: QueryableFilters): string {
  const p = new URLSearchParams();
  if (f.when) p.set('when', f.when);
  else if (f.from && f.to === f.from) p.set('when', f.from);
  if (f.categories?.length) p.set('cat', f.categories.join(','));
  if (f.free) p.set('free', '1');
  if (f.paid) p.set('paid', '1');
  if (f.maxPrice !== undefined) p.set('max', String(f.maxPrice));
  if (f.timeOfDay?.length) p.set('tod', f.timeOfDay.join(','));
  if (f.region) p.set('region', f.region);
  if (f.text) p.set('q', f.text);
  if (f.performer) p.set('performer', f.performer);
  const page = f.page ?? (f.offset && f.offset > 0 ? Math.floor(f.offset / PAGE_SIZE) + 1 : undefined);
  if (page) p.set('page', String(page));
  return canonicalQuery(p);
}
