/**
 * Rewrites a remote image URL to go through Next.js's image optimizer
 * (`/_next/image`), which resizes to `width` and serves WebP — cached on the
 * CDN. This is what makes avatars and feed/chat media load fast: instead of the
 * full-resolution original, the browser downloads a small, right-sized file.
 *
 * Passes the source through UNCHANGED (no optimization) when it can't or
 * shouldn't be optimized:
 *  - empty/placeholder,
 *  - local/relative paths (`/live-themes/x.png`) and blob:/data: URLs — these
 *    are already local or in-memory, so there's nothing to fetch smaller,
 *  - SVGs — the optimizer blocks SVG by default (security), and they're vector
 *    so resizing is pointless.
 *
 * `width` MUST be one of Next's configured image widths (the defaults:
 * 16/32/48/64/96/128/256/384 and 640/750/828/1080/1200/1920/2048/3840);
 * anything else makes `/_next/image` return 400. Callers pass values from that
 * set (e.g. 128 for avatars, 384 for tiles, 1080 for feed media).
 */
export function optimizedImageUrl(
  src: string | null | undefined,
  width: number,
  quality = 75,
): string | undefined {
  if (!src) return undefined
  if (!/^https?:\/\//i.test(src)) return src
  if (/\.svg(?:[?#]|$)/i.test(src)) return src
  return `/_next/image?url=${encodeURIComponent(src)}&w=${width}&q=${quality}`
}
