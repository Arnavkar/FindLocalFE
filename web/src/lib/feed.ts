// Everything the feed (/ and /city/[slug]) needs, loaded through the shared
// SELECT helpers in one place so both pages render the same thing.
import type { D1Database } from '@cloudflare/workers-types';
import {
  CATEGORIES,
  PAGE_SIZE,
  canonicalQuery,
  filtersToQuery,
  parseFilters,
  parseYmdRange,
  type City,
  type EventFilters,
  type EventRow,
  type QueryableFilters,
  type TimeOfDay,
} from '@findlocal/shared';
import { categoryCounts, countUpcomingEvents, listRegions, listUpcomingEvents } from './db.js';

export type WhenChip = 'anytime' | 'today' | 'tomorrow' | 'weekend' | 'week';
export const WHEN_CHIPS: { value: WhenChip; label: string }[] = [
  { value: 'anytime', label: 'Anytime' },
  { value: 'today', label: 'Today' },
  { value: 'tomorrow', label: 'Tomorrow' },
  { value: 'weekend', label: 'This weekend' },
  { value: 'week', label: 'This week' },
];
export const TOD_CHIPS: { value: TimeOfDay; label: string }[] = [
  { value: 'morning', label: 'Morning' },
  { value: 'afternoon', label: 'Afternoon' },
  { value: 'evening', label: 'Evening' },
];

export interface FeedState {
  city: City;
  /** Base path chips link to (always the canonical city page). */
  basePath: string;
  filters: EventFilters;
  /** The `when` value as it appears in the URL ('anytime' when unset). */
  when: string;
  /** 'YYYY-MM-DD' when `when` is a literal date or a range (its first day). */
  whenDate: string | null;
  /** Last day of a `when` range literal ('YYYY-MM-DD..YYYY-MM-DD'); null for a single day. */
  whenUntil: string | null;
  page: number;
  pages: number;
  total: number;
  events: EventRow[];
  /** category slug -> upcoming count under every other filter. */
  categoryOptions: { slug: string; label: string; count: number; active: boolean }[];
  regions: { region: string; count: number }[];
  view: 'list' | 'map';
  /** canonicalQuery of the request ('' = unfiltered, unpaged). */
  canonical: string;
  /** `canonical` minus `page`: '' means the view is only paginated, never filtered. */
  filterCanonical: string;
}

/** canonicalQuery with the page key removed (pagination is indexable, filters are not). */
export function withoutPage(canonical: string): string {
  const p = new URLSearchParams(canonical);
  p.delete('page');
  p.sort();
  return p.toString();
}

export async function loadFeed(db: D1Database, city: City, url: URL, now: Date = new Date()): Promise<FeedState> {
  const params = url.searchParams;
  const filters = parseFilters(params, city, now);
  const canonical = canonicalQuery(params);
  const when = new URLSearchParams(canonical).get('when') ?? 'anytime';
  const range = parseYmdRange(when);
  const whenDate = range ? range.from : /^\d{4}-\d{2}-\d{2}$/.test(when) ? when : null;
  const whenUntil = range ? range.to : null;
  const page = (filters.offset ?? 0) / PAGE_SIZE + 1;
  const [events, total, cats, regions] = await Promise.all([
    listUpcomingEvents(db, filters),
    countUpcomingEvents(db, filters),
    categoryCounts(db, city.name, filters),
    listRegions(db, city.name),
  ]);
  const countBySlug = new Map(cats.map((c) => [c.category, c.count]));
  const active = new Set(filters.categories ?? []);
  const categoryOptions = CATEGORIES.map((c) => ({
    slug: c.slug,
    label: c.label,
    count: countBySlug.get(c.slug) ?? 0,
    active: active.has(c.slug),
  })).filter((c) => c.count > 0 || c.active);
  return {
    city,
    basePath: `/city/${city.slug}`,
    filters,
    when,
    whenDate,
    whenUntil,
    page,
    pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    total,
    events,
    categoryOptions,
    regions,
    view: params.get('view') === 'map' ? 'map' : 'list',
    canonical,
    filterCanonical: withoutPage(canonical),
  };
}

/** Current filters as the URL-facing shape (for building chip links). */
export function toQueryable(s: FeedState): QueryableFilters {
  const f = s.filters;
  const q: QueryableFilters = {};
  if (s.when !== 'anytime') q.when = s.when;
  if (f.categories?.length) q.categories = f.categories;
  if (f.free) q.free = true;
  if (f.paid) q.paid = true;
  if (f.maxPrice !== undefined) q.maxPrice = f.maxPrice;
  if (f.timeOfDay?.length) q.timeOfDay = f.timeOfDay;
  if (f.region) q.region = f.region;
  if (f.text) q.text = f.text;
  if (f.performer) q.performer = f.performer;
  return q;
}

/** Link for a filter change: the base path plus filtersToQuery (page reset). */
export function chipHref(s: FeedState, patch: Partial<QueryableFilters>, keepView = true): string {
  const q = filtersToQuery({ ...toQueryable(s), ...patch });
  const view = keepView && s.view === 'map' ? 'view=map' : '';
  const query = [q, view].filter(Boolean).join('&');
  return `${s.basePath}${query ? `?${query}` : ''}`;
}

/** Toggle one value in a multi-select list (cat / tod). */
export function toggled<T extends string>(list: T[] | undefined, value: T): T[] {
  const cur = list ?? [];
  return cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
}

export function pageHref(s: FeedState, page: number): string {
  const q = filtersToQuery({ ...toQueryable(s), page: page > 1 ? page : undefined });
  const view = s.view === 'map' ? 'view=map' : '';
  const query = [q, view].filter(Boolean).join('&');
  return `${s.basePath}${query ? `?${query}` : ''}`;
}

/** Number of filter groups in use (FAB badge): when, categories, price, max price, time, area, text, performer. */
export function activeFilterCount(s: FeedState): number {
  const f = s.filters;
  let n = 0;
  if (s.when !== 'anytime') n++;
  if (f.categories?.length) n++;
  if (f.free || f.paid) n++;
  if (f.maxPrice !== undefined) n++;
  if (f.timeOfDay?.length) n++;
  if (f.region) n++;
  if (f.text) n++;
  if (f.performer) n++;
  return n;
}

/** Human summary of the active filters for headings/meta. */
export function filterSummary(s: FeedState): string {
  const bits: string[] = [];
  const whenLabel = WHEN_CHIPS.find((w) => w.value === s.when)?.label;
  if (whenLabel && s.when !== 'anytime') bits.push(whenLabel.toLowerCase());
  else if (s.whenDate && s.whenUntil) bits.push(`${s.whenDate} to ${s.whenUntil}`);
  else if (s.whenDate) bits.push(`on ${s.whenDate}`);
  const cats = s.categoryOptions.filter((c) => c.active).map((c) => c.label);
  if (cats.length) bits.push(cats.join(', '));
  if (s.filters.free && !s.filters.paid) bits.push('free');
  if (s.filters.paid && !s.filters.free) bits.push('ticketed');
  if (s.filters.timeOfDay?.length) bits.push(s.filters.timeOfDay.join('/'));
  if (s.filters.region) bits.push(`in ${s.filters.region}`);
  if (s.filters.text) bits.push(`matching “${s.filters.text}”`);
  if (s.filters.performer) bits.push(`featuring “${s.filters.performer}”`);
  return bits.join(' · ');
}
