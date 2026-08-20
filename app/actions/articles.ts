"use server"

import { and, desc, eq, inArray, ne, or, ilike, sql, count } from "drizzle-orm"
import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import {
  article,
  articleComment,
  articleCommentReport,
  articleFollow,
  articleReadingProgress,
  like,
  notification,
  savedItem,
  user as userTable,
} from "@/lib/db/schema"
import { getActiveHomeMemberIds } from "@/lib/home/active-home"
import { getStaffUserIds } from "@/lib/admin-auth"
import { getAvatarColor, getHandle, getInitials } from "@/lib/identity"
import { getLikedSet, setLike } from "@/lib/likes"
import {
  ARTICLE_MIN_WORDS,
  countWords,
  deriveExcerpt,
  estimateReadMinutes,
  htmlToPlainText,
  sanitizeArticleHtml,
} from "@/lib/article-sanitize"
import { ARTICLE_CATEGORIES } from "@/lib/article-types"
import {
  downgradeBlockedHtmlMentions,
  extractHtmlMentionRefs,
  type MentionRef,
} from "@/lib/mentions"
import { filterAllowedMentions } from "@/lib/mentions-server"
import type {
  ArticleAuthor,
  ArticleCard,
  ArticleCommentView,
  ArticleDetail,
  ArticleStatus,
  FeaturedWriter,
  LibraryArticleCard,
  LibraryData,
  WriterStats,
} from "@/lib/article-types"

// --- Auth helpers ----------------------------------------------------------

async function getSessionUser() {
  const session = await auth.api.getSession({ headers: await headers() })
  return session?.user ?? null
}

async function requireUser() {
  const user = await getSessionUser()
  if (!user) throw new Error("You must be signed in to do that.")
  return user
}

// --- Shared helpers --------------------------------------------------------

type ArticleRow = typeof article.$inferSelect

function timeAgo(date: Date): string {
  const secs = Math.floor((Date.now() - date.getTime()) / 1000)
  if (secs < 60) return "now"
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d`
  const weeks = Math.floor(days / 7)
  if (weeks < 5) return `${weeks}w`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo`
  return `${Math.floor(days / 365)}y`
}

// Resolves a set of userIds into fresh display identities. Falls back to the
// name stored on the article row (passed in `fallback`) when the account is
// missing, so old rows still render.
async function resolveAuthors(
  userIds: string[],
  fallback: Map<string, { name: string; image: string | null }> = new Map(),
): Promise<Map<string, ArticleAuthor>> {
  const unique = [...new Set(userIds)].filter(Boolean)
  const out = new Map<string, ArticleAuthor>()
  if (unique.length === 0) return out
  const rows = await db
    .select({ id: userTable.id, name: userTable.name, image: userTable.image })
    .from(userTable)
    .where(inArray(userTable.id, unique))
  const byId = new Map(rows.map((r) => [r.id, r]))
  for (const id of unique) {
    const fresh = byId.get(id)
    const name = fresh?.name ?? fallback.get(id)?.name ?? "Someone"
    out.set(id, {
      id,
      name,
      handle: getHandle(name),
      initials: getInitials(name),
      color: getAvatarColor(id),
      image: fresh?.image ?? fallback.get(id)?.image ?? null,
    })
  }
  return out
}

function toCard(row: ArticleRow, author: ArticleAuthor): ArticleCard {
  return {
    id: String(row.id),
    title: row.title,
    excerpt: row.excerpt,
    coverUrl: row.coverUrl,
    category: row.category,
    tags: row.tags ?? [],
    status: row.status as ArticleStatus,
    readMinutes: row.readMinutes,
    featured: row.featured,
    likeCount: row.likeCount,
    commentCount: row.commentCount,
    viewCount: row.viewCount,
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    editedAt: row.editedAt ? row.editedAt.toISOString() : null,
    author,
  }
}

// Maps a batch of article rows to cards, resolving authors in one query.
async function toCards(rows: ArticleRow[]): Promise<ArticleCard[]> {
  if (rows.length === 0) return []
  const fallback = new Map(rows.map((r) => [r.authorId, { name: r.authorName, image: r.authorImage }]))
  const authors = await resolveAuthors(
    rows.map((r) => r.authorId),
    fallback,
  )
  return rows.map((r) => toCard(r, authors.get(r.authorId)!))
}

/**
 * The set of authorIds whose published articles may appear on the *global*
 * Articles hub/feed: active members of the viewer's Home who are ALSO platform
 * admins/staff. Members can still write and publish — their pieces simply stay
 * on their own profile (see getWriterArticles) and never surface on the shared
 * Articles page. Returns [] when there's no Home or no staff authors.
 */
async function getArticleHubAuthorIds(): Promise<string[]> {
  const { memberIds } = await getActiveHomeMemberIds()
  if (memberIds.length === 0) return []
  const staff = await getStaffUserIds()
  return memberIds.filter((id) => staff.has(id))
}

// --- Hub + feed reads ------------------------------------------------------

/**
 * The Articles hub payload: a featured article, featured writers, and the most
 * recent published articles. All reads are global (everyone sees the hub).
 */
export async function getArticleHub(): Promise<{
  featured: ArticleCard | null
  editorsPicks: ArticleCard[]
  latest: ArticleCard[]
  categories: string[]
}> {
  // The Articles hub is a curated, staff-authored surface within the viewer's
  // current Home. Only pieces by admins/staff of that Home appear; members'
  // articles live on their own profiles instead. No Home / no staff ⇒ nothing.
  const memberIds = await getArticleHubAuthorIds()
  if (memberIds.length === 0) {
    return { featured: null, editorsPicks: [], latest: [], categories: [...ARTICLE_CATEGORIES] }
  }

  const [featuredRows, latestRows, pickRows] = await Promise.all([
    db
      .select()
      .from(article)
      .where(
        and(eq(article.status, "published"), eq(article.featured, true), inArray(article.authorId, memberIds)),
      )
      .orderBy(desc(article.publishedAt))
      .limit(1),
    db
      .select()
      .from(article)
      .where(and(eq(article.status, "published"), inArray(article.authorId, memberIds)))
      .orderBy(desc(article.publishedAt))
      .limit(30),
    // Editor's Pick: curated standouts — hand-flagged featured first, then the
    // best-performing pieces by engagement. A generous limit lets us drop the
    // hero article and still fill the rail.
    db
      .select()
      .from(article)
      .where(and(eq(article.status, "published"), inArray(article.authorId, memberIds)))
      .orderBy(desc(article.featured), desc(article.likeCount), desc(article.viewCount), desc(article.publishedAt))
      .limit(9),
  ])

  // Fall back to the newest published article when nothing is flagged featured.
  const featuredRow = featuredRows[0] ?? latestRows[0] ?? null
  const [featuredCard] = featuredRow ? await toCards([featuredRow]) : [null]
  const latest = await toCards(latestRows.filter((r) => r.id !== featuredRow?.id))
  // Exclude the hero from the picks rail so it isn't shown twice.
  const editorsPicks = await toCards(pickRows.filter((r) => r.id !== featuredRow?.id).slice(0, 6))

  return {
    featured: featuredCard ?? null,
    editorsPicks,
    latest,
    categories: [...ARTICLE_CATEGORIES],
  }
}

/**
 * A page of published articles, optionally filtered by category and/or search.
 * Cursor is the last seen article id (keyset by publishedAt+id descending).
 */
export async function getArticleFeed(input: {
  category?: string
  search?: string
  offset?: number
  limit?: number
  /** Article to omit from the results (e.g. the one shown in the featured hero). */
  excludeId?: string
}): Promise<{ items: ArticleCard[]; nextOffset: number | null }> {
  const limit = Math.min(Math.max(input.limit ?? 12, 1), 30)
  const offset = Math.max(input.offset ?? 0, 0)

  // Staff-only: the shared feed lists articles by admins/staff of the viewer's
  // active Home. Members' articles stay on their own profile.
  const memberIds = await getArticleHubAuthorIds()
  if (memberIds.length === 0) return { items: [], nextOffset: null }

  const filters = [eq(article.status, "published"), inArray(article.authorId, memberIds)]
  const excludeNum = Number(input.excludeId)
  if (Number.isFinite(excludeNum)) filters.push(ne(article.id, excludeNum))
  if (input.category && input.category !== "All") filters.push(eq(article.category, input.category))
  if (input.search?.trim()) {
    const q = `%${input.search.trim()}%`
    filters.push(or(ilike(article.title, q), ilike(article.excerpt, q))!)
  }

  const rows = await db
    .select()
    .from(article)
    .where(and(...filters))
    .orderBy(desc(article.publishedAt), desc(article.id))
    .limit(limit + 1)
    .offset(offset)

  const hasMore = rows.length > limit
  const items = await toCards(rows.slice(0, limit))
  return { items, nextOffset: hasMore ? offset + limit : null }
}

/**
 * The full article for the reader. Returns a published article to anyone, or a
 * draft/archived article only to its author. Includes the viewer's liked/saved/
 * following state.
 */
export async function getArticle(id: string): Promise<ArticleDetail | null> {
  const numId = Number(id)
  if (!Number.isFinite(numId)) return null
  const [row] = await db.select().from(article).where(eq(article.id, numId)).limit(1)
  if (!row) return null

  const viewer = await getSessionUser()
  const isAuthor = viewer?.id === row.authorId
  if (row.status !== "published" && !isAuthor) return null

  // Members-only: you can always read your own article, but someone else's is
  // only visible when its author is an active member of your current Home — so a
  // direct URL can't leak an article from outside the Home you're inside.
  if (!isAuthor) {
    const { memberIds } = await getActiveHomeMemberIds()
    if (!memberIds.includes(row.authorId)) return null
  }

  const [card] = await toCards([row])
  let liked = false
  let saved = false
  let followingWriter = false
  let readingProgress = 0
  if (viewer) {
    const [likedSet, savedRows, followRows, progressRows] = await Promise.all([
      getLikedSet(viewer.id, "article", [row.id]),
      db
        .select({ id: savedItem.id })
        .from(savedItem)
        .where(
          and(eq(savedItem.userId, viewer.id), eq(savedItem.itemType, "article"), eq(savedItem.itemKey, String(row.id))),
        )
        .limit(1),
      db
        .select({ id: articleFollow.id })
        .from(articleFollow)
        .where(and(eq(articleFollow.writerId, row.authorId), eq(articleFollow.followerId, viewer.id)))
        .limit(1),
      db
        .select({ percent: articleReadingProgress.percent })
        .from(articleReadingProgress)
        .where(and(eq(articleReadingProgress.userId, viewer.id), eq(articleReadingProgress.articleId, row.id)))
        .limit(1),
    ])
    liked = likedSet.has(row.id)
    saved = savedRows.length > 0
    followingWriter = followRows.length > 0
    readingProgress = progressRows[0]?.percent ?? 0
  }

  return { ...card, bodyHtml: row.bodyHtml, liked, saved, followingWriter, isAuthor, readingProgress }
}

/** Up to 4 more published articles by the same author (excludes the current). */
export async function getMoreFromAuthor(articleId: string, authorId: string): Promise<ArticleCard[]> {
  const numId = Number(articleId)
  const rows = await db
    .select()
    .from(article)
    .where(
      and(
        eq(article.authorId, authorId),
        eq(article.status, "published"),
        Number.isFinite(numId) ? ne(article.id, numId) : undefined,
      ),
    )
    .orderBy(desc(article.publishedAt))
    .limit(4)
  return toCards(rows)
}

/** Up to 4 related published articles in the same category (excludes current + author). */
export async function getRelatedArticles(articleId: string, category: string, authorId: string): Promise<ArticleCard[]> {
  const numId = Number(articleId)
  const rows = await db
    .select()
    .from(article)
    .where(
      and(
        eq(article.status, "published"),
        eq(article.category, category),
        ne(article.authorId, authorId),
        Number.isFinite(numId) ? ne(article.id, numId) : undefined,
      ),
    )
    .orderBy(desc(article.publishedAt))
    .limit(4)
  return toCards(rows)
}

/** The current user's own articles, grouped by status. */
export async function getMyArticles(): Promise<{
  drafts: ArticleCard[]
  published: ArticleCard[]
  archived: ArticleCard[]
}> {
  const user = await getSessionUser()
  if (!user) return { drafts: [], published: [], archived: [] }
  const rows = await db
    .select()
    .from(article)
    .where(eq(article.authorId, user.id))
    .orderBy(desc(article.updatedAt))
  const cards = await toCards(rows)
  return {
    drafts: cards.filter((c) => c.status === "draft"),
    published: cards.filter((c) => c.status === "published"),
    archived: cards.filter((c) => c.status === "archived"),
  }
}

/** A single article row owned by the current user, for the editor (any status). */
export async function getEditableArticle(id: string): Promise<(ArticleCard & { bodyHtml: string }) | null> {
  const user = await getSessionUser()
  if (!user) return null
  const numId = Number(id)
  if (!Number.isFinite(numId)) return null
  const [row] = await db.select().from(article).where(eq(article.id, numId)).limit(1)
  if (!row || row.authorId !== user.id) return null
  const [card] = await toCards([row])
  return { ...card, bodyHtml: row.bodyHtml }
}

// --- Writer profile reads --------------------------------------------------

/** Published articles by a given writer, for the profile Articles tab. */
export async function getWriterArticles(userId: string): Promise<ArticleCard[]> {
  const rows = await db
    .select()
    .from(article)
    .where(and(eq(article.authorId, userId), eq(article.status, "published")))
    .orderBy(desc(article.publishedAt))
  return toCards(rows)
}

/** Aggregate reach for a writer + the viewer's follow state. */
export async function getWriterStats(userId: string): Promise<WriterStats> {
  const viewer = await getSessionUser()
  const [agg, followerRow, followingRow] = await Promise.all([
    db
      .select({
        articleCount: count(),
        totalReads: sql<number>`coalesce(sum(${article.viewCount}), 0)`,
        totalLikes: sql<number>`coalesce(sum(${article.likeCount}), 0)`,
      })
      .from(article)
      .where(and(eq(article.authorId, userId), eq(article.status, "published"))),
    db.select({ n: count() }).from(articleFollow).where(eq(articleFollow.writerId, userId)),
    viewer
      ? db
          .select({ id: articleFollow.id })
          .from(articleFollow)
          .where(and(eq(articleFollow.writerId, userId), eq(articleFollow.followerId, viewer.id)))
          .limit(1)
      : Promise.resolve([] as { id: number }[]),
  ])
  return {
    articleCount: Number(agg[0]?.articleCount ?? 0),
    totalReads: Number(agg[0]?.totalReads ?? 0),
    totalLikes: Number(agg[0]?.totalLikes ?? 0),
    followerCount: Number(followerRow[0]?.n ?? 0),
    followingWriter: followingRow.length > 0,
    isSelf: viewer?.id === userId,
  }
}

/** Top writers by follower count then article count, for the hub rail. */
export async function getFeaturedWriters(limit = 10): Promise<FeaturedWriter[]> {
  // Staff-only: the hub's writers rail features admins/staff of the viewer's
  // active Home, matching the articles shown alongside it.
  const memberIds = await getArticleHubAuthorIds()
  if (memberIds.length === 0) return []

  // Writers who have at least one published article, ranked by published count.
  const rows = await db
    .select({ authorId: article.authorId, articleCount: count() })
    .from(article)
    .where(and(eq(article.status, "published"), inArray(article.authorId, memberIds)))
    .groupBy(article.authorId)
    .orderBy(desc(count()))
    .limit(limit)
  if (rows.length === 0) return []

  const ids = rows.map((r) => r.authorId)
  const viewer = await getSessionUser()
  const [authors, followerRows, viewerFollows] = await Promise.all([
    resolveAuthors(ids),
    db
      .select({ writerId: articleFollow.writerId, n: count() })
      .from(articleFollow)
      .where(inArray(articleFollow.writerId, ids))
      .groupBy(articleFollow.writerId),
    (async () => {
      if (!viewer) return new Set<string>()
      const fr = await db
        .select({ writerId: articleFollow.writerId })
        .from(articleFollow)
        .where(and(eq(articleFollow.followerId, viewer.id), inArray(articleFollow.writerId, ids)))
      return new Set(fr.map((r) => r.writerId))
    })(),
  ])
  const followerBy = new Map(followerRows.map((r) => [r.writerId, Number(r.n)]))

  return rows.map((r) => ({
    author: authors.get(r.authorId)!,
    articleCount: Number(r.articleCount),
    followerCount: followerBy.get(r.authorId) ?? 0,
    followingWriter: viewerFollows.has(r.authorId),
    isSelf: viewer?.id === r.authorId,
  }))
}

// --- Comment reads ---------------------------------------------------------

/** Threaded comments for an article, newest top-level first. */
export async function getArticleComments(articleId: string): Promise<ArticleCommentView[]> {
  const numId = Number(articleId)
  if (!Number.isFinite(numId)) return []
  const rows = await db
    .select()
    .from(articleComment)
    .where(eq(articleComment.articleId, numId))
    .orderBy(desc(articleComment.createdAt))

  const viewer = await getSessionUser()
  const likedSet = viewer ? await getLikedSet(viewer.id, "article_comment", rows.map((r) => r.id)) : new Set<number>()
  const authors = await resolveAuthors(
    rows.map((r) => r.userId),
    new Map(rows.map((r) => [r.userId, { name: r.userName, image: r.userImage }])),
  )

  const toView = (row: typeof rows[number]): ArticleCommentView => ({
    id: String(row.id),
    parentId: row.parentId ? String(row.parentId) : null,
    body: row.deleted ? "" : row.body,
    likes: row.likes,
    liked: likedSet.has(row.id),
    deleted: row.deleted,
    createdAt: row.createdAt.toISOString(),
    editedAt: row.editedAt ? row.editedAt.toISOString() : null,
    timeAgo: timeAgo(row.createdAt),
    isMine: viewer?.id === row.userId,
    author: authors.get(row.userId)!,
    replies: [],
  })

  const views = new Map<string, ArticleCommentView>()
  const roots: ArticleCommentView[] = []
  // Oldest-first for stable reply ordering under each parent.
  const ordered = [...rows].reverse()
  for (const row of ordered) views.set(String(row.id), toView(row))
  for (const row of ordered) {
    const view = views.get(String(row.id))!
    if (row.parentId && views.has(String(row.parentId))) {
      views.get(String(row.parentId))!.replies.push(view)
    } else {
      roots.push(view)
    }
  }
  // Newest root comments first; replies stay oldest-first.
  roots.reverse()
  return roots
}

// --- Writes: publishing lifecycle ------------------------------------------

/**
 * Creates or updates one of the current user's articles. Body HTML is sanitized
 * server-side; excerpt + read time are derived. `status` controls visibility.
 * Returns the article id (create or update).
 */
/**
 * Privacy-checks the @mentions embedded in a sanitized article body. Returns
 * the body with any BLOCKED mention anchors downgraded to plain `@Name` text,
 * plus the list of allowed mentions (for storage + notifications).
 */
async function resolveArticleMentions(
  authorId: string,
  bodyHtml: string,
): Promise<{ bodyHtml: string; allowed: MentionRef[] }> {
  const refs = extractHtmlMentionRefs(bodyHtml)
  if (refs.length === 0) return { bodyHtml, allowed: [] }
  const allowed = await filterAllowedMentions(authorId, refs)
  const allowedIds = new Set(allowed.map((m) => m.userId))
  const blocked = new Set(refs.map((m) => m.userId).filter((id) => !allowedIds.has(id)))
  return { bodyHtml: downgradeBlockedHtmlMentions(bodyHtml, blocked), allowed }
}

/** Notifies newly-tagged users that they were mentioned in an article. */
async function notifyArticleMentions(
  actor: { id: string; name: string },
  mentions: MentionRef[],
  articleId: number,
  title: string,
  previous: MentionRef[] = [],
) {
  const already = new Set(previous.map((m) => m.userId))
  const targets = mentions.filter((m) => m.userId !== actor.id && !already.has(m.userId))
  if (targets.length === 0) return
  const link = `/articles/${articleId}`
  await db.insert(notification).values(
    targets.map((m) => ({
      userId: m.userId,
      actorId: actor.id,
      actorName: actor.name,
      type: "mention" as const,
      message: `${actor.name} mentioned you in "${title}"`,
      link,
    })),
  )
}

export async function saveArticle(input: {
  id?: string
  title: string
  bodyHtml: string
  excerpt?: string
  coverUrl?: string | null
  category?: string
  tags?: string[]
  status?: ArticleStatus
}): Promise<{ id: string }> {
  const user = await requireUser()
  const title = input.title.trim()
  if (!title) throw new Error("Give your article a title.")
  if (title.length > 160) throw new Error("Title is too long (max 160 characters).")

  const sanitized = sanitizeArticleHtml(input.bodyHtml)
  // Privacy-check @mentions; blocked ones are downgraded to plain text in-body.
  const { bodyHtml, allowed: mentionRefs } = await resolveArticleMentions(user.id, sanitized)
  const plain = htmlToPlainText(bodyHtml)
  const excerpt = (input.excerpt?.trim() || deriveExcerpt(bodyHtml)).slice(0, 280)
  const readMinutes = estimateReadMinutes(bodyHtml)
  const category = ARTICLE_CATEGORIES.includes((input.category ?? "General") as never)
    ? (input.category as string)
    : "General"
  const tags = (input.tags ?? []).map((t) => t.trim()).filter(Boolean).slice(0, 8)
  const status: ArticleStatus = input.status ?? "draft"
  if (status === "published") {
    if (!plain) throw new Error("Add some content before publishing.")
    const words = countWords(bodyHtml)
    if (words < ARTICLE_MIN_WORDS) {
      throw new Error(
        `Articles must be at least ${ARTICLE_MIN_WORDS} words to publish. Yours has ${words} word${words === 1 ? "" : "s"}.`,
      )
    }
  }

  const authorName = user.name
  const authorHandle = getHandle(user.name)

  if (input.id) {
    const numId = Number(input.id)
    const [existing] = await db.select().from(article).where(eq(article.id, numId)).limit(1)
    if (!existing || existing.authorId !== user.id) throw new Error("Article not found.")
    const nowPublishing = status === "published" && existing.status !== "published"
    await db
      .update(article)
      .set({
        title,
        bodyHtml,
        excerpt,
        coverUrl: input.coverUrl ?? null,
        category,
        tags,
        mentions: mentionRefs.length > 0 ? mentionRefs : null,
        status,
        readMinutes,
        authorName,
        authorHandle,
        authorImage: user.image ?? null,
        publishedAt: nowPublishing ? new Date() : existing.publishedAt,
        editedAt: existing.status === "published" ? new Date() : existing.editedAt,
        updatedAt: new Date(),
      })
      .where(eq(article.id, numId))
    if (nowPublishing) await notifyFollowers(user.id, authorName, numId, title)
    // Notify mentioned users once the article is public. On re-saves of an
    // already-published article, only newly-added mentions are notified.
    if (status === "published") {
      await notifyArticleMentions(
        { id: user.id, name: authorName },
        mentionRefs,
        numId,
        title,
        existing.status === "published" ? existing.mentions ?? [] : [],
      )
    }
    revalidateArticle(numId, user.id)
    return { id: String(numId) }
  }

  const [created] = await db
    .insert(article)
    .values({
      authorId: user.id,
      authorName,
      authorHandle,
      authorImage: user.image ?? null,
      title,
      bodyHtml,
      excerpt,
      coverUrl: input.coverUrl ?? null,
      category,
      tags,
      mentions: mentionRefs.length > 0 ? mentionRefs : null,
      status,
      readMinutes,
      publishedAt: status === "published" ? new Date() : null,
    })
    .returning({ id: article.id })
  if (status === "published") await notifyFollowers(user.id, authorName, created.id, title)
  if (status === "published") {
    await notifyArticleMentions({ id: user.id, name: authorName }, mentionRefs, created.id, title)
  }
  revalidateArticle(created.id, user.id)
  return { id: String(created.id) }
}

/** Flips an existing draft/archived article to published. */
export async function publishArticle(id: string): Promise<{ id: string }> {
  const user = await requireUser()
  const numId = Number(id)
  const [row] = await db.select().from(article).where(eq(article.id, numId)).limit(1)
  if (!row || row.authorId !== user.id) throw new Error("Article not found.")
  if (!htmlToPlainText(row.bodyHtml)) throw new Error("Add some content before publishing.")
  const words = countWords(row.bodyHtml)
  if (words < ARTICLE_MIN_WORDS) {
    throw new Error(
      `Articles must be at least ${ARTICLE_MIN_WORDS} words to publish. Yours has ${words} word${words === 1 ? "" : "s"}.`,
    )
  }
  const firstPublish = !row.publishedAt
  await db
    .update(article)
    .set({
      status: "published",
      publishedAt: firstPublish ? new Date() : row.publishedAt,
      updatedAt: new Date(),
    })
    .where(eq(article.id, numId))
  if (row.status !== "published") {
    await notifyFollowers(user.id, row.authorName, numId, row.title)
    // First public appearance — notify anyone tagged in the saved body.
    await notifyArticleMentions({ id: user.id, name: row.authorName }, row.mentions ?? [], numId, row.title)
  }
  revalidateArticle(numId, user.id)
  return { id: String(numId) }
}

/** Moves a published article back to a private draft. */
export async function unpublishArticle(id: string): Promise<void> {
  await setStatus(id, "draft")
}

/** Archives an article (hidden from the hub, kept in "My Articles"). */
export async function archiveArticle(id: string): Promise<void> {
  await setStatus(id, "archived")
}

async function setStatus(id: string, status: ArticleStatus): Promise<void> {
  const user = await requireUser()
  const numId = Number(id)
  const [row] = await db.select({ authorId: article.authorId }).from(article).where(eq(article.id, numId)).limit(1)
  if (!row || row.authorId !== user.id) throw new Error("Article not found.")
  await db.update(article).set({ status, updatedAt: new Date() }).where(eq(article.id, numId))
  revalidateArticle(numId, user.id)
}

/** Permanently deletes one of the current user's articles + its comments. */
export async function deleteArticle(id: string): Promise<void> {
  const user = await requireUser()
  const numId = Number(id)
  const [row] = await db.select({ authorId: article.authorId }).from(article).where(eq(article.id, numId)).limit(1)
  if (!row || row.authorId !== user.id) throw new Error("Article not found.")
  await db.delete(articleComment).where(eq(articleComment.articleId, numId))
  await db.delete(like).where(and(eq(like.targetType, "article"), eq(like.targetId, numId)))
  await db.delete(savedItem).where(and(eq(savedItem.itemType, "article"), eq(savedItem.itemKey, String(numId))))
  await db.delete(article).where(eq(article.id, numId))
  revalidateArticle(numId, user.id)
}

/** Increments the view counter (once per call). Skips the author's own views. */
export async function recordArticleView(id: string): Promise<void> {
  const numId = Number(id)
  if (!Number.isFinite(numId)) return
  const viewer = await getSessionUser()
  const [row] = await db.select({ authorId: article.authorId }).from(article).where(eq(article.id, numId)).limit(1)
  if (!row) return
  if (viewer?.id === row.authorId) return
  await db
    .update(article)
    .set({ viewCount: sql`${article.viewCount} + 1` })
    .where(eq(article.id, numId))
}

/** Depth (0-100) at/above which an article counts as finished reading. */
const READ_COMPLETE_THRESHOLD = 90

/**
 * Records how far the signed-in reader has scrolled through an article. Upserts
 * one row per (user, article): `percent` only ever grows (furthest depth) so
 * flicking back up never loses progress, `completed` latches once the end is
 * reached, and `lastReadAt` always refreshes so the Library can order by recency.
 * A no-op for signed-out readers.
 */
export async function saveReadingProgress(input: { articleId: string; percent: number }): Promise<void> {
  const viewer = await getSessionUser()
  if (!viewer) return
  const numId = Number(input.articleId)
  if (!Number.isFinite(numId)) return
  const pct = Math.max(0, Math.min(100, Math.round(input.percent)))
  const completed = pct >= READ_COMPLETE_THRESHOLD

  await db
    .insert(articleReadingProgress)
    .values({ userId: viewer.id, articleId: numId, percent: pct, completed, lastReadAt: new Date() })
    .onConflictDoUpdate({
      target: [articleReadingProgress.userId, articleReadingProgress.articleId],
      set: {
        percent: sql`GREATEST(${articleReadingProgress.percent}, ${pct})`,
        completed: sql`${articleReadingProgress.completed} OR ${completed}`,
        lastReadAt: new Date(),
      },
    })
}

/**
 * Remove a single article from the viewer's reading history (their Library
 * "Reading History" / "Continue Reading" entry). Scoped to the signed-in user
 * so a reader can only prune their own history. Idempotent — deleting an entry
 * that isn't there is a no-op.
 */
export async function deleteReadingHistory(articleId: string): Promise<void> {
  const viewer = await getSessionUser()
  if (!viewer) return
  const numId = Number(articleId)
  if (!Number.isFinite(numId)) return

  await db
    .delete(articleReadingProgress)
    .where(and(eq(articleReadingProgress.userId, viewer.id), eq(articleReadingProgress.articleId, numId)))

  revalidatePath("/library")
}

/**
 * The signed-in reader's personalised Library: articles they've started but not
 * finished ("Continue Reading"), everything they've opened ("Reading History",
 * with a completed flag), and the articles they've bookmarked ("Saved"). All
 * scoped to the viewer; signed-out users get empty lists.
 */
export async function getLibraryArticles(): Promise<LibraryData> {
  const viewer = await getSessionUser()
  if (!viewer) return { continueReading: [], history: [], saved: [] }

  // Progress rows joined to their (published) article, most-recently-read first.
  const progressRows = await db
    .select({ art: article, percent: articleReadingProgress.percent, completed: articleReadingProgress.completed, lastReadAt: articleReadingProgress.lastReadAt })
    .from(articleReadingProgress)
    .innerJoin(article, eq(article.id, articleReadingProgress.articleId))
    .where(and(eq(articleReadingProgress.userId, viewer.id), eq(article.status, "published")))
    .orderBy(desc(articleReadingProgress.lastReadAt))
    .limit(40)

  const cards = await toCards(progressRows.map((r) => r.art))
  const cardById = new Map(cards.map((c) => [c.id, c]))
  const enriched: LibraryArticleCard[] = progressRows
    .map((r) => {
      const card = cardById.get(String(r.art.id))
      if (!card) return null
      return { ...card, percent: r.percent, completed: r.completed, lastReadAt: r.lastReadAt.toISOString() }
    })
    .filter((c): c is LibraryArticleCard => c !== null)

  const continueReading = enriched.filter((c) => !c.completed && c.percent > 0 && c.percent < READ_COMPLETE_THRESHOLD).slice(0, 12)
  const history = enriched.slice(0, 30)

  // Saved articles (bookmarks), newest-saved first, resolved to full cards.
  const savedRows = await db
    .select({ key: savedItem.itemKey })
    .from(savedItem)
    .where(and(eq(savedItem.userId, viewer.id), eq(savedItem.itemType, "article")))
    .orderBy(desc(savedItem.createdAt))
  const savedIds = savedRows.map((r) => Number(r.key)).filter((n) => Number.isFinite(n))
  let saved: ArticleCard[] = []
  if (savedIds.length > 0) {
    const savedArticleRows = await db
      .select()
      .from(article)
      .where(and(inArray(article.id, savedIds), eq(article.status, "published")))
    const savedCards = await toCards(savedArticleRows)
    const savedCardById = new Map(savedCards.map((c) => [c.id, c]))
    // Preserve the saved-at ordering (the query above doesn't guarantee it).
    saved = savedIds
      .map((id) => savedCardById.get(String(id)))
      .filter((c): c is ArticleCard => Boolean(c))
  }

  return { continueReading, history, saved }
}

// --- Writes: engagement ----------------------------------------------------

/** Toggles the current user's like on an article. Idempotent + counter-safe. */
export async function setArticleLike(input: { id: string; liked: boolean }): Promise<void> {
  const user = await requireUser()
  const numId = Number(input.id)
  const [row] = await db
    .select({ likeCount: article.likeCount, authorId: article.authorId, title: article.title })
    .from(article)
    .where(eq(article.id, numId))
    .limit(1)
  if (!row) return
  const { changed } = await setLike(user.id, "article", numId, input.liked)
  if (!changed) return
  const next = Math.max(0, row.likeCount + (input.liked ? 1 : -1))
  await db.update(article).set({ likeCount: next }).where(eq(article.id, numId))
  if (input.liked && row.authorId !== user.id) {
    await db.insert(notification).values({
      userId: row.authorId,
      actorId: user.id,
      actorName: user.name,
      type: "article",
      message: `${user.name} liked your article`,
      link: `/articles/${numId}`,
    })
  }
  revalidateArticle(numId, row.authorId)
}

/** Adds a comment (or reply) to an article. */
export async function addArticleComment(input: {
  articleId: string
  parentId?: string | null
  body: string
}): Promise<ArticleCommentView> {
  const user = await requireUser()
  const numId = Number(input.articleId)
  const body = input.body.trim()
  if (!body) throw new Error("Comment cannot be empty.")
  if (body.length > 2000) throw new Error("Comment is too long.")
  const [row] = await db
    .select({ authorId: article.authorId })
    .from(article)
    .where(eq(article.id, numId))
    .limit(1)
  if (!row) throw new Error("Article not found.")

  const parentId = input.parentId ? Number(input.parentId) : null
  const [inserted] = await db
    .insert(articleComment)
    .values({
      articleId: numId,
      parentId: parentId && Number.isFinite(parentId) ? parentId : null,
      userId: user.id,
      userName: user.name,
      userImage: user.image ?? null,
      body,
    })
    .returning()
  await db.update(article).set({ commentCount: sql`${article.commentCount} + 1` }).where(eq(article.id, numId))
  if (row.authorId !== user.id) {
    await db.insert(notification).values({
      userId: row.authorId,
      actorId: user.id,
      actorName: user.name,
      type: "article",
      message: `${user.name} commented on your article`,
      link: `/articles/${numId}`,
    })
  }
  revalidateArticle(numId, row.authorId)

  // Build the client view of the just-created comment so the UI can insert it
  // optimistically without a refetch.
  const info =
    (await resolveAuthors([user.id], new Map([[user.id, { name: user.name, image: user.image ?? null }]]))).get(
      user.id,
    ) ??
    ({
      id: user.id,
      name: user.name,
      handle: getHandle(user.name),
      initials: getInitials(user.name),
      color: getAvatarColor(user.id),
      image: user.image ?? null,
    } satisfies ArticleAuthor)
  return {
    id: String(inserted.id),
    parentId: inserted.parentId ? String(inserted.parentId) : null,
    body: inserted.body,
    likes: 0,
    liked: false,
    deleted: false,
    createdAt: inserted.createdAt.toISOString(),
    editedAt: null,
    timeAgo: "now",
    isMine: true,
    author: info,
    replies: [],
  }
}

/** Edits one of the current user's own comments. */
export async function editArticleComment(input: { commentId: string; body: string }): Promise<void> {
  const user = await requireUser()
  const numId = Number(input.commentId)
  const body = input.body.trim()
  if (!body) throw new Error("Comment cannot be empty.")
  const [row] = await db
    .select({ userId: articleComment.userId, articleId: articleComment.articleId })
    .from(articleComment)
    .where(eq(articleComment.id, numId))
    .limit(1)
  if (!row) throw new Error("Comment not found.")
  if (row.userId !== user.id) throw new Error("You can only edit your own comments.")
  await db.update(articleComment).set({ body, editedAt: new Date() }).where(eq(articleComment.id, numId))
  revalidatePath(`/articles/${row.articleId}`)
}

/** Soft-deletes one of the current user's own comments (keeps thread shape). */
export async function deleteArticleComment(commentId: string): Promise<void> {
  const user = await requireUser()
  const numId = Number(commentId)
  const [row] = await db
    .select({ userId: articleComment.userId, articleId: articleComment.articleId, deleted: articleComment.deleted })
    .from(articleComment)
    .where(eq(articleComment.id, numId))
    .limit(1)
  if (!row) return
  if (row.userId !== user.id) throw new Error("You can only delete your own comments.")
  if (!row.deleted) {
    await db.update(articleComment).set({ deleted: true, body: "" }).where(eq(articleComment.id, numId))
    await db
      .update(article)
      .set({ commentCount: sql`greatest(0, ${article.commentCount} - 1)` })
      .where(eq(article.id, row.articleId))
  }
  revalidatePath(`/articles/${row.articleId}`)
}

/** Toggles a like on a comment. */
export async function setArticleCommentLike(input: { commentId: string; liked: boolean }): Promise<void> {
  const user = await requireUser()
  const numId = Number(input.commentId)
  const [row] = await db
    .select({ likes: articleComment.likes, articleId: articleComment.articleId })
    .from(articleComment)
    .where(eq(articleComment.id, numId))
    .limit(1)
  if (!row) return
  const { changed } = await setLike(user.id, "article_comment", numId, input.liked)
  if (!changed) return
  const next = Math.max(0, row.likes + (input.liked ? 1 : -1))
  await db.update(articleComment).set({ likes: next }).where(eq(articleComment.id, numId))
  revalidatePath(`/articles/${row.articleId}`)
}

/** Reports a comment for moderation. Idempotent per (reporter, comment). */
export async function reportArticleComment(input: { commentId: string; reason?: string }): Promise<void> {
  const user = await requireUser()
  const numId = Number(input.commentId)
  const [row] = await db.select({ id: articleComment.id }).from(articleComment).where(eq(articleComment.id, numId)).limit(1)
  if (!row) return
  await db
    .insert(articleCommentReport)
    .values({ commentId: numId, reporterId: user.id, reason: input.reason?.trim().slice(0, 300) ?? "" })
    .onConflictDoNothing()
}

/** Follows / unfollows a writer's articles. Separate from the social graph. */
export async function setWriterFollow(input: { writerId: string; following: boolean }): Promise<void> {
  const user = await requireUser()
  if (input.writerId === user.id) throw new Error("You can't follow yourself.")
  if (input.following) {
    await db
      .insert(articleFollow)
      .values({ writerId: input.writerId, followerId: user.id })
      .onConflictDoNothing()
    await db.insert(notification).values({
      userId: input.writerId,
      actorId: user.id,
      actorName: user.name,
      type: "article",
      message: `${user.name} followed your writing`,
      link: `/u/${user.id}`,
    })
  } else {
    await db
      .delete(articleFollow)
      .where(and(eq(articleFollow.writerId, input.writerId), eq(articleFollow.followerId, user.id)))
  }
  revalidatePath(`/u/${input.writerId}`)
  revalidatePath("/articles")
}

// --- Internal --------------------------------------------------------------

// Notifies everyone who follows this writer's articles that a new one is live.
async function notifyFollowers(writerId: string, writerName: string, articleId: number, title: string): Promise<void> {
  const followers = await db
    .select({ followerId: articleFollow.followerId })
    .from(articleFollow)
    .where(eq(articleFollow.writerId, writerId))
  if (followers.length === 0) return
  await db.insert(notification).values(
    followers.map((f) => ({
      userId: f.followerId,
      actorId: writerId,
      actorName: writerName,
      type: "article",
      message: `${writerName} published "${title.slice(0, 60)}"`,
      link: `/articles/${articleId}`,
    })),
  )
}

function revalidateArticle(id: number, authorId: string): void {
  revalidatePath("/articles")
  revalidatePath("/articles/mine")
  revalidatePath(`/articles/${id}`)
  revalidatePath(`/u/${authorId}`)
}
