// Region groups: editorial bundles of metro partitions (City.slug) that the
// embeddable widgets and cross-city views query together. The database has no
// such column — events.city is always a single metro — so a group is resolved
// to City.name values here and passed to queries.ts as `e.city IN (...)`.
// Every slug must exist in cities.json (shared/test/pure.test.ts checks).
import { cityBySlug, type City } from './cities.js';

export interface RegionGroup {
  slug: string;
  name: string;
  /** City.slug values, in display order. */
  cities: string[];
  /** IANA zone used to resolve "today" for the whole group. */
  tz: string;
}

export const REGION_GROUPS: RegionGroup[] = [
  {
    slug: 'new-england',
    name: 'New England',
    tz: 'America/New_York',
    cities: [
      'boston', 'providence', 'hartford', 'new-haven', 'stamford', 'worcester', 'northampton', 'pittsfield',
      'cape-cod', 'portland-me', 'rockland', 'bangor', 'manchester', 'portsmouth', 'brattleboro', 'hanover',
      'rutland', 'burlington',
    ],
  },
];

const BY_SLUG = new Map(REGION_GROUPS.map((g) => [g.slug, g]));

export function regionGroupBySlug(slug: string | null | undefined): RegionGroup | undefined {
  if (!slug) return undefined;
  return BY_SLUG.get(slug.trim().toLowerCase());
}

/** Resolved City objects in group order; unknown slugs are skipped. */
export function regionGroupCities(g: RegionGroup): City[] {
  return g.cities.map((s) => cityBySlug(s)).filter((c): c is City => !!c);
}

/** City.name values for the query layer (`e.city IN (...)`). */
export function regionGroupCityNames(g: RegionGroup): string[] {
  return regionGroupCities(g).map((c) => c.name);
}
