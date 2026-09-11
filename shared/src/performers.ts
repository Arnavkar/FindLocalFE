// Pure helpers over EventRow.performers (JSON column, migration 0005): role
// labels, the "lead" name for a card line, and grouping for a "Who" section.
import type { Performer } from './types.js';

/** Display label per role, in the order a "Who" section lists them. */
export const ROLE_LABEL: Record<string, string> = {
  headliner: 'Headliner',
  author: 'Author',
  instructor: 'Instructor',
  speaker: 'Speaker',
  comedian: 'Comedian',
  dj: 'DJ',
  performer: 'Performer',
  support: 'Support',
  host: 'Host',
};

const ROLE_ORDER = Object.keys(ROLE_LABEL);

/** Human label for a role token; unknown tokens are title-cased. */
export function roleLabel(role: string): string {
  const key = role.trim().toLowerCase();
  const known = ROLE_LABEL[key];
  if (known) return known;
  return key ? key.charAt(0).toUpperCase() + key.slice(1) : 'Performer';
}

/** The one name worth showing on a card: first headliner, else the first non-support/host, else the first. */
export function leadPerformer(performers: Performer[]): Performer | null {
  if (!performers.length) return null;
  const byRole = (r: string) => performers.find((p) => p.role === r);
  return byRole('headliner') ?? performers.find((p) => p.role !== 'support' && p.role !== 'host') ?? performers[0] ?? null;
}

export interface PerformerGroup {
  role: string;
  /** Label for the group, pluralised when it holds more than one person. */
  label: string;
  people: Performer[];
}

/** Group by role in ROLE_LABEL order (unknown roles last, in first-seen order). */
export function performersByRole(performers: Performer[]): PerformerGroup[] {
  const groups = new Map<string, Performer[]>();
  for (const p of performers) {
    const role = p.role.trim().toLowerCase() || 'performer';
    const list = groups.get(role);
    if (list) list.push(p);
    else groups.set(role, [p]);
  }
  const roles = [...groups.keys()].sort((a, b) => {
    const ia = ROLE_ORDER.indexOf(a);
    const ib = ROLE_ORDER.indexOf(b);
    return (ia < 0 ? ROLE_ORDER.length : ia) - (ib < 0 ? ROLE_ORDER.length : ib);
  });
  return roles.map((role) => {
    const people = groups.get(role)!;
    const base = roleLabel(role);
    return { role, label: people.length > 1 && base !== 'Support' ? `${base}s` : base, people };
  });
}
