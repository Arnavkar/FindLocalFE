// Astro on Cloudflare: bindings come from the cloudflare:workers module, not
// Astro.locals.runtime.env. Query helpers live in @findlocal/shared so the MCP
// worker, the JSON API and this site share identical query semantics — this
// file re-exports them so pages have one import and ZERO SQL of their own.
import type { D1Database } from '@cloudflare/workers-types';
import { env } from 'cloudflare:workers';

export function getDb(): D1Database {
  return (env as unknown as { DB: D1Database }).DB;
}

export {
  categoryCounts,
  countUpcomingEvents,
  countUpcomingEventsForCities,
  getEvent,
  getEventsByIds,
  getVenue,
  listRegions,
  listSeriesDates,
  listSitemapEvents,
  listSitemapVenues,
  listUpcomingEvents,
  listUpcomingEventsForCities,
  listUpcomingEventsForVenue,
  listVenues,
  type EventFilters,
  type EventRow,
  type VenueRow,
} from '@findlocal/shared';
