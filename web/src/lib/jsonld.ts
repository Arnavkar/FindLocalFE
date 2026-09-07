// schema.org JSON-LD builders (pure, unit-tested). Shapes carried over from
// the Expo-era Pages Functions so Search Console sees no regression.
import { SITE, canonicalUrl, type City, type EventRow, type VenueRow } from '@findlocal/shared';

const SITE_NAME = 'Find Local';
const SITE_DESCRIPTION =
  'Discover the best local events near you. Browse concerts, comedy shows, live music, theater, and cultural experiences across 47 US cities. Free and paid events updated daily.';

/** UTC offset ('-04:00') for noon on `ymd` in `tz`, so Event.startDate is honest per city. */
export function utcOffset(ymd: string, tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' }).formatToParts(
      new Date(`${ymd}T12:00:00Z`),
    );
    const raw = parts.find((p) => p.type === 'timeZoneName')?.value ?? '';
    const m = /GMT([+-]\d{2}:\d{2})/.exec(raw);
    if (m) return m[1] as string;
    if (raw === 'GMT') return '+00:00';
  } catch {
    /* fall through */
  }
  return '-05:00';
}

/** 'HH:MM' | 'HH:MM:SS' -> 'HH:MM:SS' or null. */
function normTime(t: string | null | undefined): string | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(t.trim());
  if (!m) return null;
  const h = Number(m[1]);
  if (h > 23) return null;
  return `${String(h).padStart(2, '0')}:${m[2]}:${m[3] ?? '00'}`;
}

/** ISO-8601 startDate with the city's offset; the bare day when no time. */
export function eventStartIso(e: Pick<EventRow, 'event_date' | 'start_time'>, tz: string): string {
  const t = normTime(e.start_time);
  return t ? `${e.event_date}T${t}${utcOffset(e.event_date, tz)}` : e.event_date;
}

function eventStatus(status: string | null): string {
  const s = (status ?? '').toLowerCase();
  if (s.includes('cancel')) return 'https://schema.org/EventCancelled';
  if (s.includes('postpone')) return 'https://schema.org/EventPostponed';
  if (s.includes('resched')) return 'https://schema.org/EventRescheduled';
  return 'https://schema.org/EventScheduled';
}

function isFree(e: Pick<EventRow, 'price' | 'price_amount'>): boolean {
  return e.price_amount === 0 || /\bfree\b/i.test(e.price ?? '');
}

function place(name: string, address: string | null, city: string, lat: number | null, lng: number | null) {
  return {
    '@type': 'Place',
    name,
    address: {
      '@type': 'PostalAddress',
      ...(address ? { streetAddress: address } : {}),
      addressLocality: city,
      addressCountry: 'US',
    },
    ...(lat != null && lng != null ? { geo: { '@type': 'GeoCoordinates', latitude: lat, longitude: lng } } : {}),
  };
}

export function organizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: `${SITE}/`,
    logo: `${SITE}/logo.webp`,
    email: 'findlocalinternal@gmail.com',
    sameAs: ['https://www.instagram.com/findl0cal/'],
  };
}

export function webSiteJsonLd(defaultCity: City) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: `${SITE}/`,
    description: SITE_DESCRIPTION,
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: `${SITE}/city/${defaultCity.slug}?q={search_term_string}` },
      'query-input': 'required name=search_term_string',
    },
  };
}

export function webApplicationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: SITE_NAME,
    url: SITE,
    description: SITE_DESCRIPTION,
    applicationCategory: 'EntertainmentApplication',
    operatingSystem: 'Web',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    areaServed: { '@type': 'Country', name: 'United States' },
  };
}

export interface Crumb {
  name: string;
  path: string;
}

export function breadcrumbJsonLd(crumbs: Crumb[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      item: canonicalUrl(c.path),
    })),
  };
}

export function itemListJsonLd(name: string, events: Pick<EventRow, 'id' | 'title'>[], total: number, max = 25) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name,
    numberOfItems: total,
    itemListElement: events.slice(0, max).map((e, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: e.title,
      url: canonicalUrl(`/event/${e.id}`),
    })),
  };
}

export function eventJsonLd(e: EventRow, city: City, description: string, image: string | null) {
  const url = canonicalUrl(`/event/${e.id}`);
  const hasPrice = e.price_amount != null || isFree(e);
  return {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: e.title,
    ...(description ? { description: description.slice(0, 500) } : {}),
    startDate: eventStartIso(e, city.tz),
    ...(image ? { image: [image] } : {}),
    url,
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    eventStatus: eventStatus(e.status),
    location: place(e.venue_name, e.venue_address, e.city, e.venue_lat, e.venue_lng),
    organizer: { '@type': 'Organization', name: e.venue_name, ...(e.venue_url ? { url: e.venue_url } : {}) },
    ...(hasPrice
      ? {
          offers: {
            '@type': 'Offer',
            price: isFree(e) ? 0 : e.price_amount,
            priceCurrency: 'USD',
            url: e.ticket_page_url || e.detail_page_url || url,
            availability: 'https://schema.org/InStock',
          },
        }
      : e.ticket_page_url
        ? { offers: { '@type': 'Offer', url: e.ticket_page_url, ...(e.price ? { description: e.price } : {}) } }
        : {}),
  };
}

export function venueJsonLd(v: VenueRow, description: string) {
  const url = canonicalUrl(`/venue/${v.id}`);
  return {
    '@context': 'https://schema.org',
    ...place(v.name, v.address, v.city, v.latitude, v.longitude),
    ...(description ? { description: description.slice(0, 500) } : {}),
    ...(v.image ? { image: v.image } : {}),
    url,
    ...(v.url ? { sameAs: v.url } : {}),
  };
}

export interface BlogMeta {
  slug: string;
  title: string;
  description: string;
  date: string;
  updated?: string | undefined;
  author?: string | undefined;
  image?: string | undefined;
}

export function blogPostingJsonLd(p: BlogMeta) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: p.title,
    description: p.description,
    datePublished: p.date,
    dateModified: p.updated ?? p.date,
    author: { '@type': 'Organization', name: p.author ?? SITE_NAME },
    publisher: { '@type': 'Organization', name: SITE_NAME, logo: { '@type': 'ImageObject', url: `${SITE}/logo.webp` } },
    image: p.image ?? `${SITE}/og-default.png`,
    url: canonicalUrl(`/blog/${p.slug}`),
    mainEntityOfPage: canonicalUrl(`/blog/${p.slug}`),
  };
}
