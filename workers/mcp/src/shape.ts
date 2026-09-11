// Response shapes for MCP customers. Kept close to the Supabase-era shapeEvent /
// shapeVenue so existing integrations see the same field names; `location` and
// `cover_image` are gone (no such columns in D1), `category` is new.
import { SITE, type EventRow, type VenueRow } from "@findlocal/shared";

function dropNulls<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== null && v !== undefined) out[k] = v;
  }
  return out as Partial<T>;
}

function isFree(e: EventRow): boolean | undefined {
  if (e.price_amount === 0) return true;
  if (e.price_amount !== null && e.price_amount > 0) return false;
  if (e.price && /free/i.test(e.price)) return true;
  return undefined;
}

export function shapeEvent(e: EventRow, withDescription = false) {
  return dropNulls({
    id: e.id,
    title: e.title,
    date: e.event_date,
    start_time: e.start_time,
    end_time: e.end_time,
    city: e.city,
    region: e.region ?? e.venue_region,
    venue: dropNulls({ id: e.venue_id, name: e.venue_name, address: e.venue_address }),
    category: e.category,
    category_tags: e.event_type,
    performers: e.performers.length ? e.performers.map((p) => ({ name: p.name, role: p.role })) : undefined,
    price_label: e.price,
    price_usd: e.price_amount,
    is_free: isFree(e),
    status: e.status,
    recurring: e.series_count > 1 ? true : undefined,
    upcoming_dates_in_series: e.series_count > 1 ? e.series_count : undefined,
    tickets_url: e.ticket_page_url,
    details_url: e.detail_page_url,
    image: e.image_url ?? e.series_image ?? e.venue_image,
    website: e.root_url ?? e.venue_url,
    url: `${SITE}/event/${e.id}`,
    source: e.source,
    description: withDescription ? e.description : undefined,
  });
}

export function shapeVenue(v: VenueRow) {
  return dropNulls({
    id: v.id,
    name: v.name,
    city: v.city,
    region: v.region,
    address: v.address,
    description: v.description,
    type: v.type,
    venue_size: v.venue_size,
    url: v.url,
    image: v.image,
    lat: v.latitude,
    lng: v.longitude,
    categories: v.categories,
    upcoming_events: v.upcoming || undefined,
    page: `${SITE}/venue/${v.id}`,
  });
}
