import { NextResponse } from "next/server"

export const runtime = "nodejs"

type Preview = {
  url: string
  title: string | null
  description: string | null
  image: string | null
  siteName: string | null
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

  if (!isSafePublicUrl(target)) {
    return NextResponse.json({ error: "Unsupported url" }, { status: 400 })
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 6000)

  try {
    const res = await fetch(target.toString(), {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        // Identify as a link-preview bot so sites serve their OG metadata.
        "user-agent": "Mozilla/5.0 (compatible; FrequencyBot/1.0; +https://frequency.app)",
        accept: "text/html,application/xhtml+xml",
      },
    })

    const contentType = res.headers.get("content-type") ?? ""
    if (!res.ok || !contentType.includes("text/html")) {
      return NextResponse.json({ error: "Not previewable" }, { status: 200 })
    }

    // Only read the first chunk of the document — meta tags live in <head>.
    const body = await res.text()
    const html = body.slice(0, 200_000)

    const titleTag = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]
    const title =
      metaContent(html, ["og:title", "twitter:title"]) ?? (titleTag ? decodeEntities(titleTag) : null)
    const description = metaContent(html, [
      "og:description",
      "twitter:description",
      "description",
    ])
    let image = metaContent(html, ["og:image:secure_url", "og:image", "twitter:image", "twitter:image:src"])
    const siteName = metaContent(html, ["og:site_name"]) ?? target.hostname.replace(/^www\./, "")

    // Resolve protocol-relative or relative image URLs against the final host.
    if (image) {
      try {
        image = new URL(image, res.url || target.toString()).toString()
      } catch {
        image = null
      }
    }

    const preview: Preview = {
      url: res.url || target.toString(),
      title: title || null,
      description: description || null,
      image: image || null,
      siteName: siteName || null,
    }

    return NextResponse.json(preview, {
      headers: {
        // Cache previews aggressively at the edge; metadata rarely changes.
        "cache-control": "public, s-maxage=86400, stale-while-revalidate=604800",
      },
    })
  } catch {
    return NextResponse.json({ error: "Fetch failed" }, { status: 200 })
  } finally {
    clearTimeout(timeout)
  }
}
