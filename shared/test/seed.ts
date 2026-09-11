// Deterministic fixture: ~60 events across Boston + New York. Dates are
// relative to today in America/New_York so "upcoming" semantics hold.
import type { D1Database } from '@cloudflare/workers-types';
import { addDays, todayIn } from '../src/dates.js';

export const TZ = 'America/New_York';
export const TODAY = todayIn(TZ);
export const D = (n: number) => addDays(TODAY, n);

export const V = {
  sinclair: '11111111-1111-4111-8111-111111111111', // Boston, Cambridge
  paradise: '22222222-2222-4222-8222-222222222222', // Boston, Allston
  brighton: '33333333-3333-4333-8333-333333333333', // New York, Brooklyn
  mercury: '44444444-4444-4444-8444-444444444444', // New York, Manhattan
  closed: '55555555-5555-4555-8555-555555555555', // Boston, inactive
  athenaeum: '66666666-6666-4666-8666-666666666666', // Providence, RI
  longfellow: '77777777-7777-4777-8777-777777777777', // Portland ME
};

interface Ev {
  id?: string;
  venue: string;
  city: string;
  region?: string | null;
  title: string;
  date: string;
  time?: string | null;
  category?: string | null;
  event_type?: string[];
  price?: string | null;
  price_amount?: number | null;
  image?: string | null;
  deleted?: boolean;
  source?: string;
  performers?: { name: string; role: string; url?: string }[] | string[];
}

let n = 0;
export const eid = (i: number) => `aaaaaaaa-0000-4000-8000-${String(i).padStart(12, '0')}`;

export const EVENTS: Required<Ev>[] = [];
function ev(e: Ev) {
  n++;
  EVENTS.push({
    id: e.id ?? eid(n),
    venue: e.venue,
    city: e.city,
    region: e.region === undefined ? null : e.region,
    title: e.title,
    date: e.date,
    time: e.time === undefined ? '20:00' : e.time,
    category: e.category === undefined ? 'music' : e.category,
    event_type: e.event_type ?? ['music'],
    price: e.price === undefined ? null : e.price,
    price_amount: e.price_amount === undefined ? null : e.price_amount,
    image: e.image === undefined ? null : e.image,
    deleted: e.deleted ?? false,
    source: e.source ?? 'scraper_cloudflare',
    performers: e.performers ?? [],
  });
}

// Boston: weekly recurring trivia at the Sinclair, 8 weeks (first two imageless).
for (let w = 0; w < 8; w++) {
  ev({ venue: V.sinclair, city: 'Boston', region: 'Cambridge', title: 'Trivia Night', date: D(1 + w * 7), time: '19:00', category: 'nightlife', event_type: ['trivia'], price: 'Free', image: w < 2 ? null : `https://img/trivia-${w}.jpg` });
}
// Boston singletons, various times / prices / categories.
ev({ venue: V.sinclair, city: 'Boston', region: 'Cambridge', title: 'Morning Yoga', date: D(2), time: '08:00', category: 'fitness', event_type: ['yoga'], price: '$15', price_amount: 15 });
ev({ venue: V.sinclair, city: 'Boston', region: 'Cambridge', title: 'Afternoon Jazz', date: D(2), time: '14:30', category: 'music', event_type: ['Live Jazz Music'], price: '$25.00', price_amount: 25, performers: [{ name: 'Esperanza Spalding', role: 'headliner', url: 'https://example.com/zzqurltoken' }, { name: 'Local Trio', role: 'support' }] });
ev({ venue: V.sinclair, city: 'Boston', region: 'Cambridge', title: 'Late Show', date: D(2), time: '23:30', category: 'comedy', event_type: ['comedy'], price: '$40', price_amount: 40 });
ev({ venue: V.sinclair, city: 'Boston', region: 'Cambridge', title: 'After Hours DJ', date: D(3), time: '01:00', category: 'nightlife', event_type: ['dj set'], price: '$10', price_amount: 10 });
ev({ venue: V.paradise, city: 'Boston', region: 'Allston', title: 'The Headliners', date: D(0), time: '20:00', category: 'music', price: '$35.50', price_amount: 35.5, source: 'ticketmaster', image: 'https://img/headliners.jpg' });
ev({ venue: V.paradise, city: 'Boston', region: 'Allston', title: 'Free Community Night', date: D(1), time: null, category: 'community', event_type: ['community'], price: 'Free admission' });
ev({ venue: V.paradise, city: 'Boston', region: 'Allston', title: 'Uncategorised Thing', date: D(4), time: '18:00', category: null, event_type: [] });
ev({ venue: V.paradise, city: 'Boston', region: null, title: 'No Region Show', date: D(5), time: '19:30', category: 'theater', event_type: ['play'], price: '$20', price_amount: 20 });
ev({ venue: V.paradise, city: 'Boston', region: 'Allston', title: 'Deleted Gig', date: D(6), time: '20:00', deleted: true, price: '$12', price_amount: 12 });
ev({ venue: V.paradise, city: 'Boston', region: 'Allston', title: 'Past Gig', date: D(-3), time: '20:00', price: '$12', price_amount: 12 });
ev({ venue: V.paradise, city: 'Boston', region: 'Allston', title: 'Priced Text Only', date: D(7), time: '20:00', price: '$18 adv / $22 door' });
ev({ venue: V.paradise, city: 'Boston', region: 'Allston', title: 'Weekend Fest', date: D(8), time: '12:00', category: 'festival', event_type: ['festival'], price: '$0', price_amount: 0 });
ev({ venue: V.paradise, city: 'Boston', region: 'Allston', title: 'Weird % Under_score', date: D(9), time: '20:00' });
ev({ venue: V.closed, city: 'Boston', region: 'Somerville', title: 'Closed Venue Show', date: D(3), time: '20:00' });
// Two rows same title+venue+date (different external ids) -> one series date.
ev({ venue: V.sinclair, city: 'Boston', region: 'Cambridge', title: 'Double Booked', date: D(10), time: '19:00', source: 'ticketmaster' });
ev({ venue: V.sinclair, city: 'Boston', region: 'Cambridge', title: 'double booked ', date: D(10), time: '21:00', source: 'seatgeek' });
// Fill Boston to ~40 with dated filler for paging / date windows (days 0..21).
for (let i = 0; i < 20; i++) {
  ev({ venue: i % 2 ? V.sinclair : V.paradise, city: 'Boston', region: i % 2 ? 'Cambridge' : 'Allston', title: `Filler ${i}`, date: D(i + 1), time: i % 3 === 0 ? '10:00' : i % 3 === 1 ? '15:00' : '21:00', category: i % 4 === 0 ? 'comedy' : 'music', price: i % 5 === 0 ? 'Free' : '$30', price_amount: i % 5 === 0 ? 0 : 30 });
}
// New York.
for (let w = 0; w < 4; w++) {
  ev({ venue: V.brighton, city: 'New York', region: 'Brooklyn', title: 'Open Mic', date: D(2 + w * 7), time: '19:00', category: 'comedy', event_type: ['open mic'], price: 'Free', image: 'https://img/openmic.jpg' });
}
ev({ venue: V.mercury, city: 'New York', region: 'Manhattan', title: 'NYC Morning Run', date: D(1), time: '06:30', category: 'fitness', price: 'Free', price_amount: 0 });
ev({ venue: V.mercury, city: 'New York', region: 'Manhattan', title: 'NYC Big Ticket', date: D(1), time: '20:00', category: 'music', price: '$120', price_amount: 120, source: 'ticketmaster' });
ev({ venue: V.mercury, city: 'New York', region: 'Manhattan', title: 'NYC Deleted', date: D(2), time: '20:00', deleted: true });
ev({ venue: V.mercury, city: 'New York', region: 'Manhattan', title: 'NYC Past', date: D(-1), time: '20:00' });
for (let i = 0; i < 12; i++) {
  ev({ venue: i % 2 ? V.mercury : V.brighton, city: 'New York', region: i % 2 ? 'Manhattan' : 'Brooklyn', title: `NYC Filler ${i}`, date: D(i + 1), time: '20:00', category: i % 3 === 0 ? 'art' : 'music', price: '$25', price_amount: 25 });
}

// New England literary fixture (region-group / multi-city queries).
ev({ venue: V.sinclair, city: 'Boston', region: 'Cambridge', title: 'Poetry Reading', date: D(3), time: '19:00', category: 'literary', event_type: ['poetry'], price: 'Free', price_amount: 0 });
ev({ venue: V.athenaeum, city: 'Providence', region: 'Providence', title: 'Author Talk: Debut Novel', date: D(2), time: '18:00', category: 'literary', event_type: ['author talk'], price: 'Free', price_amount: 0, performers: ['Legacy Stringname'] });
ev({ venue: V.athenaeum, city: 'Providence', region: 'Providence', title: 'Book Club', date: D(5), time: '18:30', category: 'literary', event_type: ['book club'] });
ev({ venue: V.athenaeum, city: 'Providence', region: 'Providence', title: 'Cancelled Signing', date: D(9), time: '18:00', category: 'literary', deleted: true });
ev({ venue: V.athenaeum, city: 'Providence', region: 'Providence', title: 'Athenaeum Concert', date: D(4), time: '20:00', category: 'music' });
ev({ venue: V.longfellow, city: 'Portland ME', region: 'Portland', title: 'Longfellow Lecture', date: D(2), time: '19:00', category: 'literary', event_type: ['author event'] });
ev({ venue: V.longfellow, city: 'Portland ME', region: 'Portland', title: 'Story Hour', date: D(5), time: '10:00', category: 'literary', event_type: ['storytelling'], price: 'Free', price_amount: 0 });
ev({ venue: V.longfellow, city: 'Portland ME', region: 'Portland', title: 'Writers Workshop', date: D(9), time: '18:00', category: 'literary', event_type: ['writing'] });
ev({ venue: V.mercury, city: 'New York', region: 'Manhattan', title: 'NYC Poetry Slam', date: D(2), time: '20:00', category: 'literary', event_type: ['poetry'] });

export async function seed(db: D1Database): Promise<void> {
  const venues = [
    [V.sinclair, 'The Sinclair', 'Boston', 'Cambridge', 'https://sinclair.test', '52 Church St, Cambridge, MA', 'https://img/sinclair.jpg', 'music venue', '["music","nightlife"]', 42.373, -71.119, 1],
    [V.paradise, 'Paradise Rock Club', 'Boston', 'Allston', 'https://paradise.test', '967 Commonwealth Ave, Boston, MA', null, 'music venue', '["music"]', 42.351, -71.119, 1],
    [V.brighton, 'Brighton Music Hall', 'New York', 'Brooklyn', null, '3 Brooklyn Ave', null, 'comedy club', '["comedy"]', 40.65, -73.95, 1],
    [V.mercury, 'Mercury Lounge', 'New York', 'Manhattan', 'https://mercury.test', '217 E Houston St', 'https://img/mercury.jpg', 'music venue', '["music"]', 40.72, -73.98, 1],
    [V.closed, 'Closed Club', 'Boston', 'Somerville', null, null, null, 'bar', '[]', null, null, 0],
    [V.athenaeum, 'Providence Athenaeum', 'Providence', 'Providence', 'https://athenaeum.test', '251 Benefit St, Providence, RI', null, 'library', '["literary"]', 41.826, -71.406, 1],
    [V.longfellow, 'Longfellow Books', 'Portland ME', 'Portland', 'https://longfellow.test', '1 Monument Way, Portland, ME', null, 'bookstore', '["literary"]', 43.657, -70.258, 1],
  ];
  const vs = db.prepare(
    `INSERT INTO venues (id, name, city, region, url, address, image, type, categories, latitude, longitude, is_active)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
  );
  const es = db.prepare(
    `INSERT INTO events (id, venue_id, city, region, source, external_id, title, event_date, start_time, category,
       event_type, performers, price, price_amount, image_url, is_deleted, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  );
  await db.batch([
    ...venues.map((v) => vs.bind(...v)),
    ...EVENTS.map((e, i) =>
      es.bind(e.id, e.venue, e.city, e.region, e.source, `ext-${i}`, e.title, e.date, e.time, e.category,
        JSON.stringify(e.event_type), JSON.stringify(e.performers), e.price, e.price_amount, e.image, e.deleted ? 1 : 0, `2026-01-01T00:00:${String(i % 60).padStart(2, '0')}.000Z`),
    ),
  ]);
}
