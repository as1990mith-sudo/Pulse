// Shared, client-safe types for the Instagram-style share sheet. Kept out of
// the "use server" action file so both server and client can import them.

export type ShareItemType = "post" | "episode" | "devotional" | "status" | "live" | "community"

/**
 * A shareable piece of content. `url` is an app-relative path (e.g. "/feed");
 * the share sheet turns it into an absolute URL at runtime. `downloadUrl` +
 * `downloadKind` describe the original media to download, when available.
 */
export type ShareTarget = {
  type: ShareItemType
  /** Stable id within the type — used for save/dedupe. */
  key: string
  title: string
  subtitle?: string | null
  /** App-relative path to the content. */
  url: string
  /** Preview thumbnail (image/video poster). */
  image?: string | null
  /** Original media to download, if downloadable. */
  downloadUrl?: string | null
  downloadKind?: "image" | "video" | "audio" | null
}

/** A user shown in the suggestions grid. */
export type ShareSuggestion = {
  id: string
  name: string
  handle: string
  initials: string
  color: string
  image: string | null
  /** True when the current user and this user follow each other. */
  mutual: boolean
}
