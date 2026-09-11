// Home rails for the unfiltered feed (/ and /city/<slug>, page 1) and
// GET /api/home: a "Highlights" row, Today/Tonight, This weekend, Free, then one
// row per category with enough upcoming events — each ranked by
// pickHighlights (complete listings first, variety across category/venue)
// rather than by start time, so the first screen is not the day's 10 AM
// parks programme. Totals come from the same filter contract the "See all"
// links use, so the counts match the filtered page.
import type { D1Database } from '@cloudflare/workers-types';
import {
  CATEGORIES,
  clockIn,
  dateRangeFor,
  filtersToQuery,
  pickHighlights,
  todayIn,
  type City,
  type EventFilters,
  type EventRow,
  type QueryableFilters,
} from '@findlocal/shared';
import { categoryCounts, countUpcomingEvents, listUpcomingEvents } from './db.js';

export interface Rail {
  key: string;
  title: string;
  /** Upcoming events matching the rail's filters (for "See all N"). */
  total: number;
  /** Canonical query string for the rail's filtered page ('' = everything). */
  query: string;
  events: EventRow[];
}

export interface HomeRails {
  highlights: Rail;
  today: Rail | null;
  weekend: Rail | null;
  free: Rail | null;
  categories: Rail[];
}

/** Pool of the soonest events that category rails and Highlights are drawn from. */
export const POOL_LIMIT = 400;
/** Per-rail pool for the date/price rails. */
const RAIL_POOL = 150;
export const RAIL_SIZE = 10;
/** A category earns a row once this many of its events are in the pool. */
export const MIN_CATEGORY_EVENTS = 4;

const rail = (key: string, title: string, total: number, q: QueryableFilters, events: EventRow[]): Rail | null =>
  events.length ? { key, title, total, query: filtersToQuery(q), events } : null;

export async function loadHomeRails(db: D1Database, city: City, now: Date = new Date()): Promise<HomeRails> {
  const today = todayIn(city.tz, now);
  const weekend = dateRangeFor('weekend', city.tz, now);
  const base: EventFilters = { city: city.name };
  const todayF: EventFilters = { ...base, from: today, to: today };
  const weekendF: EventFilters = { ...base, from: weekend.from, to: weekend.to };
  const freeF: EventFilters = { ...base, free: true };
  const [pool, todayRows, weekendRows, freeRows, todayN, weekendN, freeN, cats] = await Promise.all([
    listUpcomingEvents(db, { ...base, limit: POOL_LIMIT }),
    listUpcomingEvents(db, { ...todayF, limit: RAIL_POOL }),
    listUpcomingEvents(db, { ...weekendF, limit: RAIL_POOL }),
    listUpcomingEvents(db, { ...freeF, limit: RAIL_POOL }),
    countUpcomingEvents(db, todayF),
    countUpcomingEvents(db, weekendF),
    countUpcomingEvents(db, freeF),
    categoryCounts(db, city.name),
  ]);
  const pick = (rows: EventRow[]) => pickHighlights(rows, { limit: RAIL_SIZE, today });
  const highlights = pick(pool);
  // Later rails skip what Highlights already shows (unless that would gut the rail),
  // so the first screen is not the same four cards twice.
  const shown = new Set(highlights.map((e) => e.id));
  const fresh = (rows: EventRow[]) => {
    const rest = rows.filter((e) => !shown.has(e.id));
    return rest.length >= MIN_CATEGORY_EVENTS ? rest : rows;
  };
  const countBySlug = new Map(cats.map((c) => [c.category, c.count]));
  const categories: Rail[] = [];
  for (const c of CATEGORIES) {
    const rows = pool.filter((e) => e.category === c.slug);
    if (rows.length < MIN_CATEGORY_EVENTS) continue;
    const r = rail(c.slug, c.label, countBySlug.get(c.slug) ?? rows.length, { categories: [c.slug] }, pick(fresh(rows)));
    if (r) categories.push(r);
  }
  categories.sort((a, b) => b.total - a.total);
  return {
    highlights: { key: 'highlights', title: 'Highlights', total: pool.length, query: '', events: highlights },
    today: rail('today', clockIn(city.tz, now) >= '17:00' ? 'Tonight' : 'Today', todayN, { when: 'today' }, pick(fresh(todayRows))),
    weekend: rail('weekend', 'This weekend', weekendN, { when: 'weekend' }, pick(fresh(weekendRows))),
    free: rail('free', 'Free', freeN, { free: true }, pick(fresh(freeRows))),
    categories,
  };
}

/** Rails in display order, skipping empty ones. */
export function railList(h: HomeRails): Rail[] {
  return [h.highlights, h.today, h.weekend, h.free, ...h.categories].filter((r): r is Rail => !!r && r.events.length > 0);
}
