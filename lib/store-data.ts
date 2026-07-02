// ---------------------------------------------------------------------------
// Store types + shared helpers. The catalog itself is real data from Neon —
// see app/actions/store.ts for the queries that produce these view objects and
// the publish flow that creates them. This module only holds the shapes every
// Store surface shares plus small pure helpers (categories, price formatting).
// ---------------------------------------------------------------------------

export type StoreCategory =
  | "Devotional"
  | "Prayer"
  | "Bible Study"
  | "Leadership"
  | "Family"
  | "Worship"
  | "Theology"
  | "Youth"

export const BOOK_CATEGORIES: StoreCategory[] = [
  "Devotional",
  "Prayer",
  "Bible Study",
  "Leadership",
  "Family",
  "Theology",
]

export const COURSE_CATEGORIES: StoreCategory[] = [
  "Bible Study",
  "Prayer",
  "Worship",
  "Leadership",
  "Youth",
  "Theology",
]

export const COURSE_DIFFICULTIES = ["Beginner", "Intermediate", "Advanced"] as const
export type CourseDifficulty = (typeof COURSE_DIFFICULTIES)[number]

export type Book = {
  id: string
  type: "book"
  title: string
  subtitle: string
  author: string
  authorId: string
  cover: string
  price: number // in dollars
  rating: number
  ratingCount: number
  category: StoreCategory
  language: string
  pages: number
  description: string
  // The deliverable file, unlocked for buyers who own the book.
  fileUrl?: string | null
  fileName?: string | null
}

export type Lesson = {
  id: string
  title: string
  duration: string
  kind: "video" | "audio"
  // Playable media, unlocked for buyers who own the course.
  mediaUrl?: string | null
}

export type Course = {
  id: string
  type: "course"
  title: string
  subtitle: string
  instructor: string
  instructorId: string
  thumbnail: string
  price: number // in dollars
  rating: number
  ratingCount: number
  category: StoreCategory
  language: string
  difficulty: CourseDifficulty
  totalDuration: string
  description: string
  lessons: Lesson[]
  progress?: number // 0..1 for "Continue Learning"
}

export type StoreProduct = Book | Course

export function formatPrice(price: number): string {
  return price === 0 ? "Free" : `$${price.toFixed(2)}`
}
