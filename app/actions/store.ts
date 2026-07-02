"use server"

import { and, desc, eq, inArray, sql } from "drizzle-orm"
import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { storeLesson, storeProduct, storePurchase } from "@/lib/db/schema"
import type { Book, Course, CourseDifficulty, Lesson, StoreCategory, StoreProduct } from "@/lib/store-data"

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

// --- Row → view mappers ----------------------------------------------------

type ProductRow = typeof storeProduct.$inferSelect
type LessonRow = typeof storeLesson.$inferSelect

function toLesson(row: LessonRow): Lesson {
  return {
    id: String(row.id),
    title: row.title,
    duration: row.duration,
    kind: row.kind === "audio" ? "audio" : "video",
    mediaUrl: row.mediaUrl,
  }
}

function toBook(row: ProductRow): Book {
  return {
    id: String(row.id),
    type: "book",
    title: row.title,
    subtitle: row.subtitle,
    author: row.creatorName,
    authorId: row.creatorId,
    cover: row.coverUrl,
    price: row.priceCents / 100,
    rating: 0,
    ratingCount: 0,
    category: row.category as StoreCategory,
    language: row.language,
    pages: row.pages ?? 0,
    description: row.description,
    fileUrl: row.bookFileUrl,
    fileName: row.bookFileName,
  }
}

function toCourse(row: ProductRow, lessons: Lesson[]): Course {
  return {
    id: String(row.id),
    type: "course",
    title: row.title,
    subtitle: row.subtitle,
    instructor: row.creatorName,
    instructorId: row.creatorId,
    thumbnail: row.coverUrl,
    price: row.priceCents / 100,
    rating: 0,
    ratingCount: 0,
    category: row.category as StoreCategory,
    language: row.language,
    difficulty: (row.difficulty as CourseDifficulty) || "Beginner",
    totalDuration: row.totalDuration || "",
    description: row.description,
    lessons,
  }
}

/** Fetch lessons for many courses at once, grouped by productId. */
async function lessonsByProduct(productIds: number[]): Promise<Map<number, Lesson[]>> {
  const map = new Map<number, Lesson[]>()
  if (productIds.length === 0) return map
  const rows = await db
    .select()
    .from(storeLesson)
    .where(inArray(storeLesson.productId, productIds))
    .orderBy(storeLesson.productId, storeLesson.position)
  for (const r of rows) {
    const list = map.get(r.productId) ?? []
    list.push(toLesson(r))
    map.set(r.productId, list)
  }
  return map
}

// --- Public catalog reads --------------------------------------------------

export type StoreCatalog = {
  books: Book[]
  courses: Course[]
  trendingBooks: Book[]
  trendingCourses: Course[]
}

/**
 * The full published catalog for the Store page. Products are returned
 * newest-first; "trending" is derived from purchase counts (falling back to
 * recency) so the rail reflects real activity rather than editorial tags.
 */
export async function getStoreCatalog(): Promise<StoreCatalog> {
  const rows = await db
    .select({
      product: storeProduct,
      purchases: sql<number>`count(${storePurchase.id})`.mapWith(Number),
    })
    .from(storeProduct)
    .leftJoin(storePurchase, eq(storePurchase.productId, storeProduct.id))
    .where(eq(storeProduct.published, true))
    .groupBy(storeProduct.id)
    .orderBy(desc(storeProduct.createdAt))

  const courseIds = rows.filter((r) => r.product.kind === "course").map((r) => r.product.id)
  const lessonMap = await lessonsByProduct(courseIds)

  const books: Book[] = []
  const courses: Course[] = []
  const trending: { popularity: number; product: StoreProduct }[] = []

  for (const { product, purchases } of rows) {
    if (product.kind === "course") {
      const c = toCourse(product, lessonMap.get(product.id) ?? [])
      courses.push(c)
      trending.push({ popularity: purchases, product: c })
    } else {
      const b = toBook(product)
      books.push(b)
      trending.push({ popularity: purchases, product: b })
    }
  }

  const sortedTrending = trending
    .filter((t) => t.popularity > 0)
    .sort((a, b) => b.popularity - a.popularity)
    .map((t) => t.product)

  const trendingBooks = (sortedTrending.filter((p) => p.type === "book") as Book[]).slice(0, 12)
  const trendingCourses = (sortedTrending.filter((p) => p.type === "course") as Course[]).slice(0, 12)

  return { books, courses, trendingBooks, trendingCourses }
}

/** A single product by id, with its lessons if it is a course. */
export async function getStoreProduct(id: string): Promise<StoreProduct | null> {
  const numId = Number(id)
  if (!Number.isFinite(numId)) return null
  const [row] = await db.select().from(storeProduct).where(eq(storeProduct.id, numId)).limit(1)
  if (!row || !row.published) return null
  if (row.kind === "course") {
    const map = await lessonsByProduct([row.id])
    return toCourse(row, map.get(row.id) ?? [])
  }
  return toBook(row)
}

/** Whether the current user owns the given product. Safe when signed out. */
export async function isOwned(productId: string): Promise<boolean> {
  const user = await getSessionUser()
  if (!user) return false
  const numId = Number(productId)
  if (!Number.isFinite(numId)) return false
  const [row] = await db
    .select({ id: storePurchase.id })
    .from(storePurchase)
    .where(and(eq(storePurchase.userId, user.id), eq(storePurchase.productId, numId)))
    .limit(1)
  return !!row
}

/** All product ids the current user owns (for cart/library UIs). */
export async function getOwnedIds(): Promise<string[]> {
  const user = await getSessionUser()
  if (!user) return []
  const rows = await db
    .select({ productId: storePurchase.productId })
    .from(storePurchase)
    .where(eq(storePurchase.userId, user.id))
  return rows.map((r) => String(r.productId))
}

/** The current user's purchased library, split into books and courses. */
export async function getLibrary(): Promise<{ books: Book[]; courses: Course[] }> {
  const user = await getSessionUser()
  if (!user) return { books: [], courses: [] }
  const rows = await db
    .select({ product: storeProduct, purchasedAt: storePurchase.createdAt })
    .from(storePurchase)
    .innerJoin(storeProduct, eq(storeProduct.id, storePurchase.productId))
    .where(eq(storePurchase.userId, user.id))
    .orderBy(desc(storePurchase.createdAt))

  const courseIds = rows.filter((r) => r.product.kind === "course").map((r) => r.product.id)
  const lessonMap = await lessonsByProduct(courseIds)

  const books: Book[] = []
  const courses: Course[] = []
  for (const { product } of rows) {
    if (product.kind === "course") courses.push(toCourse(product, lessonMap.get(product.id) ?? []))
    else books.push(toBook(product))
  }
  return { books, courses }
}

/** Products fetched by id (used to render the cart from client-held ids). */
export async function getProductsByIds(ids: string[]): Promise<StoreProduct[]> {
  const numIds = ids.map(Number).filter((n) => Number.isFinite(n))
  if (numIds.length === 0) return []
  const rows = await db
    .select()
    .from(storeProduct)
    .where(and(inArray(storeProduct.id, numIds), eq(storeProduct.published, true)))
  const courseIds = rows.filter((r) => r.kind === "course").map((r) => r.id)
  const lessonMap = await lessonsByProduct(courseIds)
  // Preserve the caller's order.
  const byId = new Map(rows.map((r) => [String(r.id), r]))
  const out: StoreProduct[] = []
  for (const id of ids) {
    const row = byId.get(id)
    if (!row) continue
    out.push(row.kind === "course" ? toCourse(row, lessonMap.get(row.id) ?? []) : toBook(row))
  }
  return out
}

// --- Purchases -------------------------------------------------------------

export async function purchaseProduct(productId: string): Promise<{ ok: true }> {
  const user = await requireUser()
  const numId = Number(productId)
  if (!Number.isFinite(numId)) throw new Error("Invalid product.")
  const [product] = await db.select().from(storeProduct).where(eq(storeProduct.id, numId)).limit(1)
  if (!product || !product.published) throw new Error("Product not found.")
  await db
    .insert(storePurchase)
    .values({ userId: user.id, productId: numId, pricePaidCents: product.priceCents })
    .onConflictDoNothing()
  revalidatePath("/library")
  revalidatePath(`/store/${product.kind}/${numId}`)
  return { ok: true }
}

export async function purchaseMany(productIds: string[]): Promise<{ ok: true; count: number }> {
  const user = await requireUser()
  const numIds = productIds.map(Number).filter((n) => Number.isFinite(n))
  if (numIds.length === 0) return { ok: true, count: 0 }
  const products = await db
    .select()
    .from(storeProduct)
    .where(and(inArray(storeProduct.id, numIds), eq(storeProduct.published, true)))
  if (products.length === 0) return { ok: true, count: 0 }
  await db
    .insert(storePurchase)
    .values(products.map((p) => ({ userId: user.id, productId: p.id, pricePaidCents: p.priceCents })))
    .onConflictDoNothing()
  revalidatePath("/library")
  return { ok: true, count: products.length }
}

// --- Publishing (any signed-in user) ---------------------------------------

export type PublishLessonInput = {
  title: string
  kind: "video" | "audio"
  duration: string
  mediaUrl: string
}

export type PublishInput = {
  kind: "book" | "course"
  title: string
  subtitle: string
  description: string
  category: string
  language: string
  coverUrl: string
  price: number // dollars
  // book
  bookFileUrl?: string
  bookFileName?: string
  pages?: number
  // course
  difficulty?: string
  totalDuration?: string
  lessons?: PublishLessonInput[]
}

export async function publishProduct(input: PublishInput): Promise<{ id: string; kind: string }> {
  const user = await requireUser()

  const title = input.title?.trim()
  if (!title) throw new Error("A title is required.")
  if (!input.coverUrl) throw new Error("A cover image is required.")
  if (!input.category) throw new Error("Please choose a category.")

  const priceCents = Math.max(0, Math.round((Number(input.price) || 0) * 100))

  if (input.kind === "book" && !input.bookFileUrl) {
    throw new Error("Please upload the book file (PDF or EPUB).")
  }
  const lessons = (input.lessons ?? []).filter((l) => l.title?.trim() && l.mediaUrl)
  if (input.kind === "course" && lessons.length === 0) {
    throw new Error("Add at least one lesson with an uploaded video or audio file.")
  }

  const [row] = await db
    .insert(storeProduct)
    .values({
      kind: input.kind,
      creatorId: user.id,
      creatorName: user.name,
      title,
      subtitle: input.subtitle?.trim() || "",
      description: input.description?.trim() || "",
      category: input.category,
      language: input.language?.trim() || "English",
      coverUrl: input.coverUrl,
      priceCents,
      bookFileUrl: input.kind === "book" ? input.bookFileUrl : null,
      bookFileName: input.kind === "book" ? input.bookFileName ?? null : null,
      pages: input.kind === "book" ? input.pages ?? null : null,
      difficulty: input.kind === "course" ? input.difficulty ?? "Beginner" : null,
      totalDuration: input.kind === "course" ? input.totalDuration ?? null : null,
    })
    .returning({ id: storeProduct.id })

  if (input.kind === "course" && lessons.length > 0) {
    await db.insert(storeLesson).values(
      lessons.map((l, i) => ({
        productId: row.id,
        position: i,
        title: l.title.trim(),
        kind: l.kind === "audio" ? "audio" : "video",
        duration: l.duration?.trim() || "",
        mediaUrl: l.mediaUrl,
      })),
    )
  }

  revalidatePath("/store")
  return { id: String(row.id), kind: input.kind }
}

/** The current user's own listings, for a "manage" view. */
export async function getMyListings(): Promise<StoreProduct[]> {
  const user = await requireUser()
  const rows = await db
    .select()
    .from(storeProduct)
    .where(eq(storeProduct.creatorId, user.id))
    .orderBy(desc(storeProduct.createdAt))
  const courseIds = rows.filter((r) => r.kind === "course").map((r) => r.id)
  const lessonMap = await lessonsByProduct(courseIds)
  return rows.map((r) => (r.kind === "course" ? toCourse(r, lessonMap.get(r.id) ?? []) : toBook(r)))
}

/**
 * Permanently delete a listing the current user published. Scoped to the
 * creator so no one can remove someone else's product. Removes the product's
 * lessons and any purchase records alongside it (the deliverable is gone), then
 * refreshes the store, library and product surfaces.
 */
export async function deleteProduct(productId: string): Promise<{ ok: true }> {
  const user = await requireUser()
  const numId = Number(productId)
  if (!Number.isFinite(numId)) throw new Error("Invalid product.")

  const [product] = await db
    .select({ id: storeProduct.id, creatorId: storeProduct.creatorId, kind: storeProduct.kind })
    .from(storeProduct)
    .where(eq(storeProduct.id, numId))
    .limit(1)
  if (!product) throw new Error("Listing not found.")
  if (product.creatorId !== user.id) throw new Error("You can only delete your own listings.")

  await db.delete(storeLesson).where(eq(storeLesson.productId, numId))
  await db.delete(storePurchase).where(eq(storePurchase.productId, numId))
  await db.delete(storeProduct).where(and(eq(storeProduct.id, numId), eq(storeProduct.creatorId, user.id)))

  revalidatePath("/store")
  revalidatePath("/store/listings")
  revalidatePath("/library")
  revalidatePath(`/store/${product.kind}/${numId}`)
  return { ok: true }
}
