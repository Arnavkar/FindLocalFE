import { describe, expect, it } from 'vitest';
import { getCity, type EventRow, type VenueRow } from '@findlocal/shared';
import { blogPostingJsonLd, breadcrumbJsonLd, eventJsonLd, eventStartIso, itemListJsonLd, utcOffset, venueJsonLd, webSiteJsonLd } from '../src/lib/jsonld.js';

const boston = getCity('Boston')!;
const event: EventRow = {
  id: 'abc', venue_id: 'v1', city: 'Boston', region: 'Cambridge', source: 'scraper_cloudflare', external_id: null,
  title: 'Open Mic', description: null, event_date: '2026-09-11', start_time: '19:30', end_time: null,
  category: 'comedy', event_type: ['comedy'], performers: [], price: null, price_amount: 12, status: null,
  detail_page_url: null, ticket_page_url: 'https://tix.example/1', root_url: null, image_url: 'https://img.example/a.jpg',
  is_deleted: 0, first_seen_at: '', last_seen_at: '', updated_at: '',
  venue_name: 'The Comedy Studio', venue_address: '1 Bow St, Cambridge, MA', venue_image: null, venue_lat: 42.37, venue_lng: -71.12,
  venue_url: 'https://thecomedystudio.com', venue_type: 'comedy club', venue_region: 'Cambridge', series_count: 3, series_image: null,
};

describe('utcOffset / eventStartIso', () => {
  it('uses the city zone offset for the day (EDT in September, EST in December)', () => {
    expect(utcOffset('2026-09-11', 'America/New_York')).toBe('-04:00');
    expect(utcOffset('2026-12-11', 'America/New_York')).toBe('-05:00');
    expect(utcOffset('2026-07-01', 'America/Phoenix')).toBe('-07:00');
    expect(eventStartIso(event, boston.tz)).toBe('2026-09-11T19:30:00-04:00');
    expect(eventStartIso({ ...event, start_time: null }, boston.tz)).toBe('2026-09-11');
    expect(eventStartIso({ ...event, start_time: '7pm' }, boston.tz)).toBe('2026-09-11');
  });
});

describe('eventJsonLd', () => {
  it('has the Event/Place/PostalAddress/GeoCoordinates/Offer shape', () => {
    const ld = eventJsonLd(event, boston, 'A night of comedy.', 'https://img.example/a.jpg') as any;
    expect(ld['@type']).toBe('Event');
    expect(ld.url).toBe('https://findlocal.community/event/abc');
    expect(ld.startDate).toBe('2026-09-11T19:30:00-04:00');
    expect(ld.image).toEqual(['https://img.example/a.jpg']);
    expect(ld.eventStatus).toBe('https://schema.org/EventScheduled');
    expect(ld.location['@type']).toBe('Place');
    expect(ld.location.address).toEqual({ '@type': 'PostalAddress', streetAddress: '1 Bow St, Cambridge, MA', addressLocality: 'Boston', addressCountry: 'US' });
    expect(ld.location.geo).toEqual({ '@type': 'GeoCoordinates', latitude: 42.37, longitude: -71.12 });
    expect(ld.offers).toEqual({ '@type': 'Offer', price: 12, priceCurrency: 'USD', url: 'https://tix.example/1', availability: 'https://schema.org/InStock' });
    expect(ld.description).toBe('A night of comedy.');
  });
  it('emits performer as Person for people roles and PerformingGroup for acts', () => {
    const ld = eventJsonLd({ ...event, performers: [{ name: 'Ann Patchett', role: 'author', url: 'https://x/ap' }, { name: 'Big Thief', role: 'headliner' }] }, boston, '', null) as any;
    expect(ld.performer).toEqual([
      { '@type': 'Person', name: 'Ann Patchett', url: 'https://x/ap' },
      { '@type': 'PerformingGroup', name: 'Big Thief' },
    ]);
    expect((eventJsonLd(event, boston, '', null) as any).performer).toBeUndefined();
  });
  it('maps free events, cancelled status and missing price', () => {
    const free = eventJsonLd({ ...event, price_amount: null, price: 'Free' }, boston, '', null) as any;
    expect(free.offers.price).toBe(0);
    expect(free.image).toBeUndefined();
    const cancelled = eventJsonLd({ ...event, status: 'Cancelled' }, boston, '', null) as any;
    expect(cancelled.eventStatus).toBe('https://schema.org/EventCancelled');
    const noPrice = eventJsonLd({ ...event, price_amount: null, price: null }, boston, '', null) as any;
    expect(noPrice.offers).toEqual({ '@type': 'Offer', url: 'https://tix.example/1' });
    const nothing = eventJsonLd({ ...event, price_amount: null, price: null, ticket_page_url: null }, boston, '', null) as any;
    expect(nothing.offers).toBeUndefined();
  });
});

describe('other builders', () => {
  it('breadcrumbs, item list, website search action, place, blog posting', () => {
    const bc = breadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: 'Boston', path: '/city/boston' }]) as any;
    expect(bc.itemListElement[1]).toEqual({ '@type': 'ListItem', position: 2, name: 'Boston', item: 'https://findlocal.community/city/boston' });
    const il = itemListJsonLd('x', [event, { ...event, id: 'def' }], 120, 1) as any;
    expect(il.numberOfItems).toBe(120);
    expect(il.itemListElement).toHaveLength(1);
    expect(il.itemListElement[0].url).toBe('https://findlocal.community/event/abc');
    const ws = webSiteJsonLd(boston) as any;
    expect(ws.potentialAction.target.urlTemplate).toBe('https://findlocal.community/city/boston?q={search_term_string}');
    const venue: VenueRow = { id: 'v1', name: 'The Comedy Studio', city: 'Boston', region: 'Cambridge', url: 'https://thecomedystudio.com', address: '1 Bow St', description: null, image: null, type: null, venue_size: null, categories: [], latitude: 42.37, longitude: -71.12, is_active: 1, upcoming: 4 };
    const pl = venueJsonLd(venue, '') as any;
    expect(pl['@type']).toBe('Place');
    expect(pl.sameAs).toBe('https://thecomedystudio.com');
    expect(pl.url).toBe('https://findlocal.community/venue/v1');
    const bp = blogPostingJsonLd({ slug: 'a-post', title: 'T', description: 'D', date: '2026-08-29' }) as any;
    expect(bp['@type']).toBe('BlogPosting');
    expect(bp.dateModified).toBe('2026-08-29');
    expect(bp.url).toBe('https://findlocal.community/blog/a-post');
  });
});
