import { describe, expect, it } from 'vitest';
import { getCity } from '@findlocal/shared';
import {
  buildEmbedSrc, embedCityFilters, embedGroupRange, eventUrl, parseEmbedParams, siteUrl, venueUrl,
} from '../src/lib/embed.js';

const O = 'https://findlocal.community';
const q = (s: string) => new URLSearchParams(s);

describe('buildEmbedSrc', () => {
  it('expands presets and sorts keys', () => {
    expect(buildEmbedSrc(O, { widget: 'literary-new-england' })).toBe(`${O}/embed/events?cat=literary&region=new-england`);
    expect(buildEmbedSrc(O, { widget: 'New-England' })).toBe(`${O}/embed/events?region=new-england`);
    expect(buildEmbedSrc(`${O}/`, {})).toBe(`${O}/embed/events`);
  });
  it('explicit attributes win over the preset; region beats city', () => {
    expect(buildEmbedSrc(O, { widget: 'literary-new-england', cat: 'music' })).toBe(`${O}/embed/events?cat=music&region=new-england`);
    expect(buildEmbedSrc(O, { region: 'new-england', city: 'boston' })).toBe(`${O}/embed/events?region=new-england`);
    expect(buildEmbedSrc(O, { city: 'boston', cat: 'comedy' })).toBe(`${O}/embed/events?cat=comedy&city=boston`);
  });
  it('drops defaults and invalid values, clamps limit', () => {
    expect(buildEmbedSrc(O, { city: 'boston', view: 'list', theme: 'auto', when: 'anytime', limit: '100' })).toBe(`${O}/embed/events?city=boston`);
    expect(buildEmbedSrc(O, { city: 'boston', view: 'map', theme: 'dark', when: 'week', limit: '25' })).toBe(`${O}/embed/events?city=boston&limit=25&theme=dark&view=map&when=week`);
    expect(buildEmbedSrc(O, { city: 'boston', view: 'grid', theme: 'neon', limit: 'abc' })).toBe(`${O}/embed/events?city=boston`);
    expect(buildEmbedSrc(O, { city: 'boston', limit: '9999' })).toBe(`${O}/embed/events?city=boston&limit=300`);
    expect(buildEmbedSrc(O, { city: 'boston', limit: '0' })).toBe(`${O}/embed/events?city=boston`);
    expect(buildEmbedSrc(O, { city: 'boston', partner: 'acme' })).toBe(`${O}/embed/events?city=boston&partner=acme`);
  });
});

describe('parseEmbedParams', () => {
  it('resolves a region group and strips embed-only keys from the filter params', () => {
    const p = parseEmbedParams(q('region=new-england&cat=literary&view=map&theme=dark&limit=50&when=week&partner=acme'));
    expect(p.group?.slug).toBe('new-england');
    expect(p.city).toBeUndefined();
    expect(p.view).toBe('map');
    expect(p.theme).toBe('dark');
    expect(p.limit).toBe(50);
    expect(p.partner).toBe('acme');
    expect(p.campaign).toBe('new-england-literary');
    expect([...p.filterParams.keys()].sort()).toEqual(['cat', 'when']);
    expect(p.filterParams.get('region')).toBeNull();
  });
  it('region wins over city; unknown values produce an error; no scope defaults to Boston', () => {
    expect(parseEmbedParams(q('region=new-england&city=boston')).group?.slug).toBe('new-england');
    expect(parseEmbedParams(q('region=narnia')).error).toBe('unknown-region');
    expect(parseEmbedParams(q('city=narnia')).error).toBe('unknown-city');
    const boston = parseEmbedParams(q(''));
    expect(boston.city?.name).toBe('Boston');
    expect(boston.campaign).toBe('boston');
    expect(parseEmbedParams(q('city=Portland%20ME')).city?.slug).toBe('portland-me');
    expect(parseEmbedParams(q('city=portland-me')).city?.name).toBe('Portland ME');
  });
  it('defaults and clamps view/theme/limit, sanitises partner, accepts from/to', () => {
    const p = parseEmbedParams(q('city=boston&view=grid&theme=neon&limit=9999&partner=<b>ac me</b>&from=2026-10-01&to=2026-10-31'));
    expect(p.view).toBe('list');
    expect(p.theme).toBe('auto');
    expect(p.limit).toBe(300);
    expect(p.partner).toBe('bacmeb');
    expect(p.from).toBe('2026-10-01');
    expect(p.to).toBe('2026-10-31');
    expect(parseEmbedParams(q('limit=-5')).limit).toBe(100);
    expect(parseEmbedParams(q('from=tomorrow')).from).toBeUndefined();
  });
  it('embedCityFilters / embedGroupRange apply the explicit window over `when`', () => {
    const now = new Date('2026-09-05T15:00:00Z');
    const boston = getCity('Boston')!;
    const f = embedCityFilters(parseEmbedParams(q('city=boston&when=today&limit=10&region=')), boston, now);
    expect(f.city).toBe('Boston');
    expect(f.region).toBeUndefined();
    expect(f.from).toBe('2026-09-05');
    expect(f.to).toBe('2026-09-05');
    expect(f.limit).toBe(11);
    const g = parseEmbedParams(q('region=new-england&when=today&from=2026-10-01&to=2026-10-02'));
    expect(embedGroupRange(g, g.group!, now)).toEqual({ from: '2026-10-01', to: '2026-10-02' });
    const g2 = parseEmbedParams(q('region=new-england&when=today'));
    expect(embedGroupRange(g2, g2.group!, now)).toEqual({ from: '2026-09-05', to: '2026-09-05' });
    const g3 = parseEmbedParams(q('region=new-england'));
    expect(embedGroupRange(g3, g3.group!, now)).toEqual({ from: '2026-09-05', to: null });
  });
});

describe('outbound links carry UTM attribution', () => {
  it('event / venue / site urls', () => {
    expect(eventUrl('abc', 'new-england-literary')).toBe(`${O}/event/abc?utm_source=widget&utm_medium=embed&utm_campaign=new-england-literary`);
    expect(venueUrl('v1', 'boston', 'acme')).toBe(`${O}/venue/v1?utm_source=widget&utm_medium=embed&utm_campaign=boston&utm_content=acme`);
    expect(siteUrl('/', 'boston')).toBe(`${O}/?utm_source=widget&utm_medium=embed&utm_campaign=boston`);
  });
});
