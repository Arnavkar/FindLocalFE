// Read-only D1 query helpers shared by every front door (Astro site, its JSON
// API, the MCP worker). D1 has no read-only binding mode — the discipline is
// that ONLY these SELECT helpers ever touch the database from a front door.
// All SQL lives here; JSON columns are parsed in the mappers.
import type { D1Database } from '@cloudflare/workers-types';
import { getCity } from './cities.js';
import { addDays, todayIn } from './dates.js';
import type { EventFilters } from './filters.js';
import type { EventRow, Performer, VenueRow } from './types.js';

const MAX_BINDS = 90; // D1 allows 100 bound params per statement; leave headroom.
const MAX_LIMIT = 500;

type RawEvent = Omit<EventRow, 'event_type' | 'performers' | 'series_count' | 'series_image'> & {
  event_type: string | null;
  performers: string | null;
  series_count: number | null;
  series_image: string | null;
};
type RawVenue = Omit<VenueRow, 'categories' | 'upcoming'> & { categories: string | null; upcoming: number | null };

function parseJsonArray(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** events.performers: [{name, role, ...}]; older rows may hold bare name strings. */
function parsePerformers(raw: string | null): Performer[] {
  if (!raw) return [];
  try {
    const v: unknown = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    const out: Performer[] = [];
    for (const item of v) {
      if (typeof item === 'string' && item.trim()) out.push({ name: item.trim(), role: 'performer' });
      else if (item && typeof item === 'object' && typeof (item as Performer).name === 'string') {
        const p = item as Performer;
        out.push({
          name: p.name,
          role: typeof p.role === 'string' && p.role ? p.role : 'performer',
          ...(p.source_id ? { source_id: p.source_id } : {}),
          ...(p.url ? { url: p.url } : {}),
          ...(p.image ? { image: p.image } : {}),
        });
      }
    }
    return out;
  } catch {
    return [];
  }
}

function mapEvent(r: RawEvent): EventRow {
  const count = r.series_count ?? 1;
  return {
    ...r,
    event_type: parseJsonArray(r.event_type),
    performers: parsePerformers(r.performers),
    series_count: count,
    series_image: count > 1 ? r.series_image || null : null,
  };
}

function mapVenue(r: RawVenue): VenueRow {
  return { ...r, categories: parseJsonArray(r.categories), upcoming: r.upcoming ?? 0 };
}

/** LIKE wildcard escaping; pair with `ESCAPE '\'`. */
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, '\\$&');
}

/** Reference zone for helpers that are not city-scoped (getEvent, sitemaps): the
 * old Pages Functions used America/New_York, so keep the same 'today'. */
export const DEFAULT_TZ = 'America/New_York';

function todayDefault(): string {
  return todayIn(DEFAULT_TZ);
}

function cityToday(city: string): string {
  return todayIn(getCity(city)?.tz ?? DEFAULT_TZ);
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// ---------------------------------------------------------------- SQL fragments

const EVENT_COLS = `
  e.id, e.venue_id, e.city, e.region, e.source, e.external_id, e.title, e.description,
  e.event_date, e.start_time, e.end_time, e.category, e.event_type, e.performers, e.price, e.price_amount,
  e.status, e.detail_page_url, e.ticket_page_url, e.root_url, e.image_url, e.is_deleted,
  e.first_seen_at, e.last_seen_at, e.updated_at,
  v.name AS venue_name, v.address AS venue_address, v.image AS venue_image,
  v.latitude AS venue_lat, v.longitude AS venue_lng, v.url AS venue_url,
  v.type AS venue_type, v.region AS venue_region`;

/** Per-row series info via correlated subqueries (single rows / small sets). Binds: today x2. */
const SERIES_SUBQ = `
  (SELECT COUNT(DISTINCT s.event_date) FROM events s
    WHERE s.venue_id = e.venue_id AND lower(trim(s.title)) = lower(trim(e.title))
      AND s.is_deleted = 0 AND s.event_date >= ?) AS series_count,
  (SELECT s.image_url FROM events s
    WHERE s.venue_id = e.venue_id AND lower(trim(s.title)) = lower(trim(e.title))
      AND s.is_deleted = 0 AND s.event_date >= ? AND s.image_url IS NOT NULL AND s.image_url <> ''
    ORDER BY s.event_date, s.start_time, s.id LIMIT 1) AS series_image`;

/** Series info over the UNFILTERED upcoming set for one city (window functions), so a
 * filtered view still shows the recurring pill. Binds: city, today. */
const SERIES_CTE = `
  WITH days AS (
    SELECT venue_id, lower(trim(title)) AS norm_title, event_date,
           MIN(CASE WHEN image_url IS NOT NULL AND image_url <> '' THEN image_url END) AS img
    FROM events WHERE city = ? AND is_deleted = 0 AND event_date >= ?
    GROUP BY venue_id, norm_title, event_date
  ), series AS (
    SELECT venue_id, norm_title, event_date,
           COUNT(*) OVER w AS series_count,
           FIRST_VALUE(img) OVER (PARTITION BY venue_id, norm_title ORDER BY img IS NULL, event_date) AS series_image
    FROM days WINDOW w AS (PARTITION BY venue_id, norm_title)
  )`;

const SERIES_JOIN = `LEFT JOIN series sr ON sr.venue_id = e.venue_id
  AND sr.norm_title = lower(trim(e.title)) AND sr.event_date = e.event_date`;

const VENUE_COLS = `
  v.id, v.name, v.city, v.region, v.url, v.address, v.description, v.image, v.type,
  v.venue_size, v.categories, v.latitude, v.longitude, v.is_active`;

const ORDER = `ORDER BY e.event_date, e.start_time IS NULL, e.start_time, e.id`;

const TOD_SQL: Record<string, string> = {
  morning: `(CAST(substr(e.start_time,1,2) AS INTEGER) BETWEEN 5 AND 11)`,
  afternoon: `(CAST(substr(e.start_time,1,2) AS INTEGER) BETWEEN 12 AND 16)`,
  evening: `(CAST(substr(e.start_time,1,2) AS INTEGER) >= 17 OR CAST(substr(e.start_time,1,2) AS INTEGER) < 5)`,
};
const FREE_SQL = `(e.price_amount = 0 OR lower(e.price) LIKE '%free%')`;
const PAID_SQL = `(e.price_amount > 0 OR (e.price_amount IS NULL AND e.price IS NOT NULL AND e.price <> '' AND lower(e.price) NOT LIKE '%free%'))`;

interface Where {
  sql: string;
  binds: unknown[];
}

/** WHERE clause for the upcoming-events filter contract. `skip` drops one filter (chips). */
function buildWhere(f: EventFilters, skip?: keyof EventFilters): Where {
  const where: string[] = [`e.city = ?`];
  const binds: unknown[] = [f.city];
  if (!f.includeDeleted) where.push(`e.is_deleted = 0`);
  where.push(`e.event_date >= ?`);
  binds.push(f.from ?? cityToday(f.city));
  if (f.to) {
    where.push(`e.event_date <= ?`);
    binds.push(f.to);
  }
  if (f.region) {
    where.push(`e.region = ?`);
    binds.push(f.region);
  }
  if (f.categories?.length && skip !== 'categories') {
    const cats = f.categories.slice(0, MAX_BINDS);
    where.push(`e.category IN (${cats.map(() => '?').join(',')})`);
    binds.push(...cats);
  }
  if (f.free && f.paid) where.push(`(${FREE_SQL} OR ${PAID_SQL})`);
  else if (f.free) where.push(FREE_SQL);
  else if (f.paid) where.push(PAID_SQL);
  if (f.maxPrice !== undefined) {
    where.push(`e.price_amount <= ?`);
    binds.push(f.maxPrice);
  }
  const tods = (f.timeOfDay ?? []).map((t) => TOD_SQL[t]).filter((s): s is string => !!s);
  if (tods.length) where.push(`(${tods.join(' OR ')})`);
  if (f.text) {
    where.push(`(e.title LIKE ? ESCAPE '\\' OR v.name LIKE ? ESCAPE '\\' OR e.performers LIKE ? ESCAPE '\\')`);
    const like = `%${escapeLike(f.text.trim())}%`;
    binds.push(like, like, like);
  }
  if (f.venueId) {
    where.push(`e.venue_id = ?`);
    binds.push(f.venueId.toLowerCase());
  }
  if (f.ids?.length) {
    const ids = f.ids.slice(0, MAX_BINDS).map((id) => id.toLowerCase());
    where.push(`e.id IN (${ids.map(() => '?').join(',')})`);
    binds.push(...ids);
  }
  return { sql: where.join(' AND '), binds };
}

// ---------------------------------------------------------------- events

/** Upcoming events for a city under the filter contract, with recurrence info. */
export async function listUpcomingEvents(db: D1Database, f: EventFilters): Promise<EventRow[]> {
  const w = buildWhere(f);
  const limit = Math.min(Math.max(f.limit ?? 100, 1), MAX_LIMIT);
  const offset = Math.max(f.offset ?? 0, 0);
  const sql = `${SERIES_CTE}
    SELECT ${EVENT_COLS}, sr.series_count, sr.series_image
    FROM events e JOIN venues v ON v.id = e.venue_id ${SERIES_JOIN}
    WHERE ${w.sql} ${ORDER} LIMIT ? OFFSET ?`;
  const { results } = await db
    .prepare(sql)
    .bind(f.city, cityToday(f.city), ...w.binds, limit, offset)
    .all<RawEvent>();
  return results.map(mapEvent);
}

export async function countUpcomingEvents(db: D1Database, f: EventFilters): Promise<number> {
  const w = buildWhere(f);
  const row = await db
    .prepare(`SELECT COUNT(*) AS n FROM events e JOIN venues v ON v.id = e.venue_id WHERE ${w.sql}`)
    .bind(...w.binds)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/** One event by id, INCLUDING soft-deleted rows (the site renders "no longer listed"). */
export async function getEvent(db: D1Database, id: string): Promise<EventRow | null> {
  const today = todayDefault();
  const row = await db
    .prepare(
      `SELECT ${EVENT_COLS}, ${SERIES_SUBQ} FROM events e JOIN venues v ON v.id = e.venue_id WHERE e.id = ?`,
    )
    .bind(today, today, id.trim().toLowerCase())
    .first<RawEvent>();
  return row ? mapEvent(row) : null;
}

/** Events by id (any date, deleted included), chunked to stay under D1's bind cap; date order. */
export async function getEventsByIds(db: D1Database, ids: string[]): Promise<EventRow[]> {
  const unique = [...new Set(ids.map((id) => id.trim().toLowerCase()).filter(Boolean))];
  if (!unique.length) return [];
  const today = todayDefault();
  const out: EventRow[] = [];
  for (const part of chunk(unique, MAX_BINDS - 2)) {
    const sql = `SELECT ${EVENT_COLS}, ${SERIES_SUBQ} FROM events e JOIN venues v ON v.id = e.venue_id
      WHERE e.id IN (${part.map(() => '?').join(',')})`;
    const { results } = await db.prepare(sql).bind(today, today, ...part).all<RawEvent>();
    out.push(...results.map(mapEvent));
  }
  return out.sort(compareEvents);
}

function compareEvents(a: EventRow, b: EventRow): number {
  if (a.event_date !== b.event_date) return a.event_date < b.event_date ? -1 : 1;
  const at = a.start_time ?? '￿';
  const bt = b.start_time ?? '￿';
  if (at !== bt) return at < bt ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export async function listUpcomingEventsForVenue(db: D1Database, venueId: string, limit = 50): Promise<EventRow[]> {
  const today = todayDefault();
  const sql = `SELECT ${EVENT_COLS}, ${SERIES_SUBQ} FROM events e JOIN venues v ON v.id = e.venue_id
    WHERE e.venue_id = ? AND e.is_deleted = 0 AND e.event_date >= ? ${ORDER} LIMIT ?`;
  const { results } = await db
    .prepare(sql)
    .bind(today, today, venueId.trim().toLowerCase(), today, Math.min(Math.max(limit, 1), MAX_LIMIT))
    .all<RawEvent>();
  return results.map(mapEvent);
}

/** Distinct upcoming dates for the same normalised title at a venue. */
export async function listSeriesDates(db: D1Database, venueId: string, title: string): Promise<string[]> {
  const { results } = await db
    .prepare(
      `SELECT DISTINCT event_date FROM events WHERE venue_id = ? AND lower(trim(title)) = lower(trim(?))
         AND is_deleted = 0 AND event_date >= ? ORDER BY event_date`,
    )
    .bind(venueId.trim().toLowerCase(), title, todayDefault())
    .all<{ event_date: string }>();
  return results.map((r) => r.event_date);
}

// ---------------------------------------------------------------- multi-city (region groups / embeds)

export interface MultiCityOptions {
  /** City.name values (not slugs). Deduped; capped at MAX_CITIES. */
  cities: string[];
  categories?: string[];
  /** Inclusive 'YYYY-MM-DD'; defaults to today in `tz`. */
  from?: string;
  to?: string | null;
  /** Clamped to 1..MAX_LIMIT. */
  limit?: number;
  /** Zone for the default `from`; region groups pass their own. */
  tz?: string;
}

const MAX_CITIES = 60;
const MAX_CATEGORIES = 20;

/** WHERE for the multi-city contract. Binds: cities + [to] + from + categories — always < 90. */
function buildMultiCityWhere(o: MultiCityOptions): Where | null {
  const cities = [...new Set(o.cities.map((c) => c.trim()).filter(Boolean))].slice(0, MAX_CITIES);
  if (!cities.length) return null;
  const where = [`e.city IN (${cities.map(() => '?').join(',')})`, `e.is_deleted = 0`, `e.event_date >= ?`];
  const binds: unknown[] = [...cities, o.from ?? todayIn(o.tz ?? DEFAULT_TZ)];
  if (o.to) {
    where.push(`e.event_date <= ?`);
    binds.push(o.to);
  }
  const cats = [...new Set(o.categories ?? [])].slice(0, MAX_CATEGORIES);
  if (cats.length) {
    where.push(`e.category IN (${cats.map(() => '?').join(',')})`);
    binds.push(...cats);
  }
  return { sql: where.join(' AND '), binds };
}

/** Upcoming events across several cities (region-group embeds). No recurrence
 * info: series_count = 1, series_image = null. */
export async function listUpcomingEventsForCities(db: D1Database, o: MultiCityOptions): Promise<EventRow[]> {
  const w = buildMultiCityWhere(o);
  if (!w) return [];
  const limit = Math.min(Math.max(o.limit ?? 100, 1), MAX_LIMIT);
  const sql = `SELECT ${EVENT_COLS}, 1 AS series_count, NULL AS series_image
    FROM events e JOIN venues v ON v.id = e.venue_id WHERE ${w.sql} ${ORDER} LIMIT ?`;
  const { results } = await db.prepare(sql).bind(...w.binds, limit).all<RawEvent>();
  return results.map(mapEvent);
}

export async function countUpcomingEventsForCities(db: D1Database, o: MultiCityOptions): Promise<number> {
  const w = buildMultiCityWhere(o);
  if (!w) return 0;
  const row = await db
    .prepare(`SELECT COUNT(*) AS n FROM events e JOIN venues v ON v.id = e.venue_id WHERE ${w.sql}`)
    .bind(...w.binds)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

// ---------------------------------------------------------------- venues

export interface VenueListOptions {
  city: string;
  region?: string;
  /** Populate `upcoming` (count of upcoming non-deleted events) via a correlated subquery. */
  withUpcoming?: boolean;
}

function upcomingCol(withUpcoming: boolean | undefined): string {
  return withUpcoming
    ? `(SELECT COUNT(*) FROM events e WHERE e.venue_id = v.id AND e.is_deleted = 0 AND e.event_date >= ?) AS upcoming`
    : `0 AS upcoming`;
}

export async function listVenues(db: D1Database, o: VenueListOptions): Promise<VenueRow[]> {
  const binds: unknown[] = [];
  if (o.withUpcoming) binds.push(cityToday(o.city));
  const where = [`v.is_active = 1`, `v.city = ?`];
  binds.push(o.city);
  if (o.region) {
    where.push(`v.region = ?`);
    binds.push(o.region);
  }
  const { results } = await db
    .prepare(`SELECT ${VENUE_COLS}, ${upcomingCol(o.withUpcoming)} FROM venues v WHERE ${where.join(' AND ')} ORDER BY v.name`)
    .bind(...binds)
    .all<RawVenue>();
  return results.map(mapVenue);
}

/** One venue by id (active or not), with its upcoming count. */
export async function getVenue(db: D1Database, id: string): Promise<VenueRow | null> {
  const row = await db
    .prepare(`SELECT ${VENUE_COLS}, ${upcomingCol(true)} FROM venues v WHERE v.id = ?`)
    .bind(todayDefault(), id.trim().toLowerCase())
    .first<RawVenue>();
  return row ? mapVenue(row) : null;
}

/** Active venues whose name contains `name` (case-insensitive LIKE), optionally within a city. */
export async function searchVenuesByName(db: D1Database, name: string, city?: string, limit = 5): Promise<VenueRow[]> {
  const where = [`v.is_active = 1`, `v.name LIKE ? ESCAPE '\\'`];
  const binds: unknown[] = [`%${escapeLike(name.trim())}%`];
  if (city) {
    where.push(`v.city = ?`);
    binds.push(city);
  }
  const { results } = await db
    .prepare(`SELECT ${VENUE_COLS}, 0 AS upcoming FROM venues v WHERE ${where.join(' AND ')} ORDER BY v.name LIMIT ?`)
    .bind(...binds, Math.min(Math.max(limit, 1), 100))
    .all<RawVenue>();
  return results.map(mapVenue);
}

// ---------------------------------------------------------------- aggregates

/** Regions with upcoming events in a city, most events first. */
export async function listRegions(db: D1Database, city: string): Promise<{ region: string; count: number }[]> {
  const { results } = await db
    .prepare(
      `SELECT region, COUNT(*) AS count FROM events
       WHERE city = ? AND is_deleted = 0 AND event_date >= ? AND region IS NOT NULL AND region <> ''
       GROUP BY region ORDER BY count DESC, region`,
    )
    .bind(city, cityToday(city))
    .all<{ region: string; count: number }>();
  return results;
}

/**
 * Upcoming events per category. With `f`, every filter EXCEPT categories is
 * applied, so a chip can show how many events choosing it would yield.
 */
export async function categoryCounts(
  db: D1Database,
  city: string,
  f?: EventFilters,
): Promise<{ category: string; count: number }[]> {
  const w = buildWhere(f ? { ...f, city } : { city }, 'categories');
  const { results } = await db
    .prepare(
      `SELECT e.category, COUNT(*) AS count FROM events e JOIN venues v ON v.id = e.venue_id
       WHERE ${w.sql} AND e.category IS NOT NULL GROUP BY e.category ORDER BY count DESC, e.category`,
    )
    .bind(...w.binds)
    .all<{ category: string; count: number }>();
  return results;
}

// ---------------------------------------------------------------- sitemaps

export const SITEMAP_HORIZON_DAYS = 180;

/**
 * Event URLs worth submitting: upcoming, not deleted, within `horizonDays`, and
 * only the FIRST upcoming occurrence of each series (same lower(trim(title)) at
 * the same venue) so Google sees one page per recurring event instead of N
 * near-duplicates. Later dates stay crawlable from the event and venue pages.
 * `updated_at` feeds <lastmod>; since FindLocalData PR #28 the pipeline only
 * bumps it when a visible column changes.
 */
export async function listSitemapEvents(db: D1Database, horizonDays = SITEMAP_HORIZON_DAYS): Promise<{ id: string; updated_at: string }[]> {
  const today = todayDefault();
  const { results } = await db
    .prepare(
      `SELECT id, updated_at FROM (
         SELECT id, event_date, updated_at,
                ROW_NUMBER() OVER (PARTITION BY venue_id, lower(trim(title)) ORDER BY event_date, id) AS rn
         FROM events WHERE is_deleted = 0 AND event_date >= ?
       ) WHERE rn = 1 AND event_date <= ? ORDER BY event_date, id`,
    )
    .bind(today, addDays(today, horizonDays))
    .all<{ id: string; updated_at: string }>();
  return results;
}

/** Active venues that currently have at least one upcoming event (an empty venue page reads as a soft 404). */
export async function listSitemapVenues(db: D1Database): Promise<{ id: string; updated_at: string }[]> {
  const { results } = await db
    .prepare(
      `SELECT v.id, v.updated_at FROM venues v WHERE v.is_active = 1
         AND EXISTS (SELECT 1 FROM events e WHERE e.venue_id = v.id AND e.is_deleted = 0 AND e.event_date >= ?)
       ORDER BY v.name, v.id`,
    )
    .bind(todayDefault())
    .all<{ id: string; updated_at: string }>();
  return results;
}

/** Upcoming (non-deleted) event count per city name, for deciding which city pages to submit. */
export async function countUpcomingEventsByCity(db: D1Database): Promise<Map<string, number>> {
  const { results } = await db
    .prepare(`SELECT city, COUNT(*) AS count FROM events WHERE is_deleted = 0 AND event_date >= ? GROUP BY city`)
    .bind(todayDefault())
    .all<{ city: string; count: number }>();
  return new Map(results.map((r) => [r.city, r.count]));
}
