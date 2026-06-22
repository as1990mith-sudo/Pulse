"use client"

import useSWR from "swr"
import { Loader2, ScrollText } from "lucide-react"

// Word-level interlinear data (Textus Receptus Greek NT). Field names are kept
// short in the bundled JSON to reduce payload size.
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

const fetcher = async (url: string): Promise<InterBook> => {
  const res = await fetch(url)
  if (!res.ok) throw new Error("Could not load this book.")
  return res.json()
}

/**
 * Renders the Greek interlinear for a single chapter. Each verse shows its
 * words stacked: Greek over transliteration, English gloss, and Strong's
 * number — the classic interlinear layout. Interlinear data is bundled only
 * for the New Testament; Old Testament books show a friendly notice.
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
  const { data, error, isLoading } = useSWR(
    isNewTestament && bookIndex >= 0 ? `/bible-interlinear/${bookIndex + 1}.json` : null,
    fetcher,
    { revalidateOnFocus: false, revalidateIfStale: false },
  )

  const verses = data?.chapters[String(chapter)] ?? []

  return (
    <div className="py-2">
      <div className="mb-7 flex flex-col gap-1 text-center">
        <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">
          {book} {chapter}
        </h2>
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          Greek Interlinear · Textus Receptus
        </p>
      </div>

      {!isNewTestament && (
        <div className="mx-auto max-w-md rounded-xl border border-border/60 bg-card px-6 py-12 text-center">
          <ScrollText className="mx-auto mb-3 size-6 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">Interlinear coming soon for this book</p>
          <p className="mt-1 text-sm text-muted-foreground">
            The word-by-word Greek interlinear currently covers the New Testament. Switch to a New Testament book to
            explore the original language, or read this book in the King James Version.
          </p>
        </div>
      )}

      {isNewTestament && isLoading && (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
          <span className="text-sm">Loading interlinear…</span>
        </div>
      )}

      {isNewTestament && error && (
        <div className="py-16 text-center">
          <p className="text-sm text-muted-foreground">We couldn&apos;t load this passage. Please try again.</p>
        </div>
      )}

      {isNewTestament && data && !isLoading && (
        <ol className="mx-auto max-w-3xl space-y-6">
          {verses.map((v) => (
            <li key={v.verse} className="flex gap-3">
              <span className="select-none pt-1.5 text-xs font-semibold text-primary tabular-nums">{v.verse}</span>
              <div className="flex flex-1 flex-wrap gap-x-1 gap-y-3">
                {v.words.map((w, i) => (
                  <InterlinearWord key={i} word={w} />
                ))}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

function InterlinearWord({ word }: { word: InterWord }) {
  return (
    <span
      className="group inline-flex min-w-[3.5rem] flex-col items-center rounded-md px-1.5 py-1 transition-colors hover:bg-secondary/70"
      title={`${word.d} · ${word.m}`}
    >
      <span className="text-xl font-semibold leading-tight text-foreground">{word.g}</span>
      <span className="text-xs italic leading-tight text-muted-foreground">{word.t}</span>
      <span className="mt-0.5 max-w-[12ch] text-center text-[11px] leading-tight text-foreground/70">{word.e}</span>
      <span className="mt-0.5 font-mono text-[10px] leading-none text-primary">G{word.s}</span>
    </span>
  )
}
