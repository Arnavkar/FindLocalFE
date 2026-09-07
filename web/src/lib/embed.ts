// Embeddable widget contract (pure, unit-tested). public/widget.js mirrors
// buildEmbedSrc so a `<script data-*>` tag and this module always agree on the
// iframe URL. Region groups come from @findlocal/shared/regions.
import {
  CATEGORY_SLUGS, cityBySlug, dateRangeFor, getCity, isYmd, parseFilters, regionGroupBySlug, SITE,
  type City, type EventFilters, type RegionGroup,
} from '@findlocal/shared';

export type EmbedView = 'list' | 'calendar' | 'map';
export type EmbedTheme = 'light' | 'dark' | 'auto';
export const EMBED_VIEWS: EmbedView[] = ['list', 'calendar', 'map'];
export const EMBED_THEMES: EmbedTheme[] = ['light', 'dark', 'auto'];
export const EMBED_DEFAULT_LIMIT = 100;
export const EMBED_MAX_LIMIT = 300;

/** Attributes a partner may set on the script tag (data-widget, data-region, ...). */
export interface EmbedAttrs {
  widget?: string;
  region?: string;
  city?: string;
  cat?: string;
  when?: string;
  view?: string;
  theme?: string;
  limit?: string;
  partner?: string;
}

/** Named presets; `data-widget="literary-new-england"` expands to region + cat. */
export const WIDGET_PRESETS: Record<string, { region?: string; city?: string; cat?: string }> = {
  'literary-new-england': { region: 'new-england', cat: 'literary' },
  'new-england': { region: 'new-england' },
};

const KEYS: (keyof EmbedAttrs)[] = ['region', 'city', 'cat', 'when', 'view', 'theme', 'limit', 'partner'];

/** Iframe URL for a set of attributes: preset expanded, explicit attrs win,
 * defaults dropped, keys sorted. KEEP IN SYNC WITH public/widget.js. */
export function buildEmbedSrc(origin: string, attrs: EmbedAttrs): string {
  const merged: Record<string, string> = {};
  const preset = attrs.widget ? WIDGET_PRESETS[attrs.widget.trim().toLowerCase()] : undefined;
  if (preset) Object.assign(merged, preset);
  for (const k of KEYS) {
    const v = attrs[k]?.trim();
    if (v) merged[k] = v;
  }
  if (merged.region) delete merged.city;
  if (merged.view === 'list' || (merged.view && !EMBED_VIEWS.includes(merged.view as EmbedView))) delete merged.view;
  if (merged.theme === 'auto' || (merged.theme && !EMBED_THEMES.includes(merged.theme as EmbedTheme))) delete merged.theme;
  if (merged.when === 'anytime') delete merged.when;
  if (merged.limit !== undefined) {
    const n = Number.parseInt(merged.limit, 10);
    if (!Number.isInteger(n) || n < 1 || n === EMBED_DEFAULT_LIMIT) delete merged.limit;
    else merged.limit = String(Math.min(n, EMBED_MAX_LIMIT));
  }
  const p = new URLSearchParams(merged);
  p.sort();
  const q = p.toString();
  return `${origin.replace(/\/$/, '')}/embed/events${q ? `?${q}` : ''}`;
}

export interface EmbedParams {
  group?: RegionGroup;
  city?: City;
  view: EmbedView;
  theme: EmbedTheme;
  limit: number;
  /** `from`/`to` when explicit YYYY-MM-DD params were given. */
  from?: string;
  to?: string | null;
  partner?: string;
  /** Copy of the request params without the embed-only keys, safe for parseFilters. */
  filterParams: URLSearchParams;
  error?: 'unknown-region' | 'unknown-city';
  /** utm_campaign value: preset name, or region/city + category. */
  campaign: string;
}

function pick<T extends string>(raw: string | null, allowed: readonly T[], fallback: T): T {
  const v = (raw ?? '').trim().toLowerCase() as T;
  return allowed.includes(v) ? v : fallback;
}

/** Server-side parse of the /embed/events query contract. */
export function parseEmbedParams(params: URLSearchParams): EmbedParams {
  const filterParams = new URLSearchParams(params);
  for (const k of ['region', 'city', 'view', 'theme', 'limit', 'partner', 'from', 'to']) filterParams.delete(k);
  const view = pick(params.get('view'), EMBED_VIEWS, 'list');
  const theme = pick(params.get('theme'), EMBED_THEMES, 'auto');
  const n = Number.parseInt(params.get('limit') ?? '', 10);
  const limit = Number.isInteger(n) && n > 0 ? Math.min(n, EMBED_MAX_LIMIT) : EMBED_DEFAULT_LIMIT;
  const partner = (params.get('partner') ?? '').trim().replace(/[^\w.-]/g, '').slice(0, 40) || undefined;
  const out: EmbedParams = { view, theme, limit, filterParams, campaign: '' };
  if (partner) out.partner = partner;
  const fromRaw = params.get('from');
  const toRaw = params.get('to');
  if (isYmd(fromRaw)) out.from = fromRaw;
  if (isYmd(toRaw)) out.to = toRaw;

  const regionRaw = params.get('region');
  const cityRaw = params.get('city');
  if (regionRaw) {
    const group = regionGroupBySlug(regionRaw);
    if (group) out.group = group;
    else out.error = 'unknown-region';
  } else if (cityRaw) {
    const city = cityBySlug(cityRaw) ?? getCity(cityRaw);
    if (city) out.city = city;
    else out.error = 'unknown-city';
  } else {
    out.city = getCity('Boston');
  }
  const cats = (params.get('cat') ?? '').split(',').map((s) => s.trim().toLowerCase()).filter((s) => CATEGORY_SLUGS.includes(s));
  const scope = out.group?.slug ?? out.city?.slug ?? 'unknown';
  out.campaign = cats.length ? `${scope}-${cats.join('-')}` : scope;
  return out;
}

/** Filters for a single-city embed (the site's contract, plus the explicit from/to override). */
export function embedCityFilters(p: EmbedParams, city: City, now: Date = new Date()): EventFilters {
  const f = parseFilters(p.filterParams, city, now);
  if (p.from) f.from = p.from;
  if (p.to !== undefined) f.to = p.to;
  f.limit = p.limit + 1;
  f.offset = 0;
  return f;
}

/** Date window for a region-group embed: explicit from/to, else `when` in the group tz. */
export function embedGroupRange(p: EmbedParams, group: RegionGroup, now: Date = new Date()): { from: string; to: string | null } {
  const when = (p.filterParams.get('when') ?? 'anytime').trim().toLowerCase();
  const range = dateRangeFor(when || 'anytime', group.tz, now);
  return { from: p.from ?? range.from, to: p.to !== undefined ? p.to : range.to };
}

function utm(campaign: string, partner?: string): string {
  const p = new URLSearchParams({ utm_source: 'widget', utm_medium: 'embed', utm_campaign: campaign });
  if (partner) p.set('utm_content', partner);
  return p.toString();
}

export function eventUrl(id: string, campaign: string, partner?: string): string {
  return `${SITE}/event/${id}?${utm(campaign, partner)}`;
}
export function venueUrl(id: string, campaign: string, partner?: string): string {
  return `${SITE}/venue/${id}?${utm(campaign, partner)}`;
}
export function siteUrl(path: string, campaign: string, partner?: string): string {
  return `${SITE}${path}?${utm(campaign, partner)}`;
}
