import { describe, expect, it } from 'vitest';
import { priceLabel, shortPriceLabel } from '../src/lib/format.js';

describe('shortPriceLabel', () => {
  it('returns priceLabel unchanged when it already fits', () => {
    expect(shortPriceLabel({ price: null, price_amount: 0 })).toBe('Free');
    expect(shortPriceLabel({ price: '$10-$20', price_amount: null })).toBe('$10-$20');
    expect(shortPriceLabel({ price: null, price_amount: null })).toBe('');
  });

  it('truncates at the last word boundary before max and adds an ellipsis', () => {
    const e = { price: 'Tickets have a $3 processing fee', price_amount: null };
    expect(priceLabel(e).length).toBeGreaterThan(14);
    expect(shortPriceLabel(e)).toBe('Tickets have…');
    expect(shortPriceLabel(e).length).toBeLessThanOrEqual(14);
  });

  it('never returns fewer than 6 chars of text before the ellipsis, even with no early word boundary', () => {
    const e = { price: 'Supercalifragilisticexpialidocious', price_amount: null };
    expect(shortPriceLabel(e)).toBe('Superc…');
  });

  it('honours a custom max', () => {
    expect(shortPriceLabel({ price: 'Advance tickets required', price_amount: null }, 10)).toBe('Advance…');
  });
});
