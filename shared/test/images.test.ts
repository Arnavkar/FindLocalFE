import { describe, expect, it } from 'vitest';
import { imageUrl } from '../src/images.js';

const SRC = 'https://cdn.example.com/photos/a b.jpg';

describe('imageUrl', () => {
  it('is a pass-through: never rewrites to a Cloudflare transformation URL', () => {
    expect(imageUrl(SRC, { width: 320 })).toBe(SRC);
    expect(imageUrl(SRC, { width: 1280, height: 720, fit: 'cover', quality: 60 })).toBe(SRC);
    expect(imageUrl('/relative.png', { width: 96 })).toBe('/relative.png');
    expect(imageUrl(SRC)).toBe(SRC);
  });
  it('maps empty input to null', () => {
    expect(imageUrl(null, { width: 320 })).toBeNull();
    expect(imageUrl(undefined, { width: 320 })).toBeNull();
    expect(imageUrl('', { width: 320 })).toBeNull();
  });
});
