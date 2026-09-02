import "server-only"

import type { Metadata } from "next"
import { getShareMetadata } from "@/lib/share/resolve-share-metadata"
import { absoluteShareUrl, getSiteOrigin } from "@/lib/share/site-url"
import { DEFAULT_SHARE_IMAGE, type ShareContentType, type ShareMetadata, type ShareRef } from "@/lib/share/share-metadata"

/** Maps a Frequency content type to the closest Open Graph `og:type`. */
function ogType(type: ShareContentType): string {
  switch (type) {
    case "article":
      return "article"
    case "audio":
      return "music.song"
    case "video":
    case "live":
      return "video.other"
    case "user":
    case "organisation":
      return "profile"
    default:
      return "website"
  }
}

/** Composes a "Title · LABEL · Organisation" style OG title. */
function composeTitle(meta: ShareMetadata): string {
  const bits = [meta.title]
  if (meta.organisationName && meta.organisationName !== meta.title) bits.push(meta.organisationName)
  return bits.join(" · ")
}

/**
 * The single bridge from Frequency's ShareMetadata to Next.js route metadata
 * (spec §3, §4). Every canonical route calls this from `generateMetadata`, so
 * Open Graph, Twitter Card, canonical link and the dynamic per-item share image
 * are all emitted consistently — never a single generic image for every URL.
 *
 * When the item is missing/deleted/unpublished the resolver returns null and we
 * emit a neutral, non-indexed "unavailable" metadata set that leaks nothing.
 */
export async function shareMetadataToNext(ref: ShareRef): Promise<Metadata> {
  const [meta, origin] = await Promise.all([getShareMetadata(ref), getSiteOrigin()])
  const metadataBase = new URL(origin)

  if (!meta) {
    return {
      metadataBase,
      title: "Content unavailable · Frequency",
      description: "This content is no longer available.",
      robots: { index: false, follow: false },
    }
  }

  const canonical = meta.canonicalUrl
  const absoluteUrl = await absoluteShareUrl(canonical)
  const imageAbsolute = await absoluteShareUrl(meta.thumbnailUrl || DEFAULT_SHARE_IMAGE)
  const title = composeTitle(meta)
  const description = meta.description ?? undefined

  return {
    metadataBase,
    title,
    description,
    alternates: { canonical },
    // Restricted items exist but must not be indexed with their generic shell.
    robots: meta.restricted ? { index: false, follow: true } : undefined,
    openGraph: {
      type: ogType(meta.contentType) as "website",
      url: absoluteUrl,
      title,
      description,
      siteName: "Frequency",
      images: [{ url: imageAbsolute, alt: meta.title }],
      ...(meta.publishedAt ? { publishedTime: meta.publishedAt } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [imageAbsolute],
    },
  }
}
