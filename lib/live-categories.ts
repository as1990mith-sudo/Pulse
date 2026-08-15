// Shared list of categories a host can tag a live broadcast with. Kept in a
// client-safe module (not the "use server" actions file) so both the audio and
// video studio consoles can import it for their category dropdowns.
export const LIVE_CATEGORIES = [
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

// Categories for Conversation audio rooms — framed as community gatherings
// rather than broadcast topics. Shown as the room's category pill.
export const CONVERSATION_CATEGORIES = [
  "Bible Study",
  "Prayer",
  "Fellowship",
  "Worship",
  "Discussion",
  "Testimony",
] as const

export type ConversationCategory = (typeof CONVERSATION_CATEGORIES)[number]
