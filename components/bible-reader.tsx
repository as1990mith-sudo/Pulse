"use client"

import { useEffect, useRef, useState } from "react"
import useSWR from "swr"
import { BookOpen, ChevronDown, ChevronLeft, ChevronRight, Highlighter, Loader2, X } from "lucide-react"
import { BIBLE_BOOKS, getBook } from "@/lib/bible-books"
import { cn } from "@/lib/utils"

type Verse = { verse: number; text: string }
type BookData = { book: string; chapters: Record<string, Verse[]> }

const fetcher = async (url: string): Promise<BookData> => {
  const res = await fetch(url)
  if (!res.ok) throw new Error("Could not load this book.")
  return res.json()
}

const HIGHLIGHTS = [
  { key: "yellow", label: "Yellow", swatch: "#facc15", bg: "rgba(250, 204, 21, 0.40)" },
  { key: "green", label: "Green", swatch: "#4ade80", bg: "rgba(74, 222, 128, 0.38)" },
  { key: "blue", label: "Blue", swatch: "#60a5fa", bg: "rgba(96, 165, 250, 0.38)" },
  { key: "pink", label: "Pink", swatch: "#f472b6", bg: "rgba(244, 114, 182, 0.38)" },
] as const

type HighlightKey = (typeof HIGHLIGHTS)[number]["key"]

const STORAGE_KEY = "frequency-bible-highlights"

export function BibleReader() {
  const [book, setBook] = useState("John")
  const [chapter, setChapter] = useState(1)
  const [activeColor, setActiveColor] = useState<HighlightKey | null>(null)
  const [highlights, setHighlights] = useState<Record<string, HighlightKey>>({})
  const [loaded, setLoaded] = useState(false)

  const current = getBook(book)
  const bookIndex = BIBLE_BOOKS.findIndex((b) => b.name === book)

  // Load saved highlights from the browser once on mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) setHighlights(JSON.parse(raw))
    } catch {
      // ignore corrupt storage
    }
    setLoaded(true)
  }, [])

  // Persist highlights whenever they change.
  useEffect(() => {
    if (!loaded) return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(highlights))
    } catch {
      // ignore quota errors
    }
  }, [highlights, loaded])

  // Bundled, offline KJV: each book ships as a static JSON file in /public/bible.
  const { data, error, isLoading } = useSWR(
    bookIndex >= 0 ? `/bible/${bookIndex + 1}.json` : null,
    fetcher,
    { revalidateOnFocus: false, revalidateIfStale: false },
  )

  const verses = data?.chapters[String(chapter)] ?? []

  function scrollTop() {
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" })
  }

  function goPrev() {
    if (chapter > 1) setChapter(chapter - 1)
    else if (bookIndex > 0) {
      const prev = BIBLE_BOOKS[bookIndex - 1]
      setBook(prev.name)
      setChapter(prev.chapters)
    }
    scrollTop()
  }

  function goNext() {
    if (current && chapter < current.chapters) setChapter(chapter + 1)
    else if (bookIndex < BIBLE_BOOKS.length - 1) {
      const next = BIBLE_BOOKS[bookIndex + 1]
      setBook(next.name)
      setChapter(1)
    }
    scrollTop()
  }

  function toggleHighlight(verse: number) {
    if (!activeColor) return
    const id = `${bookIndex}:${chapter}:${verse}`
    setHighlights((prev) => {
      const next = { ...prev }
      if (next[id] === activeColor) delete next[id]
      else next[id] = activeColor
      return next
    })
  }

  const isFirst = bookIndex === 0 && chapter === 1
  const isLast = bookIndex === BIBLE_BOOKS.length - 1 && current ? chapter >= current.chapters : false

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <BookPicker book={book} onSelect={(name) => { setBook(name); setChapter(1); scrollTop() }} />
        <ChapterPicker
          chapter={chapter}
          count={current?.chapters ?? 1}
          onSelect={(n) => { setChapter(n); scrollTop() }}
        />

        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={goPrev}
            disabled={isFirst}
            className="inline-flex size-9 items-center justify-center rounded-lg border border-border bg-card transition-colors hover:bg-secondary disabled:opacity-40"
            aria-label="Previous chapter"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            onClick={goNext}
            disabled={isLast}
            className="inline-flex size-9 items-center justify-center rounded-lg border border-border bg-card transition-colors hover:bg-secondary disabled:opacity-40"
            aria-label="Next chapter"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>

      {/* Highlighter toolbar */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-card px-3 py-2">
        <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Highlighter className="size-3.5" /> Highlight
        </span>
        {HIGHLIGHTS.map((h) => (
          <button
            key={h.key}
            type="button"
            onClick={() => setActiveColor(activeColor === h.key ? null : h.key)}
            className={cn(
              "size-6 rounded-full ring-2 ring-offset-2 ring-offset-card transition-all",
              activeColor === h.key ? "ring-foreground" : "ring-transparent hover:ring-border",
            )}
            style={{ backgroundColor: h.swatch }}
            aria-label={`${h.label} highlighter`}
            aria-pressed={activeColor === h.key}
          />
        ))}
        {activeColor && (
          <button
            type="button"
            onClick={() => setActiveColor(null)}
            className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-secondary"
          >
            <X className="size-3.5" /> Done
          </button>
        )}
        <span className={cn("text-xs text-muted-foreground", activeColor ? "w-full sm:w-auto" : "ml-auto")}>
          {activeColor ? "Tap a verse to highlight it." : "Pick a colour, then tap verses."}
        </span>
      </div>

      {/* Reading pane — borderless and immersive */}
      <div className="py-2">
        <div className="mb-7 flex flex-col gap-1 text-center">
          <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">
            {book} {chapter}
          </h2>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">King James Version</p>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
            <span className="text-sm">Loading passage…</span>
          </div>
        )}

        {error && (
          <div className="py-16 text-center">
            <p className="text-sm text-muted-foreground">We couldn&apos;t load this passage. Please try again.</p>
          </div>
        )}

        {data && !isLoading && (
          <ol className="mx-auto max-w-prose space-y-1">
            {verses.map((v) => {
              const id = `${bookIndex}:${chapter}:${v.verse}`
              const hl = highlights[id]
              const color = HIGHLIGHTS.find((h) => h.key === hl)
              return (
                <li
                  key={v.verse}
                  onClick={() => toggleHighlight(v.verse)}
                  className={cn(
                    "flex gap-3 rounded-md px-2 py-0.5 text-lg leading-relaxed text-justify [text-justify:inter-word]",
                    activeColor ? "cursor-pointer hover:bg-secondary/60" : "cursor-default",
                  )}
                  style={color ? { backgroundColor: color.bg } : undefined}
                >
                  <span className="select-none pt-1 text-xs font-semibold text-primary tabular-nums">{v.verse}</span>
                  <span className="flex-1">{v.text}</span>
                </li>
              )
            })}
          </ol>
        )}
      </div>

      {/* Footer nav */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={goPrev}
          disabled={isFirst}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium transition-colors hover:bg-secondary disabled:opacity-40"
        >
          <ChevronLeft className="size-4" /> Previous
        </button>
        <button
          type="button"
          onClick={goNext}
          disabled={isLast}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium transition-colors hover:bg-secondary disabled:opacity-40"
        >
          Next <ChevronRight className="size-4" />
        </button>
      </div>
    </div>
  )
}

/** Lightweight click-away dropdown used for the book and chapter pickers. */
function Picker({
  label,
  icon,
  children,
  width = "w-56",
}: {
  label: React.ReactNode
  icon?: React.ReactNode
  children: (close: () => void) => React.ReactNode
  width?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium transition-colors hover:bg-secondary"
      >
        {icon}
        {label}
        <ChevronDown className="size-4 text-muted-foreground" />
      </button>
      {open && (
        <div
          className={cn(
            "absolute left-0 top-full z-50 mt-1 max-h-[60vh] overflow-y-auto rounded-lg border border-border bg-popover-solid p-1 text-popover-foreground shadow-lg",
            width,
          )}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

function BookPicker({ book, onSelect }: { book: string; onSelect: (name: string) => void }) {
  return (
    <Picker label={book} icon={<BookOpen className="size-4 text-primary" />}>
      {(close) => (
        <>
          <p className="px-2 py-1 text-xs font-medium text-muted-foreground">Old Testament</p>
          {BIBLE_BOOKS.filter((b) => b.testament === "old").map((b) => (
            <button
              key={b.name}
              type="button"
              onClick={() => { onSelect(b.name); close() }}
              className={cn(
                "block w-full rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-secondary",
                b.name === book && "bg-secondary font-medium",
              )}
            >
              {b.name}
            </button>
          ))}
          <div className="my-1 h-px bg-border" />
          <p className="px-2 py-1 text-xs font-medium text-muted-foreground">New Testament</p>
          {BIBLE_BOOKS.filter((b) => b.testament === "new").map((b) => (
            <button
              key={b.name}
              type="button"
              onClick={() => { onSelect(b.name); close() }}
              className={cn(
                "block w-full rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-secondary",
                b.name === book && "bg-secondary font-medium",
              )}
            >
              {b.name}
            </button>
          ))}
        </>
      )}
    </Picker>
  )
}

function ChapterPicker({
  chapter,
  count,
  onSelect,
}: {
  chapter: number
  count: number
  onSelect: (n: number) => void
}) {
  return (
    <Picker label={`Chapter ${chapter}`} width="w-44">
      {(close) => (
        <div className="flex flex-col gap-0.5 p-1">
          {Array.from({ length: count }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => { onSelect(n); close() }}
              className={cn(
                "flex h-9 items-center rounded-md px-3 text-left text-sm transition-colors hover:bg-secondary",
                n === chapter ? "bg-primary font-medium text-primary-foreground" : "text-foreground",
              )}
            >
              Chapter {n}
            </button>
          ))}
        </div>
      )}
    </Picker>
  )
}
