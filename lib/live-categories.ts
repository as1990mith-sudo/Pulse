// Shared list of categories a host can tag a live broadcast with. Kept in a
// client-safe module (not the "use server" actions file) so both the audio and
// video studio consoles can import it for their category dropdowns.
export const LIVE_CATEGORIES = [
  "Religion & Spirituality",
  "Health & Fitness",
  "Family",
  "Leisure",
  "Finance",
  "News",
  "Politics",
  "Science",
  "Society & Culture",
  "Sports",
  "Technology",
] as const

export type LiveCategory = (typeof LIVE_CATEGORIES)[number]
