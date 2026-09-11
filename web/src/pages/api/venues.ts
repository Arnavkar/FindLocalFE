import type { APIRoute } from 'astro';
import { cityBySlug, getCity, type VenueSort } from '@findlocal/shared';
import { jsonResponse } from '../../lib/apiHeaders.js';
import { getDb, listVenues } from '../../lib/db.js';

const MAX_Q = 100;

/** Trim + collapse whitespace + cap length; undefined when empty. */
function text(raw: string | null): string | undefined {
  const s = (raw ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_Q);
  return s || undefined;
}

function sortOf(raw: string | null): VenueSort | undefined {
  return raw === 'upcoming' || raw === 'name' ? raw : undefined;
}

/**
 * GET /api/venues?city=Boston[&region=Cambridge][&q=sinclair][&type=bookstore][&sort=upcoming|name]
 *   — active venues with upcoming counts; `name` order by default.
 */
export const GET: APIRoute = async ({ url }) => {
  const p = url.searchParams;
  const cityParam = p.get('city');
  const city = getCity(cityParam) ?? cityBySlug(cityParam) ?? getCity('Boston')!;
  const region = text(p.get('region'));
  const q = text(p.get('q'));
  const type = text(p.get('type'));
  const sort = sortOf(p.get('sort'));
  const data = await listVenues(getDb(), { city: city.name, region, q, type, sort, withUpcoming: true });
  return jsonResponse({
    data,
    meta: { city: city.name, count: data.length, ...(region ? { region } : {}), ...(q ? { q } : {}), ...(type ? { type } : {}), ...(sort ? { sort } : {}) },
  });
};
