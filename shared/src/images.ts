// Cloudflare Image Transformations helper (pure — no runtime dependency).
// The findlocal.community zone has Transformations turned OFF as of writing;
// flip IMAGE_CDN_ENABLED once it's enabled there so imageUrl() starts resizing.
export const IMAGE_CDN_ENABLED = false;

export const IMAGE_CDN_BASE = 'https://findlocal.community/cdn-cgi/image';

export interface ImageOpts {
  width: number;
  height?: number;
  fit?: 'cover' | 'scale-down' | 'contain';
  quality?: number;
}

/** Builds a `/cdn-cgi/image/...` URL for `src`, or passes it through unchanged
 * when disabled, not a fetchable http(s) URL, or already transformed. */
export function buildImageUrl(src: string | null | undefined, o: ImageOpts, enabled: boolean): string | null {
  if (!src) return null;
  if (!/^https?:\/\//i.test(src) || src.includes('/cdn-cgi/image/')) return src;
  if (!enabled) return src;
  const opts = [`width=${o.width}`];
  if (o.height != null) opts.push(`height=${o.height}`);
  opts.push(`fit=${o.fit ?? 'cover'}`, 'format=auto', `quality=${o.quality ?? 80}`);
  return `${IMAGE_CDN_BASE}/${opts.join(',')}/${encodeURI(src)}`;
}

/** buildImageUrl gated by IMAGE_CDN_ENABLED — the call sites use this. */
export function imageUrl(src: string | null | undefined, o: ImageOpts): string | null {
  return buildImageUrl(src, o, IMAGE_CDN_ENABLED);
}
