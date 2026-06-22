"use client"

import { useState } from "react"
import useSWR from "swr"
import { Loader2, ScrollText } from "lucide-react"

// Word-level data (Textus Receptus Greek NT) used to render a Strong's-tagged
// reading. Field names are kept short in the bundled JSON to reduce payload size.
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
 * Renders a "Bible with Strong's numbers" for a single chapter: the verse reads
 * as flowing English, and every word carries a tappable Strong's number. Tapping
 * a word reveals its original Greek, transliteration, lemma and morphology.
 * Strong's data is bundled only for the New Testament; Old Testament books show
 * a friendly notice.
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
          Strong&apos;s Numbers · Textus Receptus
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

      {isNewTestament && error && (
        <div className="py-16 text-center">
          <p className="text-sm text-muted-foreground">We couldn&apos;t load this passage. Please try again.</p>
        </div>
      )}

      {isNewTestament && data && !isLoading && (
        <>
          <p className="mb-5 text-center text-xs text-muted-foreground">Tap any word to see its original Greek.</p>
          <ol className="mx-auto max-w-prose space-y-1">
            {verses.map((v) => (
              <li
                key={v.verse}
                className="flex gap-3 rounded-md px-2 py-0.5 text-lg leading-relaxed text-justify [text-justify:inter-word]"
              >
                <span className="select-none pt-1 text-xs font-semibold text-primary tabular-nums">{v.verse}</span>
                <span className="flex-1">
                  {v.words.map((w, i) => (
                    <StrongsWord key={i} word={w} />
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

function StrongsWord({ word }: { word: InterWord }) {
  const [open, setOpen] = useState(false)

  return (
    <span className="relative mr-1 inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="group rounded px-0.5 text-left align-baseline text-foreground transition-colors hover:bg-secondary/70 aria-expanded:bg-secondary"
      >
        <span className="group-hover:underline group-hover:decoration-primary group-hover:decoration-dotted group-hover:underline-offset-4">
          {word.e}
        </span>
        <span className="ml-0.5 align-super font-mono text-[10px] leading-none text-primary">G{word.s}</span>
      </button>

      {open && (
        <span
          role="tooltip"
          className="absolute left-1/2 top-full z-30 mt-1 w-52 -translate-x-1/2 rounded-xl border border-border/60 bg-card p-3 text-left shadow-xl duration-150 animate-in fade-in zoom-in-95"
        >
          <span className="block text-lg font-semibold leading-tight text-foreground">{word.g}</span>
          <span className="block text-sm italic leading-tight text-muted-foreground">{word.t}</span>
          <span className="mt-1.5 flex items-center gap-1.5">
            <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-primary">
              G{word.s}
            </span>
            <span className="truncate text-sm text-foreground/80">{word.d}</span>
          </span>
          <span className="mt-1 block text-xs text-muted-foreground">{word.m}</span>
          <span className="mt-1.5 block border-t border-border/60 pt-1.5 text-sm text-foreground">{word.e}</span>
        </span>
      )}
    </span>
  )
}
