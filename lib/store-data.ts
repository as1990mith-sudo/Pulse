// ---------------------------------------------------------------------------
// Mock catalog for the Store. This is intentionally static/local for now — the
// real backend (Neon catalog + Blob uploads + purchases/library) is wired in a
// later pass. Keeping it in one module lets every Store surface share the same
// shapes and lookups.
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

export type Book = {
  id: string
  type: "book"
  title: string
  subtitle: string
  author: string
  authorId: string
  cover: string
  price: number
  rating: number
  ratingCount: number
  category: StoreCategory
  language: string
  pages: number
  description: string
  screenshots: string[]
  tags: ("featured" | "trending" | "new" | "recommended")[]
}

export type Lesson = {
  id: string
  title: string
  duration: string
  kind: "video" | "audio"
}

export type Course = {
  id: string
  type: "course"
  title: string
  subtitle: string
  instructor: string
  instructorId: string
  thumbnail: string
  price: number
  rating: number
  ratingCount: number
  category: StoreCategory
  language: string
  difficulty: "Beginner" | "Intermediate" | "Advanced"
  totalDuration: string
  description: string
  lessons: Lesson[]
  tags: ("featured" | "trending" | "new" | "recommended" | "continue")[]
  progress?: number // 0..1 for "Continue Learning"
}

const COVERS = [
  "/store/book-weight-of-glory.png",
  "/store/book-quiet-waters.png",
  "/store/book-fire-and-altar.png",
  "/store/book-rooted.png",
  "/store/book-secret-place.png",
  "/store/book-unshaken.png",
]

const SCREENS = ["/store/course-bible-study.png", "/store/course-foundations.png", "/store/course-prayer.png"]

const BASE_BOOKS: Omit<Book, "id" | "type" | "cover" | "screenshots">[] = [
  {
    title: "The Weight of Glory",
    subtitle: "Living for what lasts",
    author: "A. Rose",
    authorId: "a-rose",
    price: 12.99,
    rating: 4.9,
    ratingCount: 1284,
    category: "Devotional",
    language: "English",
    pages: 236,
    description:
      "A stirring meditation on eternity and the everyday choices that shape a life of glory. Each chapter draws you deeper into the weight and wonder of living for what truly lasts.",
    tags: ["featured", "trending"],
  },
  {
    title: "Quiet Waters",
    subtitle: "40 days of stillness",
    author: "Emmanuel Adjei",
    authorId: "emmanuel",
    price: 9.99,
    rating: 4.8,
    ratingCount: 842,
    category: "Devotional",
    language: "English",
    pages: 180,
    description:
      "A forty-day devotional journey into rest, reflection, and the still small voice. Perfect for mornings when your soul needs to slow down and listen.",
    tags: ["featured", "new"],
  },
  {
    title: "Fire & Altar",
    subtitle: "A call to fervent prayer",
    author: "Caleb Aikins",
    authorId: "caleb",
    price: 14.5,
    rating: 4.7,
    ratingCount: 613,
    category: "Prayer",
    language: "English",
    pages: 264,
    description:
      "Rekindle a life of fervent, effective prayer. Fire & Altar is a practical and passionate guide to building an altar that never goes cold.",
    tags: ["trending", "recommended"],
  },
  {
    title: "Rooted",
    subtitle: "Growing deep in faith",
    author: "Grace Bediako",
    authorId: "grace",
    price: 11.0,
    rating: 4.6,
    ratingCount: 429,
    category: "Bible Study",
    language: "English",
    pages: 208,
    description:
      "Sink your roots deep into Scripture. Rooted is a study companion that helps new and seasoned believers grow unshakeable, fruitful faith.",
    tags: ["new", "recommended"],
  },
  {
    title: "The Secret Place",
    subtitle: "Intimacy with God",
    author: "Francis Agyei",
    authorId: "francis",
    price: 13.25,
    rating: 4.9,
    ratingCount: 977,
    category: "Prayer",
    language: "English",
    pages: 244,
    description:
      "Discover the joy of a hidden life with God. The Secret Place invites you beyond routine into deep, transforming intimacy with the Father.",
    tags: ["featured", "recommended"],
  },
  {
    title: "Unshaken",
    subtitle: "Faith that holds",
    author: "JoBenny",
    authorId: "jobenny",
    price: 10.5,
    rating: 4.7,
    ratingCount: 356,
    category: "Leadership",
    language: "English",
    pages: 192,
    description:
      "When everything is shaking, faith can still stand. Unshaken is a bold, hope-filled book for anyone walking through storms and seasons of testing.",
    tags: ["trending", "new"],
  },
]

// Extra titles to make the vertical grid feel like a real, deep catalog. They
// reuse the generated covers so the grid stays visually premium.
const EXTRA_TITLES: { title: string; subtitle: string; author: string; category: StoreCategory }[] = [
  { title: "Everyday Grace", subtitle: "Mercy for the ordinary", author: "Charis O.", category: "Devotional" },
  { title: "The Praying Family", subtitle: "Raising a house of faith", author: "Ben Bako", category: "Family" },
  { title: "Kingdom Minded", subtitle: "Thinking like heaven", author: "Basileus", category: "Theology" },
  { title: "Still I Worship", subtitle: "Praise through the valley", author: "Grayebs", category: "Worship" },
  { title: "Wells of Wisdom", subtitle: "Proverbs for today", author: "A. Rose", category: "Bible Study" },
  { title: "Anchored", subtitle: "Hope that steadies the soul", author: "Emmanuel Adjei", category: "Devotional" },
  { title: "The Shepherd's Voice", subtitle: "Hearing God clearly", author: "Francis Agyei", category: "Prayer" },
  { title: "Lead Like Him", subtitle: "Servant leadership", author: "Caleb Aikins", category: "Leadership" },
  { title: "Break of Day", subtitle: "Mornings with the Maker", author: "JoBenny", category: "Devotional" },
  { title: "Covenant", subtitle: "The promises of God", author: "Grace Bediako", category: "Theology" },
  { title: "Fearless", subtitle: "Courage for the called", author: "Charis O.", category: "Youth" },
  { title: "The Table", subtitle: "Communion and community", author: "Ben Bako", category: "Family" },
]

function makeBooks(): Book[] {
  const base: Book[] = BASE_BOOKS.map((b, i) => ({
    ...b,
    id: `book-${i + 1}`,
    type: "book",
    cover: COVERS[i % COVERS.length],
    screenshots: SCREENS,
  }))

  const extra: Book[] = EXTRA_TITLES.map((e, i) => ({
    id: `book-${BASE_BOOKS.length + i + 1}`,
    type: "book",
    title: e.title,
    subtitle: e.subtitle,
    author: e.author,
    authorId: e.author.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    cover: COVERS[(i + 2) % COVERS.length],
    price: 6.99 + ((i * 137) % 900) / 100,
    rating: 4.3 + ((i * 7) % 6) / 10,
    ratingCount: 80 + ((i * 53) % 900),
    category: e.category,
    language: "English",
    pages: 160 + ((i * 29) % 140),
    description:
      "A beautifully written work that draws readers into a deeper walk with God — thoughtful, practical, and rich with Scripture.",
    screenshots: SCREENS,
    tags: i % 3 === 0 ? ["recommended"] : i % 3 === 1 ? ["trending"] : ["new"],
  }))

  return [...base, ...extra]
}

export const BOOKS: Book[] = makeBooks()

function lessons(prefix: string, count: number, kind: "video" | "audio" | "mixed"): Lesson[] {
  const titles = [
    "Welcome & Overview",
    "The Foundation",
    "Going Deeper",
    "A Living Practice",
    "Overcoming Obstacles",
    "The Inner Room",
    "Walking It Out",
    "Community & Accountability",
    "Staying the Course",
    "Sending & Blessing",
  ]
  return Array.from({ length: count }, (_, i) => ({
    id: `${prefix}-l${i + 1}`,
    title: titles[i % titles.length],
    duration: `${8 + ((i * 7) % 34)}:${String((i * 17) % 60).padStart(2, "0")}`,
    kind: kind === "mixed" ? (i % 2 === 0 ? "video" : "audio") : kind,
  }))
}

export const COURSES: Course[] = [
  {
    id: "course-1",
    type: "course",
    title: "Foundations of Faith",
    subtitle: "A discipleship masterclass",
    instructor: "Basileus",
    instructorId: "basileus",
    thumbnail: "/store/course-foundations.png",
    price: 39.99,
    rating: 4.9,
    ratingCount: 2140,
    category: "Bible Study",
    language: "English",
    difficulty: "Beginner",
    totalDuration: "3h 42m",
    description:
      "Build a rock-solid foundation for your walk with Christ. Ten immersive lessons covering salvation, the Word, prayer, and the Spirit-filled life.",
    lessons: lessons("c1", 10, "video"),
    tags: ["featured", "continue"],
    progress: 0.35,
  },
  {
    id: "course-2",
    type: "course",
    title: "Prayer Mastery",
    subtitle: "Praying with power and purpose",
    instructor: "Charis O.",
    instructorId: "charis",
    thumbnail: "/store/course-prayer.png",
    price: 29.99,
    rating: 4.8,
    ratingCount: 1487,
    category: "Prayer",
    language: "English",
    difficulty: "Intermediate",
    totalDuration: "2h 58m",
    description:
      "Move from routine to relationship. Prayer Mastery guides you through the patterns, postures, and disciplines of a powerful prayer life.",
    lessons: lessons("c2", 8, "mixed"),
    tags: ["featured", "trending", "continue"],
    progress: 0.6,
  },
  {
    id: "course-3",
    type: "course",
    title: "Bible Study Methods",
    subtitle: "Read, interpret, apply",
    instructor: "Ben Bako",
    instructorId: "ben-bako",
    thumbnail: "/store/course-bible-study.png",
    price: 34.5,
    rating: 4.7,
    ratingCount: 892,
    category: "Bible Study",
    language: "English",
    difficulty: "Beginner",
    totalDuration: "3h 10m",
    description:
      "Learn to study the Bible for yourself with confidence. A practical toolkit of observation, interpretation, and application methods.",
    lessons: lessons("c3", 9, "video"),
    tags: ["new", "recommended"],
  },
  {
    id: "course-4",
    type: "course",
    title: "Heart of Worship",
    subtitle: "Leading from a full heart",
    instructor: "Grayebs",
    instructorId: "grayebs",
    thumbnail: "/store/course-worship.png",
    price: 27.0,
    rating: 4.9,
    ratingCount: 1203,
    category: "Worship",
    language: "English",
    difficulty: "Intermediate",
    totalDuration: "2h 20m",
    description:
      "Worship is more than music. This course forms worship leaders and musicians into people whose lives make melody to God.",
    lessons: lessons("c4", 7, "mixed"),
    tags: ["trending", "recommended"],
  },
]

// --- Lookups ---------------------------------------------------------------

export function getBook(id: string): Book | undefined {
  return BOOKS.find((b) => b.id === id)
}

export function getCourse(id: string): Course | undefined {
  return COURSES.find((c) => c.id === id)
}

export function getProduct(type: string, id: string): Book | Course | undefined {
  return type === "course" ? getCourse(id) : getBook(id)
}

export function booksByTag(tag: string): Book[] {
  return BOOKS.filter((b) => b.tags.includes(tag as Book["tags"][number]))
}

export function coursesByTag(tag: string): Course[] {
  return COURSES.filter((c) => c.tags.includes(tag as Course["tags"][number]))
}

export function formatPrice(price: number): string {
  return price === 0 ? "Free" : `$${price.toFixed(2)}`
}
