export type Host = {
  id: string
  name: string
  avatar: string
  handle: string
}

// A podcast host account surfaced in the library: a real user who has
// published at least one episode, plus a summary of their catalogue.
export type PodcastHost = {
  id: string // user id (links to their profile)
  name: string
  handle: string
  initials: string
  color: string
  image: string | null
  episodeCount: number
  categories: string[]
  latestTitle: string
  latestAt: string
}

export type Show = {
  id: string
  title: string
  tagline: string
  cover: string
  category: string
  host: Host
  status: "live" | "upcoming" | "ended"
  listeners: number
  startsAt?: string // human readable for upcoming
  duration?: string // for ended episodes
  publishedAt?: string // relative "time ago" (legacy)
  publishedDate?: string // absolute published date, shown only in the player
  description: string
  audioUrl?: string // recorded audio for on-demand episodes
  episodeId?: number // numeric DB id for published episodes (likes/comments)
  likes?: number // like count for published episodes
}

export type DevotionalComment = {
  id: string
  user: string
  initials: string
  color: string
  text: string
  postedAt: string
}

export type Devotional = {
  date: string
  title: string
  verseRef: string
  verse: string
  cover: string
  readingMinutes: number
  body: string[]
  prayer: string
  initialLikes: number
  comments: DevotionalComment[]
}

/**
 * Default attribution shown at the end of every devotional. The orderUrl is a
 * placeholder template link — replace it with the real ordering page later.
 */
export const devotionalSource = {
  author: "Andrew Smith",
  name: "A Day With Jesus",
  orderUrl: "https://example.com/order/a-day-with-jesus",
}
