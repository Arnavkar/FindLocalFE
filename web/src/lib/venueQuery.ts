// Pure helpers for `/api/events?venue=<uuid>`: the venue decides the city (so
// "today" and the recurrence CTE are computed in the right zone), not the
// Boston default that plain feed queries fall back to.
import { getCity, parseFilters, type City, type EventFilters, type VenueRow } from '@findlocal/shared';

export const VENUE_DEFAULT_LIMIT = 500;
export const API_MAX_LIMIT = 500;

/** Clamp an optional `limit` query value to 1..API_MAX_LIMIT; undefined when absent/invalid. */
export function parseLimit(raw: string | null): number | undefined {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? Math.min(n, API_MAX_LIMIT) : undefined;
}

/** City for a venue row (falls back to Boston only for unknown city names). */
export function cityForVenue(venue: Pick<VenueRow, 'city'>): City {
  return getCity(venue.city) ?? getCity('Boston')!;
}

/** Filters for one venue: the shared contract parsed in the venue's city, pinned to the venue, default limit 500. */
export function venueFiltersFor(venue: Pick<VenueRow, 'id' | 'city'>, params: URLSearchParams, limit?: number, now = new Date()): EventFilters {
  const f = parseFilters(params, cityForVenue(venue), now);
  f.venueId = venue.id.toLowerCase();
  f.limit = limit ?? VENUE_DEFAULT_LIMIT;
  return f;
}
