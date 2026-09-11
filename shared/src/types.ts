// Row shapes returned by shared/src/queries.ts. JSON columns (event_type,
// performers, categories) are parsed by the query mappers; booleans stay 0/1 as in D1.

/** One entry of events.performers (JSON column, migration 0005). `role` is one of
 * headliner | support | performer | author | instructor | speaker | host | comedian | dj. */
export interface Performer {
  name: string;
  role: string;
  source_id?: string;
  url?: string;
  image?: string;
}

export interface EventRow {
  id: string;
  venue_id: string;
  city: string;
  region: string | null;
  source: string;
  external_id: string | null;
  title: string;
  description: string | null;
  /** Plain calendar day 'YYYY-MM-DD'. Never new Date() it. */
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  category: string | null;
  event_type: string[];
  /** People the event is by or about (authors, the bill, instructors). Empty when unknown. */
  performers: Performer[];
  price: string | null;
  price_amount: number | null;
  status: string | null;
  detail_page_url: string | null;
  ticket_page_url: string | null;
  root_url: string | null;
  image_url: string | null;
  /** 1 when the source stopped listing the event. listUpcomingEvents hides
   * these unless includeDeleted; getEvent returns them so /event/<id> can
   * render an honest "no longer listed" state. */
  is_deleted: number;
  first_seen_at: string;
  last_seen_at: string;
  updated_at: string;
  venue_name: string;
  venue_address: string | null;
  venue_image: string | null;
  venue_lat: number | null;
  venue_lng: number | null;
  venue_url: string | null;
  venue_type: string | null;
  venue_region: string | null;
  /** Distinct upcoming dates sharing lower(trim(title)) at this venue (>1 = recurring). */
  series_count: number;
  /** First non-empty image_url in the series (only when series_count > 1). */
  series_image: string | null;
}

export interface VenueRow {
  id: string;
  name: string;
  city: string;
  region: string | null;
  url: string | null;
  address: string | null;
  description: string | null;
  image: string | null;
  type: string | null;
  venue_size: string | null;
  categories: string[];
  latitude: number | null;
  longitude: number | null;
  is_active: number;
  /** Upcoming non-deleted event count (0 unless requested via withUpcoming). */
  upcoming: number;
}
