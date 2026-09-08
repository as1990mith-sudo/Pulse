// Shared metadata for online-event destinations. Kept framework-agnostic (no
// React/icons) so it can be imported by both server actions and client UI.
// Icons live with the UI in `components/events/platform-icon.tsx`.

export type OnlinePlatformId = "frequency" | "youtube" | "facebook" | "instagram" | "tiktok" | "other"

/** One selected online destination, as stored on `announcement.onlinePlatforms`. */
export type OnlineDestination = {
  platform: OnlinePlatformId
  // Optional: the link may not exist when the event is first created. Only a
  // destination WITH a url becomes an actionable button for registrants.
  url?: string
  // Free-text service name, used only when platform === "other".
  name?: string
}

type PlatformMeta = {
  id: OnlinePlatformId
  // Name shown in the admin multi-select and as a destination card heading.
  label: string
  // Public call-to-action verb, e.g. "Watch on YouTube".
  action: string
  // Placeholder for the admin's link field.
  linkPlaceholder: string
}

export const ONLINE_PLATFORMS: PlatformMeta[] = [
  { id: "frequency", label: "Frequency", action: "Join on Frequency", linkPlaceholder: "Frequency live / session link" },
  { id: "youtube", label: "YouTube", action: "Watch on YouTube", linkPlaceholder: "YouTube live / video / channel link" },
  { id: "facebook", label: "Facebook", action: "Join on Facebook", linkPlaceholder: "Facebook live / page / profile link" },
  { id: "instagram", label: "Instagram", action: "View on Instagram", linkPlaceholder: "Instagram profile / live link" },
  { id: "tiktok", label: "TikTok", action: "Watch on TikTok", linkPlaceholder: "TikTok profile / live link" },
  { id: "other", label: "Other", action: "Open link", linkPlaceholder: "https://…" },
]

const PLATFORM_BY_ID = new Map(ONLINE_PLATFORMS.map((p) => [p.id, p]))

export function getPlatformMeta(id: string): PlatformMeta | undefined {
  return PLATFORM_BY_ID.get(id as OnlinePlatformId)
}

/** Display label for a destination — the service name for "other", else the platform label. */
export function destinationLabel(d: OnlineDestination): string {
  if (d.platform === "other") return d.name?.trim() || "Other"
  return getPlatformMeta(d.platform)?.label ?? d.platform
}

/** Public CTA verb for a destination — "Join on {name}" for a named "other". */
export function destinationAction(d: OnlineDestination): string {
  if (d.platform === "other") {
    const name = d.name?.trim()
    return name ? `Join on ${name}` : "Open link"
  }
  return getPlatformMeta(d.platform)?.action ?? "Open link"
}

/** Only destinations that are actionable for registrants: a platform WITH a link. */
export function actionableDestinations(list: OnlineDestination[] | null | undefined): OnlineDestination[] {
  if (!Array.isArray(list)) return []
  return list.filter((d) => typeof d.url === "string" && d.url.trim().length > 0)
}

const VALID_IDS = new Set<OnlinePlatformId>(ONLINE_PLATFORMS.map((p) => p.id))

/** Force a user-supplied link to an http(s) URL, or drop it if unusable. */
export function normalizeUrl(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined
  const v = raw.trim()
  if (!v) return undefined
  const withProto = /^https?:\/\//i.test(v) ? v : `https://${v}`
  try {
    const u = new URL(withProto)
    if (u.protocol !== "http:" && u.protocol !== "https:") return undefined
    return u.toString()
  } catch {
    return undefined
  }
}

/**
 * Server-side cleanup of the admin's selected destinations: keeps only valid
 * platforms, normalises links to safe http(s) URLs, and de-duplicates every
 * platform except "other" (a single card each; "other" may repeat for multiple
 * external services). Preserves the admin's chosen order.
 */
export function sanitizeDestinations(input: unknown): OnlineDestination[] {
  if (!Array.isArray(input)) return []
  const out: OnlineDestination[] = []
  const seen = new Set<string>()
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue
    const platform = (raw as { platform?: unknown }).platform
    if (typeof platform !== "string" || !VALID_IDS.has(platform as OnlinePlatformId)) continue
    if (platform !== "other") {
      if (seen.has(platform)) continue
      seen.add(platform)
    }
    const dest: OnlineDestination = { platform: platform as OnlinePlatformId }
    const url = normalizeUrl((raw as { url?: unknown }).url)
    if (url) dest.url = url
    if (platform === "other") {
      const name = (raw as { name?: unknown }).name
      if (typeof name === "string" && name.trim()) dest.name = name.trim().slice(0, 60)
    }
    out.push(dest)
  }
  return out
}
