import type { APIRoute } from 'astro';
import { PAGE_SIZE, getCity, cityBySlug, isUuid, parseFilters } from '@findlocal/shared';
import { jsonResponse } from '../../../lib/apiHeaders.js';
import { getDb, countUpcomingEvents, getEventsByIds, getVenue, listUpcomingEvents } from '../../../lib/db.js';
import { cityForVenue, parseLimit, venueFiltersFor } from '../../../lib/venueQuery.js';

const MAX_IDS = 200;

/**
 * GET /api/events?city=Boston&when=weekend&cat=music&free=1&tod=evening&region=&q=&page=
 *   — the same filter contract as the site (parseFilters); `limit` (<=500) optional.
 * GET /api/events?ids=<uuid>,<uuid>  — any date, deleted included (the /saved page).
 * GET /api/events?venue=<uuid>       — upcoming at one venue; the city comes from the
 *   venue (not `city=`), default limit 500, 404 for an unknown venue.
 */
export const GET: APIRoute = async ({ url }) => {
  const db = getDb();
  const p = url.searchParams;

  const idsRaw = p.get('ids');
  if (idsRaw) {
    const ids = idsRaw.split(',').map((s) => s.trim().toLowerCase()).filter(isUuid).slice(0, MAX_IDS);
    const data = ids.length ? await getEventsByIds(db, ids) : [];
    return jsonResponse({ data, meta: { count: data.length } });
  }

  const limit = parseLimit(p.get('limit'));
  const venueParam = p.get('venue');
  if (venueParam) {
    const venue = isUuid(venueParam) ? await getVenue(db, venueParam) : null;
    if (!venue) return jsonResponse({ error: 'venue not found' }, 404);
    const filters = venueFiltersFor(venue, p, limit);
    return page(cityForVenue(venue).name, filters, { venue: venue.id });
  }

  const cityParam = p.get('city');
  const city = getCity(cityParam) ?? cityBySlug(cityParam) ?? getCity('Boston')!;
  const filters = parseFilters(p, city);
  if (limit) filters.limit = limit;
  return page(city.name, filters);

  async function page(cityName: string, filters: Parameters<typeof listUpcomingEvents>[1], extra: Record<string, string> = {}) {
    const [data, total] = await Promise.all([listUpcomingEvents(db, filters), countUpcomingEvents(db, filters)]);
    return jsonResponse({
      data,
      meta: {
        city: cityName,
        ...extra,
        count: data.length,
        total,
        page: (filters.offset ?? 0) / PAGE_SIZE + 1,
        page_size: filters.limit ?? PAGE_SIZE,
      },
    });
  }
};

export const OPTIONS: APIRoute = () => jsonResponse(null, 204);
