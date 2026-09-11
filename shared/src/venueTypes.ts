// venues.type arrives from many sources with mixed spellings ('music_venue',
// 'Music Venue', 'theater' / 'Theater'). These helpers fold them into one key
// for chips, filters and the SQL in queries.ts, so every front door groups
// them the same way until the pipeline normalises at ingest.

/** Canonical key: trim, lowercase, '_'/'-' -> space, collapse whitespace. Null when empty. */
export function venueTypeKey(type: string | null | undefined): string | null {
  const key = (type ?? '').trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  return key || null;
}

/** Display label for a key: 'music venue' -> 'Music Venue'. */
export function venueTypeLabel(key: string): string {
  return key.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** SQL expression producing venueTypeKey(v.type) for the given column (SQLite/D1). */
export function venueTypeKeySql(col: string): string {
  return `lower(trim(replace(replace(${col}, '_', ' '), '-', ' ')))`;
}
