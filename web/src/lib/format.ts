// Presentation helpers (pure). Date/time formatting comes from
// @findlocal/shared/dates so the site never builds a local Date from a
// calendar day.
import { type Performer, addDays, categoryBySlug, formatEventDate, formatTime, todayIn, type EventRow } from '@findlocal/shared';

/** 'Free' | the source's price text | '$12' | ''. Mirrors the old EventCard. */
export function priceLabel(e: Pick<EventRow, 'price' | 'price_amount'>): string {
  if (e.price_amount === 0) return 'Free';
  if (e.price) return e.price.trim();
  if (e.price_amount != null && e.price_amount > 0) {
    return Number.isInteger(e.price_amount) ? `$${e.price_amount}` : `$${e.price_amount.toFixed(2)}`;
  }
  return '';
}

/** priceLabel(e), truncated for tight card pills: word-boundary cut before
 * `max` chars (never shorter than 6), plus an ellipsis. Used by the card
 * pill; the event detail page keeps the full label. */
export function shortPriceLabel(e: Pick<EventRow, 'price' | 'price_amount'>, max = 14): string {
  const full = priceLabel(e);
  if (full.length <= max) return full;
  const cut = full.slice(0, max);
  const sp = cut.lastIndexOf(' ');
  return `${sp >= 6 ? cut.slice(0, sp) : cut.slice(0, 6)}…`;
}

/** Category display label for a slug (falls back to the raw value). */
export function categoryLabel(slug: string | null | undefined): string {
  if (!slug) return '';
  return categoryBySlug(slug)?.label ?? slug;
}

/** Card date line: 'FRI · SEP 4 · 7:30 PM' (uppercase via CSS). */
export function cardDateLabel(e: Pick<EventRow, 'event_date' | 'start_time'>, tz: string): string {
  const day = formatEventDate(e.event_date, tz, { weekday: 'short', month: 'short', day: 'numeric' }).replace(', ', ' · ');
  const t = formatTime(e.start_time);
  return t ? `${day} · ${t}` : day;
}

/** Day header in a list: 'Today · Friday, September 4' / 'Saturday, September 5'. */
export function dayHeader(ymd: string, tz: string, now: Date = new Date()): string {
  const long = formatEventDate(ymd, tz, { weekday: 'long', month: 'long', day: 'numeric' });
  const today = todayIn(tz, now);
  if (ymd === today) return `Today · ${long}`;
  if (ymd === addDays(today, 1)) return `Tomorrow · ${long}`;
  return long;
}

/** Long single-event date: 'Friday, September 4, 2026'. */
export function longDate(ymd: string, tz: string): string {
  return formatEventDate(ymd, tz, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

/** Short date for titles / meta: 'Sep 4, 2026'. */
export function shortDate(ymd: string, tz: string): string {
  return formatEventDate(ymd, tz, { month: 'short', day: 'numeric', year: 'numeric' });
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  ndash: '–', mdash: '—', hellip: '…', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
};

/** Strip tags/entities and collapse whitespace (source descriptions are often
 * HTML fragments). Ported from the old Pages Functions' cleanMetaDescription. */
export function cleanText(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<br\s*\/?>|<\/p>|<\/li>|<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16) || 32))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(parseInt(dec, 10) || 32))
    .replace(/&([a-z]+);/gi, (m: string, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? m)
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

/** Single-line, whitespace-collapsed, truncated at a word boundary. */
export function truncate(text: string, max = 160): string {
  const one = text.replace(/\s+/g, ' ').trim();
  if (one.length <= max) return one;
  const cut = one.slice(0, max - 1);
  const sp = cut.lastIndexOf(' ');
  return `${sp > max * 0.6 ? cut.slice(0, sp) : cut}…`;
}

/** Image fallback chain from the plan: own image → series sibling → venue image → placeholder (null). */
export function eventImage(e: Pick<EventRow, 'image_url' | 'series_image' | 'venue_image'>): string | null {
  return e.image_url || e.series_image || e.venue_image || null;
}

/** Outbound link for tickets / details. */
export function eventLink(e: Pick<EventRow, 'ticket_page_url' | 'detail_page_url' | 'root_url' | 'venue_url'>): { href: string; label: string } | null {
  if (e.ticket_page_url) return { href: e.ticket_page_url, label: 'Buy tickets' };
  const href = e.detail_page_url || e.root_url || e.venue_url;
  return href ? { href, label: 'Visit event page' } : null;
}

/** "Featuring A, B and C" / "Author: Ann Patchett" / "Instructor: …" — one line for the event page. */
export function performersLabel(performers: Performer[]): string {
  if (!performers.length) return '';
  const names = performers.slice(0, 6).map((p) => p.name);
  const more = performers.length > 6 ? ` +${performers.length - 6} more` : '';
  const joined = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0]!;
  const roles = new Set(performers.map((p) => p.role));
  const single = roles.size === 1 ? [...roles][0] : undefined;
  const prefix: Record<string, string> = { author: 'Author', instructor: 'Instructor', speaker: 'Speaker', host: 'Host', comedian: 'Comedian', dj: 'DJ' };
  if (single && prefix[single]) return `${prefix[single]}${names.length > 1 ? 's' : ''}: ${joined}${more}`;
  return `Featuring ${joined}${more}`;
}

export function pluralize(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
