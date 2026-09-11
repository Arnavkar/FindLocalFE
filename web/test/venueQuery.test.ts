import { describe, expect, it } from 'vitest';
import { API_MAX_LIMIT, VENUE_DEFAULT_LIMIT, cityForVenue, parseLimit, venueFiltersFor } from '../src/lib/venueQuery.js';

const nyc = { id: 'AAAAAAAA-0000-4000-8000-000000000001', city: 'New York' };

describe('venueQuery', () => {
  it('parseLimit clamps to 1..500 and ignores junk', () => {
    expect(parseLimit(null)).toBeUndefined();
    expect(parseLimit('0')).toBeUndefined();
    expect(parseLimit('abc')).toBeUndefined();
    expect(parseLimit('50')).toBe(50);
    expect(parseLimit('9999')).toBe(API_MAX_LIMIT);
  });
  it('cityForVenue uses the venue city, Boston only for unknown names', () => {
    expect(cityForVenue(nyc).name).toBe('New York');
    expect(cityForVenue({ city: 'Atlantis' }).name).toBe('Boston');
  });
  it('venueFiltersFor pins the venue, parses the contract in the venue city and defaults limit 500', () => {
    const f = venueFiltersFor(nyc, new URLSearchParams('city=boston&cat=music&when=anytime'));
    expect(f.city).toBe('New York');
    expect(f.venueId).toBe(nyc.id.toLowerCase());
    expect(f.limit).toBe(VENUE_DEFAULT_LIMIT);
    expect(f.categories).toEqual(['music']);
    expect(f.to).toBeNull();
    expect(venueFiltersFor(nyc, new URLSearchParams(), 20).limit).toBe(20);
  });
});
