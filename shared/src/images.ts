// Image URL helper. Cloudflare Image Transformations were evaluated and
// rejected for this setup (2026-09-10): they bill per unique image+size per
// month, which at hundreds of thousands of event images is far more than the
// site earns from them. imageUrl() therefore always returns the source URL
// unchanged. The `opts` argument is kept so call sites still document the
// rendered size and can be re-pointed at a CDN later without a rewrite.
export interface ImageOpts {
  width: number;
  height?: number;
  fit?: 'cover' | 'scale-down' | 'contain';
  quality?: number;
}

/** The source URL as-is (null/empty -> null). Never builds a /cdn-cgi/image URL. */
export function imageUrl(src: string | null | undefined, _opts?: ImageOpts): string | null {
  void _opts;
  return src ? src : null;
}
