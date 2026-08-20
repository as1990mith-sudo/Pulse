"use server"

// Full-text Bible search over the bundled offline KJV. Lets readers find a
// verse by words or phrases they remember, without knowing the reference. The
// entire text (~4MB across 66 files) is read once and cached in module memory,
// so the first search warms the corpus and every later search is an in-memory
// scan. Results are ranked so exact phrase matches surface before looser
// all-words matches, and capped so a broad query can't flood the UI.

import { promises as fs } from "fs"
import path from "path"
import { BIBLE_BOOKS } from "@/lib/bible-books"

export type BibleSearchResult = {
  // 0-based position in BIBLE_BOOKS, so the client can build the same verseId
  // (`${bookIndex}:${chapter}:${verse}`) the reader uses everywhere else.
  bookIndex: number
  book: string
  chapter: number
  verse: number
  text: string
}

type CorpusVerse = {
  bookIndex: number
  book: string
  chapter: number
  verse: number
  text: string
  lower: string
}

// Loaded lazily on first search, then reused for the life of the server
// process. A promise (not the array) is cached so concurrent first-callers
// share one read instead of each kicking off their own.
let corpusPromise: Promise<CorpusVerse[]> | null = null

async function loadCorpus(): Promise<CorpusVerse[]> {
  if (corpusPromise) return corpusPromise
  corpusPromise = (async () => {
    const dir = path.join(process.cwd(), "public", "bible")
    const all: CorpusVerse[] = []
    for (let i = 0; i < BIBLE_BOOKS.length; i++) {
      const raw = await fs.readFile(path.join(dir, `${i + 1}.json`), "utf8")
      const parsed = JSON.parse(raw) as {
        book: string
        chapters: Record<string, { verse: number; text: string }[]>
      }
      for (const [chapterKey, verses] of Object.entries(parsed.chapters)) {
        const chapter = Number(chapterKey)
        for (const v of verses) {
          all.push({
            bookIndex: i,
            book: parsed.book,
            chapter,
            verse: v.verse,
            text: v.text,
            lower: v.text.toLowerCase(),
          })
        }
      }
    }
    return all
  })()
  // If the read fails, clear the cache so a later search can retry.
  corpusPromise.catch(() => {
    corpusPromise = null
  })
  return corpusPromise
}

const MAX_RESULTS = 60

export async function searchBible(query: string): Promise<BibleSearchResult[]> {
  const phrase = query.trim().toLowerCase()
  if (phrase.length < 2) return []

  const corpus = await loadCorpus()
  const words = phrase.split(/\s+/).filter(Boolean)

  // Two match tiers: verses containing the full phrase verbatim rank first,
  // then verses that contain every word (in any order/position).
  const exact: BibleSearchResult[] = []
  const loose: BibleSearchResult[] = []

  for (const v of corpus) {
    const toResult = (): BibleSearchResult => ({
      bookIndex: v.bookIndex,
      book: v.book,
      chapter: v.chapter,
      verse: v.verse,
      text: v.text,
    })
    if (v.lower.includes(phrase)) {
      exact.push(toResult())
    } else if (words.length > 1 && words.every((w) => v.lower.includes(w))) {
      loose.push(toResult())
    }
    if (exact.length >= MAX_RESULTS) break
  }

  return [...exact, ...loose].slice(0, MAX_RESULTS)
}
