// Shared, pure helpers + types for the Upload → Materials/Playlists experience.
// No server-only imports here so this can be used from client components too
// (e.g. to show a platform badge as the admin types a link).

export type MaterialSource = "youtube" | "spotify" | "vimeo" | "facebook" | "drive" | "meet" | "other"

export type MaterialContentType = "video" | "audio" | "article" | "sermon" | "podcast" | "resource"

export type MaterialView = {
  id: number
  organizationId: string
  title: string
  description: string | null
  url: string
  source: MaterialSource
  creator: string | null
  contentType: MaterialContentType
  category: string | null
  tags: string[]
  cover: string | null
  duration: string | null
  /** Epoch ms of the resource's own date (publish/record), for display + sort. */
  resourceDateMs: number | null
  createdAtMs: number
  archived: boolean
}

export const SOURCE_LABELS: Record<MaterialSource, string> = {
  youtube: "YouTube",
  spotify: "Spotify",
  vimeo: "Vimeo",
  facebook: "Facebook",
  drive: "Google Drive",
  meet: "Google Meet",
  other: "Link",
}

export const CONTENT_TYPE_LABELS: Record<MaterialContentType, string> = {
  video: "Video",
  audio: "Audio",
  article: "Article",
  sermon: "Sermon",
  podcast: "Podcast",
  resource: "Resource",
}

/** Detect the hosting platform purely from the URL. */
export function detectSource(rawUrl: string): MaterialSource {
  const u = rawUrl.toLowerCase()
  if (/youtube\.com|youtu\.be/.test(u)) return "youtube"
  if (/spotify\.com/.test(u)) return "spotify"
  if (/vimeo\.com/.test(u)) return "vimeo"
  if (/facebook\.com|fb\.watch/.test(u)) return "facebook"
  if (/drive\.google\.com/.test(u)) return "drive"
  if (/meet\.google\.com/.test(u)) return "meet"
  return "other"
}

/** A sensible default content type for a freshly-recognised source. */
export function defaultContentTypeForSource(source: MaterialSource): MaterialContentType {
  switch (source) {
    case "spotify":
      return "podcast"
    case "drive":
      return "resource"
    case "meet":
      return "video"
    default:
      return "video"
  }
}

/** Whether we can embed this source inline vs. must open the original page. */
export function isEmbeddable(source: MaterialSource): boolean {
  return source === "youtube" || source === "vimeo" || source === "spotify" || source === "facebook"
}

/** Build an embeddable player URL for supported sources, else null. */
export function buildEmbedUrl(source: MaterialSource, url: string): string | null {
  try {
    switch (source) {
      case "youtube": {
        const id = youTubeId(url)
        return id ? `https://www.youtube.com/embed/${id}` : null
      }
      case "vimeo": {
        const m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/)
        return m ? `https://player.vimeo.com/video/${m[1]}` : null
      }
      case "spotify": {
        // open.spotify.com/track/ID → open.spotify.com/embed/track/ID
        const m = url.match(/spotify\.com\/(track|episode|show|playlist|album)\/([A-Za-z0-9]+)/)
        return m ? `https://open.spotify.com/embed/${m[1]}/${m[2]}` : null
      }
      case "facebook":
        return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url)}&show_text=false`
      default:
        return null
    }
  } catch {
    return null
  }
}

export function youTubeId(url: string): string | null {
  const short = url.match(/youtu\.be\/([A-Za-z0-9_-]{6,})/)
  if (short) return short[1]
  const long = url.match(/[?&]v=([A-Za-z0-9_-]{6,})/)
  if (long) return long[1]
  const embed = url.match(/youtube\.com\/embed\/([A-Za-z0-9_-]{6,})/)
  if (embed) return embed[1]
  return null
}

/** Seconds → "48:21" or "1:02:18". */
export function formatDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return ""
  const s = Math.round(totalSeconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const two = (n: number) => n.toString().padStart(2, "0")
  return h > 0 ? `${h}:${two(m)}:${two(sec)}` : `${m}:${two(sec)}`
}

/** Parse a free-text or "mm:ss" duration into seconds; 0 when unknown. */
export function durationToSeconds(label: string | null): number {
  if (!label) return 0
  const parts = label.split(":").map((p) => Number.parseInt(p, 10))
  if (parts.length && parts.every((n) => Number.isFinite(n))) {
    return parts.reduce((acc, n) => acc * 60 + n, 0)
  }
  const min = label.match(/(\d+)\s*min/i)
  if (min) return Number.parseInt(min[1], 10) * 60
  return 0
}

/** Sum of durations → "6h 24m" / "47m". */
export function formatTotalDuration(seconds: number): string {
  if (seconds <= 0) return "0m"
  const h = Math.floor(seconds / 3600)
  const m = Math.round((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m.toString().padStart(2, "0")}m`
  return `${m}m`
}

/** Short display date, e.g. "Aug 28, 2026". */
export function formatMaterialDate(ms: number | null): string {
  if (!ms) return ""
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

export function parseTags(raw: string | null): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === "string") : []
  } catch {
    return []
  }
}

/** Normalise a comma/space separated tag string into clean slugs. */
export function normalizeTags(input: string | string[]): string[] {
  const list = Array.isArray(input) ? input : input.split(",")
  const seen = new Set<string>()
  const out: string[] = []
  for (const t of list) {
    const clean = t.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")
    if (clean && !seen.has(clean)) {
      seen.add(clean)
      out.push(clean)
    }
  }
  return out.slice(0, 12)
}
