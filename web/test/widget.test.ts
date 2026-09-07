// public/widget.js is a dependency-free IIFE served as a static asset; run it
// against a stub DOM and check it produces the same iframe URL as buildEmbedSrc.
import { describe, expect, it } from 'vitest';
import src from '../public/widget.js?raw';
import { buildEmbedSrc, type EmbedAttrs } from '../src/lib/embed.js';

const ORIGIN = 'https://findlocal.community';

interface Stub {
  iframe: Record<string, unknown> & { style: { cssText: string; height: string }; attrs: Record<string, string>; contentWindow: object };
  listener: ((ev: { source: unknown; origin: string; data: unknown }) => void) | null;
}

function run(attrs: EmbedAttrs & { height?: string }, scriptSrc = `${ORIGIN}/widget.js`): Stub {
  const dataset: Record<string, string> = {};
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined) dataset[`data-${k}`] = v;
  const iframe: Stub['iframe'] = { style: { cssText: '', height: '' }, attrs: {}, contentWindow: {}, setAttribute(k: string, v: string) { iframe.attrs[k] = v; } } as never;
  const inserted: unknown[] = [];
  const script = {
    src: scriptSrc,
    nextSibling: null,
    getAttribute: (k: string) => dataset[k] ?? null,
    parentNode: { insertBefore: (el: unknown) => inserted.push(el) },
  };
  const stub: Stub = { iframe, listener: null };
  const document = { currentScript: script, createElement: () => iframe };
  const window = { addEventListener: (_: string, fn: Stub['listener']) => { stub.listener = fn; } };
  const location = { href: `${ORIGIN}/developers/widgets` };
  new Function('document', 'window', 'location', 'URL', 'URLSearchParams', src)(document, window, location, URL, URLSearchParams);
  expect(inserted).toEqual([iframe]);
  return stub;
}

describe('widget.js loader', () => {
  it('builds the same iframe src as buildEmbedSrc for a matrix of attributes', () => {
    const cases: EmbedAttrs[] = [
      { widget: 'literary-new-england' },
      { widget: 'literary-new-england', view: 'map', theme: 'dark' },
      { region: 'new-england', city: 'boston', cat: 'music', limit: '50' },
      { city: 'boston', view: 'list', theme: 'auto', when: 'anytime', limit: '100' },
      { city: 'boston', view: 'calendar', when: 'week', limit: '9999', partner: 'acme' },
      { city: 'boston', view: 'grid', theme: 'neon', limit: 'abc' },
      {},
    ];
    for (const c of cases) expect(run(c).iframe.src, JSON.stringify(c)).toBe(buildEmbedSrc(ORIGIN, c));
  });
  it('sets iframe attributes and the initial height', () => {
    const { iframe } = run({ widget: 'new-england', height: '480' });
    expect(iframe.title).toBe('FindLocal events widget');
    expect(iframe.loading).toBe('lazy');
    expect(iframe.attrs.scrolling).toBe('no');
    expect(iframe.style.cssText).toContain('min-height:480px');
    expect(run({}).iframe.style.cssText).toContain('min-height:320px');
  });
  it('derives the origin from the script src (dev servers work)', () => {
    expect(run({ city: 'boston' }, 'http://localhost:4321/widget.js').iframe.src).toBe('http://localhost:4321/embed/events?city=boston');
  });
  it('only honours resize messages from its own iframe and origin', () => {
    const { iframe, listener } = run({ city: 'boston' });
    expect(listener).toBeTypeOf('function');
    const msg = (source: unknown, origin: string, data: unknown) => listener!({ source, origin, data });
    msg({}, ORIGIN, { type: 'findlocal:resize', height: 900 });
    expect(iframe.style.height).toBe('');
    msg(iframe.contentWindow, 'https://evil.example', { type: 'findlocal:resize', height: 900 });
    expect(iframe.style.height).toBe('');
    msg(iframe.contentWindow, ORIGIN, { type: 'other', height: 900 });
    expect(iframe.style.height).toBe('');
    msg(iframe.contentWindow, ORIGIN, { type: 'findlocal:resize', height: 812.4 });
    expect(iframe.style.height).toBe('813px');
    msg(iframe.contentWindow, ORIGIN, { type: 'findlocal:resize', height: 10 });
    expect(iframe.style.height).toBe('120px');
  });
});
