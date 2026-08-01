/**
 * Lightweight scripture-reference detector for Community Help.
 *
 * Scans free text for references like "John 3:16", "Romans 8:28",
 * "1 Corinthians 13:4-7" or "Psalm 23" and returns a de-duplicated, in-order
 * list so the UI can render elegant reference chips. Deliberately dependency-
 * free and conservative: it only matches a fixed canon of book names (plus a
 * few common short forms) so ordinary text like "room 3" never becomes a chip.
 */

// Canonical books + a handful of everyday variants people actually type.
const BOOKS = [
  "Genesis",
  "Exodus",
  "Leviticus",
  "Numbers",
  "Deuteronomy",
  "Joshua",
  "Judges",
  "Ruth",
  "1 Samuel",
  "2 Samuel",
  "1 Kings",
  "2 Kings",
  "1 Chronicles",
  "2 Chronicles",
  "Ezra",
  "Nehemiah",
  "Esther",
  "Job",
  "Psalm",
  "Psalms",
  "Proverbs",
  "Ecclesiastes",
  "Song of Solomon",
  "Isaiah",
  "Jeremiah",
  "Lamentations",
  "Ezekiel",
  "Daniel",
  "Hosea",
  "Joel",
  "Amos",
  "Obadiah",
  "Jonah",
  "Micah",
  "Nahum",
  "Habakkuk",
  "Zephaniah",
  "Haggai",
  "Zechariah",
  "Malachi",
  "Matthew",
  "Mark",
  "Luke",
  "John",
  "Acts",
  "Romans",
  "1 Corinthians",
  "2 Corinthians",
  "Galatians",
  "Ephesians",
  "Philippians",
  "Colossians",
  "1 Thessalonians",
  "2 Thessalonians",
  "1 Timothy",
  "2 Timothy",
  "Titus",
  "Philemon",
  "Hebrews",
  "James",
  "1 Peter",
  "2 Peter",
  "1 John",
  "2 John",
  "3 John",
  "Jude",
  "Revelation",
]

// Longer names first so "Song of Solomon" wins over a bare "Song", etc.
const BOOK_ALTERNATION = [...BOOKS]
  .sort((a, b) => b.length - a.length)
  .map((b) => b.replace(/ /g, "\\s+"))
  .join("|")

// <Book> <chapter>[:<verse>[-<verse>]]  — verse portion optional (e.g. "Psalm 23").
const REF_RE = new RegExp(`\\b(${BOOK_ALTERNATION})\\s+(\\d{1,3})(?::(\\d{1,3})(?:[-–]\\d{1,3})?)?\\b`, "g")

export type BibleRef = {
  /** Display label, e.g. "John 3:16". */
  label: string
  /** External study link (Bible Gateway search). */
  href: string
}

/**
 * Returns de-duplicated scripture references found in `text`, in first-seen
 * order. Returns an empty array when none are present.
 */
export function detectBibleRefs(text: string): BibleRef[] {
  if (!text) return []
  const seen = new Set<string>()
  const refs: BibleRef[] = []
  for (const match of text.matchAll(REF_RE)) {
    const label = match[0].replace(/\s+/g, " ").trim()
    const key = label.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    refs.push({
      label,
      href: `https://www.biblegateway.com/passage/?search=${encodeURIComponent(label)}&version=NIV`,
    })
  }
  return refs
}
