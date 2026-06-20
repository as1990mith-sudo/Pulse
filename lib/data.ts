export type Host = {
  id: string
  name: string
  avatar: string
  handle: string
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
  publishedAt?: string
  description: string
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
