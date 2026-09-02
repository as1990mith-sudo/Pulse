import { NextResponse } from "next/server"
import { getShareMetadata } from "@/lib/share/resolve-share-metadata"
import { parseFrequencyPath, CONTENT_TYPE_LABEL } from "@/lib/share/share-metadata"

export const runtime = "nodejs"

type Preview = {
  url: string
  title: string | null
  description: string | null
  image: string | null
  siteName: string | null
  /**
   * The site's own icon (apple-touch-icon / rel=icon), used only when the page
   * has no `og:image`. Kept separate from `image` because a 32–180px logo must
   * render as a small square — stretching it across a wide banner looks broken.
   */
  icon?: string | null
}

// Decodes the small set of HTML entities that commonly appear in meta tags.
function decodeEntities(input: string): string {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&nbsp;/g, " ")
    .trim()
}

// Pulls the `content` value of the first <meta> tag matching any of the given
// property/name keys. Handles attributes in either order and either quote style.
function metaContent(html: string, keys: string[]): string | null {
  for (const key of keys) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const patterns = [
      new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]*content=["']([^"']*)["']`, "i"),
      new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${escaped}["']`, "i"),
    ]
    for (const re of patterns) {
      const m = html.match(re)
      if (m?.[1]) return decodeEntities(m[1])
    }
  }
  return null
}

/**
 * Finds the best site icon in the HTML, preferring the largest declared size.
 * Apple touch icons are favoured because they're typically 180px and opaque,
 * whereas a bare favicon is often 16px and unusable as a thumbnail.
 */
function iconHref(html: string): string | null {
  const links = html.match(/<link[^>]+rel=["'][^"']*icon[^"']*["'][^>]*>/gi)
  if (!links) return null

  let best: { href: string; score: number } | null = null
  for (const tag of links) {
    const href = tag.match(/href=["']([^"']+)["']/i)?.[1]
    if (!href) continue
    // SVG icons scale cleanly, so treat them as the best possible option.
    const isSvg = /\.svg(\?|$)/i.test(href) || /type=["']image\/svg/i.test(tag)
    const isApple = /apple-touch-icon/i.test(tag)
    const size = Number(tag.match(/sizes=["'](\d+)/i)?.[1] ?? 0)
    const score = isSvg ? 1000 : isApple ? 500 + size : size || 1
    if (!best || score > best.score) best = { href: decodeEntities(href), score }
  }
  return best?.href ?? null
}

// Rejects non-http(s) URLs and obvious internal/private hosts to avoid SSRF.
function isSafePublicUrl(u: URL): boolean {
  if (u.protocol !== "http:" && u.protocol !== "https:") return false
  const host = u.hostname.toLowerCase()
  if (host === "localhost" || host.endsWith(".local")) return false
  if (host === "0.0.0.0" || host === "::1") return false
  if (/^127\./.test(host)) return false
  if (/^10\./.test(host)) return false
  if (/^192\.168\./.test(host)) return false
  if (/^169\.254\./.test(host)) return false
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false
  return true
}

function fetchWithTimeout(url: string, ms: number, headers?: Record<string, string>) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), ms)
  return fetch(url, {
    signal: controller.signal,
    redirect: "follow",
    headers: {
      "user-agent": "Mozilla/5.0 (compatible; FrequencyBot/1.0; +https://frequency.app)",
      accept: "text/html,application/xhtml+xml",
      ...headers,
    },
  }).finally(() => clearTimeout(timeout))
}

// Extracts a YouTube video id from any of its URL shapes.
function youtubeId(u: URL): string | null {
  const host = u.hostname.replace(/^www\./, "").toLowerCase()
  if (host === "youtu.be") return u.pathname.slice(1).split("/")[0] || null
  if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
    if (u.pathname === "/watch") return u.searchParams.get("v")
    const m = u.pathname.match(/^\/(?:shorts|embed|live)\/([^/?#]+)/)
    if (m) return m[1]
  }
  return null
}

// oEmbed / noembed give us title + thumbnail for providers that block scraping
// (YouTube, X/Twitter, Instagram, TikTok, etc.) without needing an API key.
async function fetchOEmbed(endpoint: string): Promise<Partial<Preview> | null> {
  try {
    const res = await fetchWithTimeout(endpoint, 5000, { accept: "application/json" })
    if (!res.ok) return null
    const data = (await res.json()) as Record<string, unknown>
    if (!data || (typeof data.error !== "undefined" && data.error)) return null
    const title = typeof data.title === "string" ? data.title : null
    const image = typeof data.thumbnail_url === "string" ? data.thumbnail_url : null
    const siteName = typeof data.provider_name === "string" ? data.provider_name : null
    const author = typeof data.author_name === "string" ? data.author_name : null
    if (!title && !image) return null
    return { title, image, siteName, description: author }
  } catch {
    return null
  }
}

// Provider-specific enrichment for hosts that don't expose OG tags to bots.
async function providerFallback(target: URL): Promise<Partial<Preview> | null> {
  const host = target.hostname.replace(/^www\./, "").toLowerCase()

  // YouTube: reliable high-res thumbnail from the video id + oEmbed title.
  const vid = youtubeId(target)
  if (vid) {
    const oembed = await fetchOEmbed(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(target.toString())}&format=json`,
    )
    return {
      title: oembed?.title ?? "YouTube video",
      image: oembed?.image ?? `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`,
      siteName: "YouTube",
      description: oembed?.description ?? null,
    }
  }

  // X/Twitter, Instagram, TikTok, and many others are covered by noembed.
  if (
    host === "twitter.com" ||
    host === "x.com" ||
    host === "instagram.com" ||
    host === "tiktok.com" ||
    host.endsWith(".tiktok.com")
  ) {
    return fetchOEmbed(`https://noembed.com/embed?url=${encodeURIComponent(target.toString())}`)
  }

  return null
}

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("url")
  if (!raw) {
    return NextResponse.json({ error: "Missing url" }, { status: 400 })
  }

  let target: URL
  try {
    target = new URL(raw)
  } catch {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 })
  }

  const cacheHeaders = {
    "cache-control": "public, s-maxage=86400, stale-while-revalidate=604800",
  }

  // 0) Frequency's OWN URLs are resolved from the trusted internal metadata
  //    resolver (the database) rather than scraped (spec §5, §22). This is both
  //    accurate and privacy-safe: the resolver already returns a generic
  //    "private content" card for members-only items and null for deleted ones,
  //    so we never leak restricted titles/artwork through an in-app preview.
  //    We only trust the path when the host matches this deployment's own host.
  const reqUrl = new URL(request.url)
  const selfHost = reqUrl.host
  const selfOrigin = `${reqUrl.protocol}//${reqUrl.host}`
  // Resolve an app-relative path (or already-absolute URL) against our origin.
  const absolute = (pathOrUrl: string) =>
    /^https?:\/\//i.test(pathOrUrl) ? pathOrUrl : `${selfOrigin}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`
  if (target.host === selfHost) {
    const ref = parseFrequencyPath(target.toString())
    if (ref) {
      const meta = await getShareMetadata(ref)
      if (!meta) {
        // Deleted / unavailable Frequency content — do not fall through to a
        // scrape of our own page; report not-previewable so the raw link shows.
        return NextResponse.json({ error: "Not previewable" }, { status: 200 })
      }
      const label = meta.contentTypeLabel || CONTENT_TYPE_LABEL[meta.contentType]
      // e.g. "Audio · Kingdom Academy" or just "Audio" when unattributed.
      const siteName = meta.organisationName ? `${label} · ${meta.organisationName}` : label
      return NextResponse.json(
        {
          url: absolute(meta.canonicalUrl),
          title: meta.title,
          description: meta.description,
          image: meta.thumbnailUrl ? absolute(meta.thumbnailUrl) : null,
          siteName,
          icon: null,
        },
        { headers: cacheHeaders },
      )
    }
    // A same-host URL that isn't a recognised content path (e.g. /settings):
    // fall through so it's treated like any other page rather than scraped for
    // private surfaces. isSafePublicUrl below will reject localhost anyway.
  }

  if (!isSafePublicUrl(target)) {
    return NextResponse.json({ error: "Unsupported url" }, { status: 400 })
  }

  // 1) Try to scrape Open Graph / Twitter card metadata from the page itself.
  let scraped: Preview | null = null
  try {
    const res = await fetchWithTimeout(target.toString(), 6000)
    const contentType = res.headers.get("content-type") ?? ""
    if (res.ok && contentType.includes("text/html")) {
      const body = await res.text()
      const html = body.slice(0, 200_000)

      const titleTag = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]
      const title =
        metaContent(html, ["og:title", "twitter:title"]) ?? (titleTag ? decodeEntities(titleTag) : null)
      const description = metaContent(html, ["og:description", "twitter:description", "description"])
      let image = metaContent(html, ["og:image:secure_url", "og:image", "twitter:image", "twitter:image:src"])
      const siteName = metaContent(html, ["og:site_name"]) ?? target.hostname.replace(/^www\./, "")

      const base = res.url || target.toString()
      if (image) {
        try {
          image = new URL(image, base).toString()
        } catch {
          image = null
        }
      }

      // Only worth resolving when there's no banner image to show.
      let icon: string | null = null
      if (!image) {
        const href = iconHref(html)
        if (href) {
          try {
            icon = new URL(href, base).toString()
          } catch {
            icon = null
          }
        }
      }

      scraped = {
        url: base,
        title: title || null,
        description: description || null,
        image: image || null,
        siteName: siteName || null,
        icon,
      }
    }
  } catch {
    // Ignore — we'll try a provider fallback below.
  }

  // 2) If scraping produced a usable card (has an image or a real title), use it.
  const scrapedIsRich =
    scraped && (scraped.image || (scraped.title && scraped.title !== scraped.siteName))
  if (scrapedIsRich) {
    return NextResponse.json(scraped, { headers: cacheHeaders })
  }

  // 3) Otherwise enrich via provider-specific oEmbed (YouTube, X, IG, TikTok…).
  const fallback = await providerFallback(target)
  if (fallback) {
    const merged: Preview = {
      url: target.toString(),
      title: fallback.title ?? scraped?.title ?? null,
      description: fallback.description ?? scraped?.description ?? null,
      image: fallback.image ?? scraped?.image ?? null,
      siteName: fallback.siteName ?? scraped?.siteName ?? target.hostname.replace(/^www\./, ""),
      icon: scraped?.icon ?? null,
    }
    return NextResponse.json(merged, { headers: cacheHeaders })
  }

  // 4) Fall back to whatever we scraped (even if thin), else a not-previewable flag.
  if (scraped && (scraped.title || scraped.image || scraped.description)) {
    return NextResponse.json(scraped, { headers: cacheHeaders })
  }

  return NextResponse.json({ error: "Not previewable" }, { status: 200 })
}
