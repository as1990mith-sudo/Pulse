/**
 * Frequency Rich Link Preview — shared, client-safe foundation.
 *
 * This module is the single source of truth for how any shareable Frequency
 * entity is described and where its canonical URL lives. It is deliberately
 * pure and dependency-free (no DB, no "use server") so it can be imported from
 * client components (composer preview, share sheet) AND server code (route
 * `generateMetadata`, the internal resolver) alike.
 *
 * The same `ShareMetadata` shape powers all three sharing surfaces:
 *   Content → getShareMetadata() → ShareMetadata → { in-app card | OG tags | share sheet }
 */

/** Every content type that can produce a canonical Frequency link. */
export type ShareContentType =
  | "post"
  | "community"
  | "article"
  | "audio"
  | "video"
  | "live"
  | "event"
  | "organisation"
  | "user"
  | "status"

/**
 * A fully-resolved description of a shareable item. `canonicalUrl` is always an
 * app-relative path (e.g. "/articles/12"); callers turn it absolute at the edge
 * where the request host is known. Optional fields degrade gracefully — the
 * preview card and OG tags both cope with any of them being null.
 */
export type ShareMetadata = {
  contentType: ShareContentType
  /** App-relative canonical path. Use `absoluteShareUrl` to make it absolute. */
  canonicalUrl: string
  title: string
  description: string | null
  /** Best available cover/thumbnail (already an absolute or app-relative URL). */
  thumbnailUrl: string | null
  authorName: string | null
  authorAvatar: string | null
  organisationName: string | null
  organisationLogo: string | null
  /** ISO string, when known. */
  publishedAt: string | null
  /** Short uppercase badge shown on the card, e.g. "LIVE", "AUDIO", "EVENT". */
  contentTypeLabel: string
  /** Preferred artwork aspect ratio for the card/OG image. */
  aspect: "video" | "square" | "portrait"
  /**
   * True when the item exists but the viewer/public may not see its details.
   * The card and OG tags then show a generic private message instead of leaking
   * the real title/description/artwork.
   */
  restricted?: boolean
  /** Extra per-type facts surfaced on the card (event date, location, …). */
  extra?: {
    eventDate?: string | null
    location?: string | null
    online?: boolean
    liveStatus?: "live" | "upcoming" | "ended" | null
    organisationType?: string | null
  }
}

/** Human-readable uppercase badge per content type. */
export const CONTENT_TYPE_LABEL: Record<ShareContentType, string> = {
  post: "POST",
  community: "DISCUSSION",
  article: "ARTICLE",
  audio: "AUDIO",
  video: "VIDEO",
  live: "LIVE",
  event: "EVENT",
  organisation: "MINISTRY",
  user: "PROFILE",
  status: "STATUS",
}

/** Preferred artwork aspect ratio per content type (see spec §12). */
export const CONTENT_TYPE_ASPECT: Record<ShareContentType, "video" | "square" | "portrait"> = {
  post: "video",
  community: "video",
  article: "portrait",
  audio: "square",
  video: "video",
  live: "video",
  event: "portrait",
  organisation: "square",
  user: "square",
  status: "portrait",
}

/** The branded, brand-only default used whenever an item has no artwork. */
export const DEFAULT_SHARE_IMAGE = "/share/fallback-default.png"

/**
 * Branded fallback artwork per content type (spec §13). Every type resolves to
 * a real image so a preview is never broken or empty. Type-specific art can be
 * dropped into /public/share later and wired here; today they all resolve to
 * the shared branded default, which is guaranteed to exist.
 */
export function fallbackImageFor(_type: ShareContentType): string {
  return DEFAULT_SHARE_IMAGE
}

/**
 * Reference to a shareable item — the minimal identity needed to build its
 * canonical URL and resolve its metadata. `handle` is required for the routes
 * that are handle-scoped (events, organisations).
 */
export type ShareRef =
  | { type: "post"; id: string | number }
  | { type: "community"; id: string | number }
  | { type: "article"; id: string | number }
  | { type: "audio"; id: string | number }
  | { type: "video"; id: string | number }
  | { type: "live"; id: string | number }
  | { type: "event"; id: string | number; handle: string }
  | { type: "organisation"; handle: string }
  | { type: "user"; id: string }
  | { type: "status"; id: string | number }

/**
 * The one place that maps a content reference to its canonical app-relative
 * path. Reuses Frequency's existing routes — no duplicate `/frequency/*` routes.
 */
export function canonicalPath(ref: ShareRef): string {
  switch (ref.type) {
    case "post":
      return `/feed?post=${ref.id}`
    case "community":
      return `/chatrooms/community?q=${ref.id}`
    case "article":
      return `/articles/${ref.id}`
    // Audio, video and live replays are all `show`/`episode` rows and live on
    // the same watch route; only their contentType label differs.
    case "audio":
    case "video":
    case "live":
      return `/live/${ref.id}`
    case "event":
      return `/events/${ref.handle}/${ref.id}`
    case "organisation":
      return `/org/${ref.handle}`
    case "user":
      return `/u/${ref.id}`
    case "status":
      return `/status/${ref.id}`
  }
}

/** Regex fragments that recognise a Frequency canonical path and its id/handle. */
const PATH_MATCHERS: { type: ShareContentType; re: RegExp; groups: ("id" | "handle")[] }[] = [
  { type: "article", re: /^\/articles\/([^/?#]+)/, groups: ["id"] },
  { type: "event", re: /^\/events\/([^/?#]+)\/([^/?#]+)/, groups: ["handle", "id"] },
  { type: "live", re: /^\/live\/([^/?#]+)/, groups: ["id"] },
  { type: "organisation", re: /^\/org\/([^/?#]+)/, groups: ["handle"] },
  { type: "user", re: /^\/u\/([^/?#]+)/, groups: ["id"] },
  { type: "status", re: /^\/status\/([^/?#]+)/, groups: ["id"] },
]

/**
 * Parses a Frequency URL (absolute or app-relative) back into a ShareRef, or
 * null when it isn't a recognised shareable Frequency link. Used by the in-app
 * preview to detect pasted Frequency links and by the resolver to route them.
 * Query-param content (posts, community, live media kind) is matched too.
 */
export function parseFrequencyPath(input: string): ShareRef | null {
  let path = input
  let search = ""
  try {
    // Accept absolute URLs; keep only the path + query.
    if (/^https?:\/\//i.test(input)) {
      const u = new URL(input)
      path = u.pathname
      search = u.search
    } else {
      const qi = input.indexOf("?")
      if (qi >= 0) {
        path = input.slice(0, qi)
        search = input.slice(qi)
      }
    }
  } catch {
    return null
  }

  const params = new URLSearchParams(search)

  // Query-param based routes first.
  if (path === "/feed" && params.get("post")) {
    return { type: "post", id: params.get("post")! }
  }
  if (path === "/chatrooms/community" && params.get("q")) {
    return { type: "community", id: params.get("q")! }
  }

  for (const m of PATH_MATCHERS) {
    const match = path.match(m.re)
    if (!match) continue
    const vals: Record<string, string> = {}
    m.groups.forEach((g, i) => {
      vals[g] = decodeURIComponent(match[i + 1])
    })
    if (m.type === "event") return { type: "event", id: vals.id, handle: vals.handle }
    if (m.type === "organisation") return { type: "organisation", handle: vals.handle }
    if (m.type === "article") return { type: "article", id: vals.id }
    if (m.type === "live") return { type: "live", id: vals.id }
    if (m.type === "user") return { type: "user", id: vals.id }
    if (m.type === "status") return { type: "status", id: vals.id }
  }
  return null
}

/** True when a URL points at this Frequency app (a recognised shareable link). */
export function isFrequencyUrl(input: string): boolean {
  return parseFrequencyPath(input) !== null
}
