"use client"

import { useMemo, useState } from "react"
import useSWR from "swr"
import { Loader2, ScrollText } from "lucide-react"

// Word-level data (Textus Receptus Greek NT) used to tag the KJV reading with
// Strong's numbers. Field names are kept short in the bundled JSON to reduce
// payload size.
type InterWord = {
  g: string // Greek word as printed
  t: string // transliteration
  s: number // Strong's number
  d: string // dictionary / lemma form
  e: string // English gloss
  m: string // morphology (human readable)
}
type InterVerse = { verse: number; greek: string; words: InterWord[] }
type InterBook = { book: string; language: string; chapters: Record<string, InterVerse[]> }

type KjvVerse = { verse: number; text: string }
type KjvBook = { book: string; chapters: Record<string, KjvVerse[]> }

const interFetcher = async (url: string): Promise<InterBook> => {
  const res = await fetch(url)
  if (!res.ok) throw new Error("Could not load this book.")
  return res.json()
}
const kjvFetcher = async (url: string): Promise<KjvBook> => {
  const res = await fetch(url)
  if (!res.ok) throw new Error("Could not load this book.")
  return res.json()
}

// A KJV word, optionally tagged with the Strong's entry it corresponds to.
type TaggedToken = { lead: string; word: string; trail: string; strong: InterWord | null }

/**
 * Aligns Strong's data onto the actual KJV verse text so the result reads like a
 * normal Bible with Strong's numbers mixed in where they belong. The Greek words
 * arrive in Greek order, each with an English gloss; we greedily match each
 * gloss to the next suitable KJV word and pin the Strong's number there. KJV
 * words with no match (e.g. supplied helper words) simply render as plain text.
 */
function tagKjvWithStrongs(kjvText: string, words: InterWord[]): TaggedToken[] {
  const tokens: TaggedToken[] = kjvText.split(/\s+/).map((raw) => {
    const m = raw.match(/^([^A-Za-z0-9]*)([A-Za-z0-9'’-]*)([^A-Za-z0-9]*)$/)
    return {
      lead: m?.[1] ?? "",
      word: m?.[2] ?? raw,
      trail: m?.[3] ?? "",
      strong: null,
    }
  })
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "")
  const normTokens = tokens.map((t) => norm(t.word))

  let ki = 0
  for (const w of words) {
    // Break the gloss ("a word, speech, divine utterance") into candidate words.
    const syns = w.e
      .split(",")
      .flatMap((s) => s.trim().toLowerCase().split(/\s+/))
      .map((s) => s.replace(/[^a-z]/g, ""))
      .filter((s) => s.length > 2)
    if (syns.length === 0) continue

    // Greedy forward search within a small window so word-order differences
    // between Greek and English don't cascade.
    for (let j = ki; j < tokens.length && j < ki + 7; j++) {
      if (tokens[j].strong) continue
      const n = normTokens[j]
      if (!n) continue
      const hit = syns.some((s) => s === n || (s.length > 3 && (n.startsWith(s) || s.startsWith(n))))
      if (hit) {
        tokens[j].strong = w
        ki = j + 1
        break
      }
    }
  }
  return tokens
}

/**
 * Renders the King James text for a chapter with Strong's numbers woven into the
 * verse exactly where each tagged word sits — tapping a tagged word reveals its
 * original Greek, transliteration, lemma and morphology. Strong's data is
 * bundled only for the New Testament; Old Testament books show a friendly notice.
 */
export function InterlinearPane({
  book,
  chapter,
  bookIndex,
  isNewTestament,
}: {
  book: string
  chapter: number
  bookIndex: number
  isNewTestament: boolean
}) {
  const {
    data: interData,
    error: interError,
    isLoading: interLoading,
  } = useSWR(isNewTestament && bookIndex >= 0 ? `/bible-interlinear/${bookIndex + 1}.json` : null, interFetcher, {
    revalidateOnFocus: false,
    revalidateIfStale: false,
  })
  const {
    data: kjvData,
    error: kjvError,
    isLoading: kjvLoading,
  } = useSWR(isNewTestament && bookIndex >= 0 ? `/bible/${bookIndex + 1}.json` : null, kjvFetcher, {
    revalidateOnFocus: false,
    revalidateIfStale: false,
  })

  const isLoading = interLoading || kjvLoading
  const error = interError || kjvError

  // The readable KJV verses are the source of truth for text + order; Strong's
  // words are matched onto them per verse.
  const verses = useMemo(() => {
    const kjvVerses = kjvData?.chapters[String(chapter)] ?? []
    const interVerses = interData?.chapters[String(chapter)] ?? []
    const wordsByVerse = new Map(interVerses.map((v) => [v.verse, v.words]))
    return kjvVerses.map((v) => ({
      verse: v.verse,
      tokens: tagKjvWithStrongs(v.text, wordsByVerse.get(v.verse) ?? []),
    }))
  }, [kjvData, interData, chapter])

  return (
    <div className="py-2">
      <div className="mb-7 flex flex-col gap-1 text-center">
        <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">
          {book} {chapter}
        </h2>
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          King James Version · Strong&apos;s Numbers
        </p>
      </div>

      {!isNewTestament && (
        <div className="mx-auto max-w-md rounded-xl border border-border/60 bg-card px-6 py-12 text-center">
          <ScrollText className="mx-auto mb-3 size-6 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">Strong&apos;s numbers coming soon for this book</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Strong&apos;s-tagged reading currently covers the New Testament. Switch to a New Testament book to study the
            original-language words, or read this book in the King James Version.
          </p>
        </div>
      )}

      {isNewTestament && isLoading && (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
          <span className="text-sm">Loading Strong&apos;s text…</span>
        </div>
      )}

      {isNewTestament && error && !isLoading && (
        <div className="py-16 text-center">
          <p className="text-sm text-muted-foreground">We couldn&apos;t load this passage. Please try again.</p>
        </div>
      )}

      {isNewTestament && !isLoading && !error && verses.length > 0 && (
        <>
          <p className="mb-5 text-center text-xs text-muted-foreground">
            Tap a highlighted word to see its original Greek.
          </p>
          <ol className="mx-auto max-w-prose space-y-1">
            {verses.map((v) => (
              <li
                key={v.verse}
                className="flex gap-3 rounded-md px-2 py-0.5 text-lg leading-relaxed text-justify [text-justify:inter-word]"
              >
                <span className="select-none pt-1 text-xs font-semibold text-primary tabular-nums">{v.verse}</span>
                <span className="flex-1">
                  {v.tokens.map((tok, i) => (
                    <StrongsToken key={i} token={tok} />
                  ))}
                </span>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  )
}

/**
 * A single KJV word. When tagged with a Strong's entry it renders with a small
 * superscript Strong's number and is tappable for the full lexical detail;
 * otherwise it is plain reading text.
 */
function StrongsToken({ token }: { token: TaggedToken }) {
  const [open, setOpen] = useState(false)
  const w = token.strong

  if (!w) {
    return (
      <span>
        {token.lead}
        {token.word}
        {token.trail}{" "}
      </span>
    )
  }

  return (
    <span className="relative inline-block">
      {token.lead}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="group rounded px-0.5 text-left align-baseline text-foreground transition-colors hover:bg-secondary/70 aria-expanded:bg-secondary"
      >
        <span className="group-hover:underline group-hover:decoration-primary group-hover:decoration-dotted group-hover:underline-offset-4">
          {token.word}
        </span>
        <span className="ml-0.5 font-mono text-[0.62em] leading-none text-primary [vertical-align:0.45em]">
          {w.s}
        </span>
      </button>
      {token.trail}{" "}
      {open && (
        <span
          role="tooltip"
          className="absolute left-1/2 top-full z-30 mt-1 w-52 -translate-x-1/2 rounded-xl border border-border/60 bg-card p-3 text-left shadow-xl duration-150 animate-in fade-in zoom-in-95"
        >
          <span className="block text-lg font-semibold leading-tight text-foreground">{w.g}</span>
          <span className="block text-sm italic leading-tight text-muted-foreground">{w.t}</span>
          <span className="mt-1.5 flex items-center gap-1.5">
            <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-primary">
              G{w.s}
            </span>
            <span className="truncate text-sm text-foreground/80">{w.d}</span>
          </span>
          <span className="mt-1 block text-xs text-muted-foreground">{w.m}</span>
          <span className="mt-1.5 block border-t border-border/60 pt-1.5 text-sm text-foreground">{w.e}</span>
        </span>
      )}
    </span>
  )
}
