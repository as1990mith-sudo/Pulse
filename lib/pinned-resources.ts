// Shared, non-server types + constants for the live "Pinned Resources" system.
// These live outside the "use server" action file because a "use server" module
// may only export async functions — runtime values (like the PIN_KINDS array)
// and types must be defined here and imported where needed.

export const PIN_KINDS = ["verse", "pdf", "book", "devotional", "link", "session", "image", "text"] as const
export type PinKind = (typeof PIN_KINDS)[number]

export type PinnedResourceView = {
  id: number
  kind: PinKind
  title: string
  subtitle: string | null
  url: string | null
  refId: string | null
  meta: Record<string, unknown> | null
  createdAt: string
}
