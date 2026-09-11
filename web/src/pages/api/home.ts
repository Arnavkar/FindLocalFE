import type { APIRoute } from 'astro';
import { cityBySlug, getCity } from '@findlocal/shared';
import { jsonResponse } from '../../lib/apiHeaders.js';
import { getDb } from '../../lib/db.js';
import { loadHomeRails } from '../../lib/home.js';

/**
 * GET /api/home?city=Boston — the curated home rails (Highlights, Today/Tonight,
 * This weekend, Free, one per category) as the site's home page shows them.
 * Each rail: { key, title, total, query, events[] }; `query` is the /api/events
 * (and site) query string for its "See all" view. Edge-cached like /api/events.
 */
export const GET: APIRoute = async ({ url }) => {
  const cityParam = url.searchParams.get('city');
  const city = getCity(cityParam) ?? cityBySlug(cityParam) ?? getCity('Boston')!;
  const rails = await loadHomeRails(getDb(), city);
  return jsonResponse({ data: rails, meta: { city: city.name, tz: city.tz } });
};

export const OPTIONS: APIRoute = () => jsonResponse(null, 204);
