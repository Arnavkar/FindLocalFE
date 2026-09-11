import { describe, expect, it } from 'vitest';
import { highlightScore, pickHighlights, soonBonus, type EventRow } from '../src/index.js';

let n = 0;
function ev(o: Partial<EventRow> = {}): EventRow {
  n++;
  return {
    id: `e${n}`, venue_id: 'v1', city: 'Boston', region: null, source: 's', external_id: null, title: `Event ${n}`,
    description: null, event_date: '2026-09-10', start_time: '19:00', end_time: null, category: 'music', event_type: [],
    performers: [], price: null, price_amount: null, status: null, detail_page_url: null, ticket_page_url: null,
    root_url: null, image_url: null, is_deleted: 0, first_seen_at: '', last_seen_at: '', updated_at: '',
    venue_name: 'V', venue_address: null, venue_image: null, venue_lat: null, venue_lng: null, venue_url: null,
    venue_type: null, venue_region: null, series_count: 1, series_image: null, ...o,
  };
}
const long = 'x'.repeat(200);
const ids = (rows: EventRow[]) => rows.map((r) => r.id);

describe('highlightScore', () => {
  it('rewards own image, description length, people and a known price', () => {
    expect(highlightScore(ev({ start_time: null }))).toBe(0);
    expect(highlightScore(ev({ image_url: 'i', start_time: null }))).toBe(3);
    expect(highlightScore(ev({ venue_image: 'i', start_time: null }))).toBe(1.5);
    expect(highlightScore(ev({ description: 'x'.repeat(60), start_time: null }))).toBe(1);
    expect(highlightScore(ev({ description: long, start_time: null }))).toBe(2);
    expect(highlightScore(ev({ description: 'x'.repeat(400), start_time: null }))).toBe(2.5);
    expect(highlightScore(ev({ performers: [{ name: 'A', role: 'headliner' }], start_time: null }))).toBe(1.5);
    expect(highlightScore(ev({ performers: [{ name: 'A', role: 'x', image: 'i' }, { name: 'B', role: 'x' }, { name: 'C', role: 'x' }, { name: 'D', role: 'x' }], start_time: null }))).toBe(2.5);
    expect(highlightScore(ev({ price: 'Free', start_time: null }))).toBe(0.5);
    expect(highlightScore(ev({ price_amount: 0, start_time: null }))).toBe(0.5);
    expect(highlightScore(ev({ price: '  ', start_time: null }))).toBe(0);
    expect(highlightScore(ev())).toBe(0.25);
  });
  it('soonBonus favours today and the next days', () => {
    expect(soonBonus(ev(), undefined)).toBe(0);
    expect(soonBonus(ev(), '2026-09-10')).toBe(1);
    expect(soonBonus(ev(), '2026-09-09')).toBe(0.6);
    expect(soonBonus(ev(), '2026-09-08')).toBe(0.3);
    expect(soonBonus(ev(), '2026-09-01')).toBe(0);
  });
});

describe('pickHighlights', () => {
  it('puts complete listings ahead of bare early-morning ones', () => {
    const bare = ev({ start_time: '10:30', category: 'parks' });
    const rich = ev({ start_time: '20:00', image_url: 'i', description: long, performers: [{ name: 'A', role: 'headliner' }], price: '$20', price_amount: 20 });
    expect(ids(pickHighlights([bare, rich]))).toEqual([rich.id, bare.id]);
  });
  it('spreads picks across categories and venues instead of taking the first N', () => {
    const music = Array.from({ length: 5 }, (_, i) => ev({ image_url: 'i', description: long, venue_id: `m${i}` }));
    const comedy = ev({ image_url: 'i', category: 'comedy', venue_id: 'c1' });
    const theater = ev({ image_url: 'i', category: 'theater', venue_id: 't1' });
    const picked = pickHighlights([...music, comedy, theater], { limit: 4 });
    expect(picked.map((e) => e.category)).toEqual(['music', 'music', 'comedy', 'theater']);
  });
  it('penalises the same venue and shows a recurring series once', () => {
    const sameVenue = Array.from({ length: 4 }, () => ev({ image_url: 'i', venue_id: 'same' }));
    const other = ev({ image_url: 'i', venue_id: 'other' });
    const picked = pickHighlights([...sameVenue, other], { limit: 2 });
    expect(picked.map((e) => e.venue_id)).toEqual(['same', 'other']);
    const series = [ev({ title: 'Trivia Night', image_url: 'i' }), ev({ title: 'trivia night ', image_url: 'i', event_date: '2026-09-17' })];
    expect(pickHighlights(series).length).toBe(1);
  });
  it('keeps input (time) order among equals and respects the limit', () => {
    const rows = Array.from({ length: 12 }, () => ev({ image_url: 'i', venue_id: `v${n}` , category: `c${n}` }));
    expect(ids(pickHighlights(rows))).toEqual(ids(rows).slice(0, 10));
    expect(pickHighlights([])).toEqual([]);
  });
});
