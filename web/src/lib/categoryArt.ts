// Brand "no image" clip art: one simple glyph per event category, drawn on a
// 64x64 grid. Stroke shapes are 4px round-capped lines; fill shapes are solid
// dots/heads. Shared by CategoryArt.astro (site) and CategoryArt.tsx (app,
// vendored via scripts/sync-shared.mjs). Keys are category slugs from
// categories.json; 'fallback' is the FindLocal magnifier from the logo.

export interface ArtShape {
  d: string;
  /** true = solid fill; false/undefined = 4px stroke, no fill. */
  fill?: boolean;
}

export const ART_VIEWBOX = '0 0 64 64';
export const ART_STROKE = 4;

function dot(cx: number, cy: number, r: number): ArtShape {
  return { d: `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0-${r * 2} 0`, fill: true };
}

export const CATEGORY_ART: Record<string, ArtShape[]> = {
  music: [{ d: 'M38 44V16l16-4v26' }, dot(31, 44, 7), dot(47, 38, 7)],
  comedy: [{ d: 'M32 8a24 24 0 1 0 0 48a24 24 0 1 0 0-48' }, { d: 'M21 37c4 7 18 7 22 0' }, dot(23, 26, 3), dot(41, 26, 3)],
  theater: [
    { d: 'M14 12c12 6 24 6 36 0v22c0 12-8 20-18 20S14 46 14 34z' },
    { d: 'M23 36c4 6 14 6 18 0' },
    { d: 'M20 26a5 3 0 1 0 10 0a5 3 0 1 0-10 0', fill: true },
    { d: 'M34 26a5 3 0 1 0 10 0a5 3 0 1 0-10 0', fill: true },
  ],
  dance: [dot(32, 11, 5), { d: 'M18 34l10-10h8l10 8' }, { d: 'M32 24v16l-10 14' }, { d: 'M32 40l12 12' }],
  literary: [{ d: 'M8 16c8-3 16-2 24 4c8-6 16-7 24-4v32c-8-3-16-2-24 4c-8-6-16-7-24-4z' }, { d: 'M32 20v32' }],
  art: [
    { d: 'M32 8C18 8 8 18 8 30s10 22 22 22c4 0 6-3 6-6s-2-4-2-7 2-5 6-5h5c7 0 11-4 11-10C56 14 45 8 32 8z' },
    dot(20, 27, 3),
    dot(30, 18, 3),
    dot(43, 21, 3),
  ],
  food_drink: [
    { d: 'M12 22h32v16a10 10 0 0 1-10 10H22a10 10 0 0 1-10-10z' },
    { d: 'M44 28h6a6 6 0 0 1 0 12h-6' },
    { d: 'M20 14c0-4 4-4 4-8' },
    { d: 'M32 14c0-4 4-4 4-8' },
  ],
  family: [dot(24, 18, 6), dot(43, 22, 4), { d: 'M12 50v-8a12 12 0 0 1 24 0v8' }, { d: 'M39 50v-6a8 8 0 0 1 16 0v6' }],
  market: [
    { d: 'M10 24l4-12h36l4 12' },
    { d: 'M10 24a6 6 0 0 0 12 0a6 6 0 0 0 12 0a6 6 0 0 0 12 0a6 6 0 0 0 12 0' },
    { d: 'M14 30v22h36V30' },
    { d: 'M26 52V40h12v12' },
  ],
  workshop: [{ d: 'M22 40c-6-4-10-10-10-17a20 20 0 0 1 40 0c0 7-4 13-10 17v6H22z' }, { d: 'M24 54h16' }, { d: 'M32 24v10' }],
  fitness: [{ d: 'M8 32h8' }, { d: 'M48 32h8' }, { d: 'M16 22h8v20h-8z' }, { d: 'M40 22h8v20h-8z' }, { d: 'M24 32h16' }],
  nightlife: [{ d: 'M38 8a22 22 0 1 0 18 36A18 18 0 0 1 38 8z' }, { d: 'M50 10l2 5 5 2-5 2-2 5-2-5-5-2 5-2z', fill: true }],
  community: [
    dot(32, 16, 5),
    dot(15, 24, 4),
    dot(49, 24, 4),
    { d: 'M22 48v-6a10 10 0 0 1 20 0v6' },
    { d: 'M6 44v-4a8 8 0 0 1 12-7' },
    { d: 'M58 44v-4a8 8 0 0 0-12-7' },
  ],
  festival: [{ d: 'M6 14c14 14 38 14 52 0' }, { d: 'M14 20l4 12 6-10' }, { d: 'M28 22l4 12 4-12' }, { d: 'M42 22l6 10 4-12' }],
  parks: [{ d: 'M32 8L18 30h8l-10 14h32L38 30h8z' }, { d: 'M32 44v12' }, dot(52, 12, 5)],
  fallback: [{ d: 'M26 10a16 16 0 1 0 0 32a16 16 0 1 0 0-32' }, { d: 'M38 34l14 14' }],
};

/** Glyph key for a category slug (or null) — 'fallback' when unknown. */
export function artKeyFor(category: string | null | undefined): string {
  const key = (category ?? '').trim().toLowerCase();
  return key in CATEGORY_ART ? key : 'fallback';
}
