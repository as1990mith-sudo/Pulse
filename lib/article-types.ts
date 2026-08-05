// Client-safe article types, shared by server actions and client components.
// Kept out of the "use server" file so both sides can import without pulling in
// server-only code.

export type ArticleStatus = "draft" | "published" | "archived"

/** Categories offered in the editor + used as hub filter chips. */
export const ARTICLE_CATEGORIES = [
  "General",
  "Teaching",
  "Testimony",
  "Devotional",
  "Prophecy",
  "Bible Study",
  "Prayer",
  "Faith & Life",
  "Culture",
  "Poetry",
] as const

export type ArticleCategory = (typeof ARTICLE_CATEGORIES)[number]

/** A writer's public identity + reach, shown on cards and the writer profile. */
export type ArticleAuthor = {
  id: string
  name: string
  handle: string
  initials: string
  color: string
  image: string | null
}

/** A card-sized view of an article (hub feed, profile tab, related lists). */
export type ArticleCard = {
  id: string
  title: string
  excerpt: string
  coverUrl: string | null
  category: string
  tags: string[]
  status: ArticleStatus
  readMinutes: number
  featured: boolean
  likeCount: number
  commentCount: number
  viewCount: number
  publishedAt: string | null
  createdAt: string
  editedAt: string | null
  author: ArticleAuthor
}

/** The full article for the reader page. */
export type ArticleDetail = ArticleCard & {
  bodyHtml: string
  /** Whether the current viewer has liked / saved this article. */
  liked: boolean
  saved: boolean
  /** Whether the current viewer follows this writer's articles. */
  followingWriter: boolean
  /** Whether the current viewer is the author (enables edit controls). */
  isAuthor: boolean
  /** Furthest scroll depth (0-100) the viewer previously reached, for resuming. */
  readingProgress: number
}

/** An article card enriched with the viewer's reading state (for the Library). */
export type LibraryArticleCard = ArticleCard & {
  /** Furthest scroll depth reached, 0-100. */
  percent: number
  /** True once the reader finished (reached the end). */
  completed: boolean
  /** ISO timestamp of the most recent read. */
  lastReadAt: string
}

/** The personalised Library payload for the signed-in reader. */
export type LibraryData = {
  /** Started but not finished, most recent first. */
  continueReading: LibraryArticleCard[]
  /** Everything opened before (completed + in-progress), most recent first. */
  history: LibraryArticleCard[]
  /** Bookmarked articles, most recently saved first. */
  saved: ArticleCard[]
}

/** A threaded comment on an article. */
export type ArticleCommentView = {
  id: string
  parentId: string | null
  body: string
  likes: number
  liked: boolean
  deleted: boolean
  createdAt: string
  editedAt: string | null
  timeAgo: string
  isMine: boolean
  author: ArticleAuthor
  replies: ArticleCommentView[]
}

/** Aggregate reach stats for a writer, shown on the profile Articles tab. */
export type WriterStats = {
  articleCount: number
  totalReads: number
  totalLikes: number
  followerCount: number
  followingWriter: boolean
  isSelf: boolean
}

/** A featured writer chip on the hub. */
export type FeaturedWriter = {
  author: ArticleAuthor
  articleCount: number
  followerCount: number
  followingWriter: boolean
  /** True when the current viewer is this writer (hides the follow button). */
  isSelf: boolean
}
