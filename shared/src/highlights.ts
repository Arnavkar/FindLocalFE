// Editorial ranking for "highlight" rails (site home, app home rows). Pure and
// deterministic: score each listing by how complete it is (image, description,
// people, price), give a small nudge to the next day or two, then pick greedily
// with variety — repeats of a category or venue cost points, and a recurring
// series appears at most once. Input order (date/time) breaks ties, so the
// earlier of two equal listings wins.
import { daysBetween } from './dates.js';
import type { EventRow } from './types.js';

export const HIGHLIGHT_LIMIT = 10;

/** 0..~9: own image 3, description up to 2.5, people up to 2.5, price 0.5, time 0.25. */
export function highlightScore(e: EventRow): number {
  let s = 0;
  if (e.image_url) s += 3;
  else if (e.series_image || e.venue_image) s += 1.5;
  const words = (e.description ?? '').trim().length;
  if (words >= 400) s += 2.5;
  else if (words >= 160) s += 2;
  else if (words >= 60) s += 1;
  const people = e.performers ?? [];
  if (people.length) {
    s += 1.5 + Math.min(people.length - 1, 2) * 0.25;
    if (people.some((p) => p.image)) s += 0.5;
  }
  if (e.price_amount !== null || (e.price ?? '').trim() !== '') s += 0.5;
  if (e.start_time) s += 0.25;
  return s;
}

/** Sooner is better on a home page: today +1, tomorrow +0.6, next two days +0.3. */
export function soonBonus(e: EventRow, today?: string): number {
  if (!today) return 0;
  const d = daysBetween(today, e.event_date);
  if (d <= 0) return 1;
  if (d === 1) return 0.6;
  return d <= 3 ? 0.3 : 0;
}

const CATEGORY_REPEAT = 1.25;
const VENUE_REPEAT = 2;

function seriesKey(e: EventRow): string {
  return `${e.venue_id}|${e.title.trim().toLowerCase()}`;
}

export interface PickOptions {
  limit?: number;
  /** 'YYYY-MM-DD' in the city zone; enables the soon bonus. */
  today?: string;
}

/**
 * Up to `limit` events for a rail, best first. `events` should be the
 * date/time-ordered pool (e.g. one page of listUpcomingEvents).
 */
export function pickHighlights(events: EventRow[], opts: PickOptions = {}): EventRow[] {
  const limit = opts.limit ?? HIGHLIGHT_LIMIT;
  const pool = events.map((e) => ({ e, base: highlightScore(e) + soonBonus(e, opts.today) }));
  const catCount = new Map<string, number>();
  const venueCount = new Map<string, number>();
  const seen = new Set<string>();
  const out: EventRow[] = [];
  while (out.length < limit && pool.length) {
    let best = -1;
    let bestScore = -Infinity;
    for (let i = 0; i < pool.length; i++) {
      const c = pool[i]!;
      const score =
        c.base - CATEGORY_REPEAT * (catCount.get(c.e.category ?? '') ?? 0) - VENUE_REPEAT * (venueCount.get(c.e.venue_id) ?? 0);
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
    const [pick] = pool.splice(best, 1);
    if (!pick) break;
    const key = seriesKey(pick.e);
    if (seen.has(key)) continue;
    seen.add(key);
    catCount.set(pick.e.category ?? '', (catCount.get(pick.e.category ?? '') ?? 0) + 1);
    venueCount.set(pick.e.venue_id, (venueCount.get(pick.e.venue_id) ?? 0) + 1);
    out.push(pick.e);
  }
  return out;
}
