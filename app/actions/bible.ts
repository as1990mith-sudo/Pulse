"use server"

// Fetches copyrighted translations (NLT, MSG) at runtime from a licensed Bible
// provider (API.Bible / scripture.api.bible). We never bundle or store their
// text — every request is proxied live, which keeps us within the providers'
// licensing terms. The public-domain KJV continues to ship offline as static
// JSON under /public/bible and does NOT go through here.

// Canonical 66-book order mapped to the USFM book codes API.Bible expects.
// Index here is 0-based and matches BIBLE_BOOKS in lib/bible-books.ts.
const USFM_CODES = [
  // Old Testament
  "GEN", "EXO", "LEV", "NUM", "DEU", "JOS", "JDG", "RUT", "1SA", "2SA",
  "1KI", "2KI", "1CH", "2CH", "EZR", "NEH", "EST", "JOB", "PSA", "PRO",
  "ECC", "SNG", "ISA", "JER", "LAM", "EZK", "DAN", "HOS", "JOL", "AMO",
  "OBA", "JON", "MIC", "NAM", "HAB", "ZEP", "HAG", "ZEC", "MAL",
  // New Testament
  "MAT", "MRK", "LUK", "JHN", "ACT", "ROM", "1CO", "2CO", "GAL", "EPH",
  "PHP", "COL", "1TH", "2TH", "1TI", "2TI", "TIT", "PHM", "HEB", "JAS",
  "1PE", "2PE", "1JN", "2JN", "3JN", "JUD", "REV",
] as const

export type ApiTranslation = "nlt" | "msg"

export type PassageVerse = { verse: number; text: string }

export type PassageResult =
  | { ok: true; verses: PassageVerse[] }
  | { ok: false; reason: "unconfigured" | "unavailable" | "error"; message: string }

// Each API translation maps to a Bible version id on the provider account.
// These are configured per-deployment because the licensed version ids differ
// by account/provider.
function versionIdFor(translation: ApiTranslation): string | undefined {
  if (translation === "nlt") return process.env.BIBLE_NLT_ID
  if (translation === "msg") return process.env.BIBLE_MSG_ID
  return undefined
}

type FumsNode = {
  name?: string
  type?: string
  text?: string
  attrs?: { number?: string; verseId?: string; style?: string }
  items?: FumsNode[]
}

// Walks API.Bible's FUMS JSON content tree, accumulating text per verse number.
function extractVerses(content: FumsNode[]): PassageVerse[] {
  const byVerse = new Map<number, string>()
  let current = 0

  const walk = (nodes: FumsNode[]) => {
    for (const node of nodes) {
      if (node.name === "verse" && node.attrs?.number) {
        current = Number.parseInt(node.attrs.number, 10) || current
        if (!byVerse.has(current)) byVerse.set(current, "")
      }
      if (node.type === "text" && node.text && current > 0) {
        byVerse.set(current, (byVerse.get(current) ?? "") + node.text)
      }
      if (node.items?.length) walk(node.items)
    }
  }
  walk(content)

  return [...byVerse.entries()]
    .map(([verse, text]) => ({ verse, text: text.replace(/\s+/g, " ").trim() }))
    .filter((v) => v.text.length > 0)
    .sort((a, b) => a.verse - b.verse)
}

/**
 * Loads a chapter of a copyrighted translation from the licensed provider.
 * Returns a structured result so the UI can show a friendly state when the
 * provider isn't configured or the translation isn't available.
 */
export async function getApiPassage(input: {
  translation: ApiTranslation
  bookIndex: number // 0-based, matches BIBLE_BOOKS
  chapter: number
}): Promise<PassageResult> {
  const apiKey = process.env.BIBLE_API_KEY
  const versionId = versionIdFor(input.translation)
  const code = USFM_CODES[input.bookIndex]

  if (!apiKey || !versionId) {
    return {
      ok: false,
      reason: "unconfigured",
      message:
        "This translation isn't set up yet. Add BIBLE_API_KEY plus the version id to enable it.",
    }
  }
  if (!code) {
    return { ok: false, reason: "error", message: "Unknown book." }
  }

  const chapterId = `${code}.${input.chapter}`
  const url =
    `https://api.scripture.api.bible/v1/bibles/${versionId}/chapters/${chapterId}` +
    `?content-type=json&include-notes=false&include-titles=false` +
    `&include-chapter-numbers=false&include-verse-numbers=true&include-verse-spans=false`

  try {
    const res = await fetch(url, {
      headers: { "api-key": apiKey },
      // Scripture text is immutable — cache aggressively to limit API usage.
      next: { revalidate: 60 * 60 * 24 * 30 },
    })

    if (res.status === 401 || res.status === 403) {
      return { ok: false, reason: "unavailable", message: "This translation isn't available on this plan." }
    }
    if (!res.ok) {
      return { ok: false, reason: "error", message: "Couldn't load this passage. Please try again." }
    }

    const json = (await res.json()) as { data?: { content?: FumsNode[] } }
    const content = json.data?.content
    if (!content || !Array.isArray(content)) {
      return { ok: false, reason: "error", message: "Couldn't read this passage." }
    }

    const verses = extractVerses(content)
    if (verses.length === 0) {
      return { ok: false, reason: "error", message: "No text returned for this chapter." }
    }
    return { ok: true, verses }
  } catch {
    return { ok: false, reason: "error", message: "Couldn't reach the Bible service." }
  }
}
