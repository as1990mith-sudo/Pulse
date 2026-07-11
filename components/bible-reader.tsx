"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import useSWR from "swr"
import {
  BookOpen,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Highlighter,
  Languages,
  Loader2,
  MessageCircle,
  Share2,
  X,
} from "lucide-react"
import { BIBLE_BOOKS, getBook } from "@/lib/bible-books"
import { InterlinearPane } from "@/components/interlinear-pane"
import { getApiPassage, type ApiTranslation } from "@/app/actions/bible"
import { cn } from "@/lib/utils"
import { BibleFellowship } from "@/components/bible/bible-fellowship"
import { BibleReaderIndicator } from "@/components/bible/reader-indicator"
import { useBibleFellowshipOptional } from "@/components/bible/fellowship-context"

// Reading translations share one verse-rendering pane; "interlinear" (Strong's)
// is a separate study view.
type ReadMode = "kjv" | "nlt" | "msg" | "interlinear"

const TRANSLATION_LABEL: Record<"kjv" | "nlt" | "msg", string> = {
  kjv: "King James Version",
  nlt: "New Living Translation",
  msg: "The Message",
}
const TRANSLATION_SHORT: Record<"kjv" | "nlt" | "msg", string> = {
  kjv: "KJV",
  nlt: "NLT",
  msg: "MSG",
}

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
  const [mode, setMode] = useState<ReadMode>("kjv")
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
    mode === "kjv" && bookIndex >= 0 ? `/bible/${bookIndex + 1}.json` : null,
    fetcher,
    { revalidateOnFocus: false, revalidateIfStale: false },
  )

  // Copyrighted translations (NLT/MSG) are fetched live from the licensed
  // provider via a server action — never bundled. SWR caches per chapter.
  const isApiMode = mode === "nlt" || mode === "msg"
  const {
    data: apiData,
    error: apiError,
    isLoading: apiLoading,
  } = useSWR(
    isApiMode && bookIndex >= 0 ? ["api-passage", mode, bookIndex, chapter] : null,
    async ([, translation, bIndex, ch]) => {
      const result = await getApiPassage({
        translation: translation as ApiTranslation,
        bookIndex: bIndex as number,
        chapter: ch as number,
      })
      if (!result.ok) {
        const err = new Error(result.message) as Error & { reason?: string }
        err.reason = result.reason
        throw err
      }
      return result.verses
    },
    { revalidateOnFocus: false, revalidateIfStale: false, shouldRetryOnError: false },
  )

  const isNewTestament = current?.testament === "new"

  // Unified verse list + loading/error for whichever reading translation is on.
  const verses: Verse[] = isApiMode ? apiData ?? [] : data?.chapters[String(chapter)] ?? []
  const readingLoading = isApiMode ? apiLoading : isLoading
  const readingError = isApiMode ? apiError : error
  const translationKey = (mode === "interlinear" ? "kjv" : mode) as "kjv" | "nlt" | "msg"

  // Verse tapped for the Copy / Share / Highlight popover, plus the on-screen
  // rect of the tapped verse so the popover can anchor near it.
  const [selectedVerse, setSelectedVerse] = useState<number | null>(null)
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null)

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

  // Direct highlight setter used by the per-verse action sheet (null clears it).
  function setVerseHighlight(verse: number, key: HighlightKey | null) {
    const id = `${bookIndex}:${chapter}:${verse}`
    setHighlights((prev) => {
      const next = { ...prev }
      if (key === null) delete next[id]
      else next[id] = key
      return next
    })
  }

  // Tapping a verse highlights it when a colour is armed, otherwise opens the
  // Copy / Share / Highlight popover anchored to the tapped verse.
  function onVerseTap(verse: number, el: HTMLElement) {
    if (activeColor) toggleHighlight(verse)
    else {
      setAnchorRect(el.getBoundingClientRect())
      setSelectedVerse(verse)
    }
  }

  const isFirst = bookIndex === 0 && chapter === 1
  const isLast = bookIndex === BIBLE_BOOKS.length - 1 && current ? chapter >= current.chapters : false

  // Derive what the reader is doing right now from existing reading state, so
  // fellow readers see an honest activity ("Highlighting verses" vs "Reading").
  const activity = activeColor ? "highlighting" : "reading"

  return (
    <BibleFellowship book={book} chapter={chapter} activity={activity}>
    <div className="space-y-5">
      {/* Sticky selector bar — the translation, book/chapter, and highlight
          selectors stay pinned just below the app header (h-16 + safe area) so
          they never scroll out of view while reading. */}
      <div className="sticky top-[calc(env(safe-area-inset-top,0px)+4rem)] z-30 -mx-4 space-y-3 border-b border-border/60 bg-background/90 px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6">
      {/* Translation / interlinear toggle */}
      <div className="flex justify-center">
        <div
          role="tablist"
          aria-label="Reading mode"
          className="inline-flex flex-wrap items-center justify-center gap-1 rounded-full border border-border/60 bg-secondary/40 p-1"
        >
          {([
            { key: "kjv", label: "KJV", icon: <BookOpen className="size-4" /> },
            { key: "interlinear", label: "Strong's", icon: <Languages className="size-4" /> },
          ] as const).map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={mode === t.key}
              onClick={() => {
                setMode(t.key)
                setSelectedVerse(null)
              }}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-all duration-200 sm:px-4",
                mode === t.key
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>

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

      {/* Highlighter toolbar — reading translations only (not Strong's) */}
      {mode !== "interlinear" && (
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
      )}
      </div>

      {/* Interlinear reading pane */}
      {mode === "interlinear" && (
        <InterlinearPane
          book={book}
          chapter={chapter}
          bookIndex={bookIndex}
          isNewTestament={!!isNewTestament}
        />
      )}

      {/* Reading pane — borderless and immersive (KJV / NLT / MSG) */}
      {mode !== "interlinear" && (
      <div className="py-2">
        <div className="mb-7 flex flex-col items-center gap-2 text-center">
          <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">
            {book} {chapter}
          </h2>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            {TRANSLATION_LABEL[translationKey]}
          </p>
          {/* Live reader-presence indicator — reads its state from the
              fellowship provider; renders nothing when signed out. */}
          <BibleReaderIndicator />
        </div>

        {readingLoading && (
          <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
            <span className="text-sm">Loading passage…</span>
          </div>
        )}

        {readingError && !readingLoading && (
          <div className="mx-auto max-w-prose py-16 text-center">
            <p className="text-sm text-muted-foreground">
              {(readingError as Error)?.message ?? "We couldn't load this passage. Please try again."}
            </p>
            {(readingError as Error & { reason?: string })?.reason === "unconfigured" && (
              <p className="mt-1 text-xs text-muted-foreground/80">
                King James and Strong&apos;s are available offline in the meantime.
              </p>
            )}
          </div>
        )}

        {!readingLoading && !readingError && verses.length > 0 && (
          <ol className="mx-auto max-w-prose space-y-1">
            {verses.map((v) => {
              const id = `${bookIndex}:${chapter}:${v.verse}`
              const hl = highlights[id]
              const color = HIGHLIGHTS.find((h) => h.key === hl)
              return (
                <li
                  key={v.verse}
                  onClick={(e) => onVerseTap(v.verse, e.currentTarget)}
                  className={cn(
                    "flex cursor-pointer gap-3 rounded-md px-2 py-0.5 text-lg leading-relaxed text-justify [text-justify:inter-word] transition-colors hover:bg-secondary/60",
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
      )}

      {/* Per-verse Copy / Share / Highlight sheet */}
      {selectedVerse !== null && (() => {
        const v = verses.find((x) => x.verse === selectedVerse)
        if (!v) return null
        const id = `${bookIndex}:${chapter}:${selectedVerse}`
        return (
          <VerseActionSheet
            reference={`${book} ${chapter}:${selectedVerse}`}
            translationShort={TRANSLATION_SHORT[translationKey]}
            text={v.text}
            anchorRect={anchorRect}
            activeHighlight={highlights[id] ?? null}
            onHighlight={(key) => setVerseHighlight(selectedVerse, key)}
            onClose={() => setSelectedVerse(null)}
          />
        )
      })()}

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
    </BibleFellowship>
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

const VERSE_POPOVER_WIDTH = 300 // px — used to clamp the popover within the viewport.

/**
 * Compact popover shown when a verse is tapped, anchored near the verse itself
 * (not a full-screen sheet): copy the text, share it via the native share sheet
 * (with a clipboard fallback), or highlight it in a colour.
 */
function VerseActionSheet({
  reference,
  translationShort,
  text,
  anchorRect,
  activeHighlight,
  onHighlight,
  onClose,
}: {
  reference: string
  translationShort: string
  text: string
  anchorRect: DOMRect | null
  activeHighlight: HighlightKey | null
  onHighlight: (key: HighlightKey | null) => void
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)
  const popRef = useRef<HTMLDivElement>(null)
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null)
  const formatted = `"${text}" — ${reference} (${translationShort})`

  // When a floating fellowship chat is open, offer to share this verse straight
  // into it (sent as formatted text, so it lands in the real DM thread too).
  const fellowship = useBibleFellowshipOptional()
  const canShareToChat = Boolean(fellowship?.hasOpenChat)

  // Anchor the popover to the tapped verse, clamped to the viewport and flipped
  // above the verse when there isn't enough room below it.
  useLayoutEffect(() => {
    if (!anchorRect) return
    const compute = () => {
      const margin = 8
      const vw = window.innerWidth
      const vh = window.innerHeight
      const width = Math.min(VERSE_POPOVER_WIDTH, vw - margin * 2)
      const height = popRef.current?.offsetHeight ?? 220
      let left = anchorRect.left + anchorRect.width / 2 - width / 2
      left = Math.max(margin, Math.min(left, vw - width - margin))
      const spaceBelow = vh - anchorRect.bottom
      const top =
        spaceBelow < height + margin && anchorRect.top > spaceBelow
          ? Math.max(margin, anchorRect.top - height - 6)
          : Math.min(anchorRect.bottom + 6, vh - height - margin)
      setCoords({ top, left })
    }
    compute()
    window.addEventListener("scroll", compute, true)
    window.addEventListener("resize", compute)
    return () => {
      window.removeEventListener("scroll", compute, true)
      window.removeEventListener("resize", compute)
    }
  }, [anchorRect])

  async function copy() {
    try {
      await navigator.clipboard.writeText(formatted)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      // Clipboard may be blocked; the share action remains available.
    }
  }

  async function share() {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: reference, text: formatted })
        return
      } catch {
        // User cancelled or share failed — fall back to copying.
      }
    }
    void copy()
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    function onDown(e: MouseEvent) {
      if (popRef.current && !popRef.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener("keydown", onKey)
    document.addEventListener("mousedown", onDown)
    return () => {
      document.removeEventListener("keydown", onKey)
      document.removeEventListener("mousedown", onDown)
    }
  }, [onClose])

  if (typeof document === "undefined") return null

  return createPortal(
    <div
      ref={popRef}
      role="dialog"
      aria-label={`${reference} actions`}
      style={{
        position: "fixed",
        top: coords?.top ?? -9999,
        left: coords?.left ?? -9999,
        width: Math.min(VERSE_POPOVER_WIDTH, typeof window !== "undefined" ? window.innerWidth - 16 : VERSE_POPOVER_WIDTH),
        visibility: coords ? "visible" : "hidden",
      }}
      className="z-[70] rounded-2xl border border-border bg-popover-solid p-3 text-popover-foreground shadow-2xl duration-150 animate-in fade-in zoom-in-95"
    >
        <div className="mb-2.5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-bold">{reference}</p>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">{translationShort}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="-mr-1 -mt-1 inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        <p className="mb-4 max-h-32 overflow-y-auto text-pretty text-sm leading-relaxed text-muted-foreground">{text}</p>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void copy()}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-secondary px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-secondary/80"
          >
            {copied ? <Check className="size-4 text-primary" /> : <Copy className="size-4" />}
            {copied ? "Copied" : "Copy"}
          </button>
          <button
            type="button"
            onClick={() => void share()}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-95"
          >
            <Share2 className="size-4" /> Share
          </button>
        </div>

        {canShareToChat && (
          <button
            type="button"
            onClick={() => {
              fellowship?.shareVerse({ reference, text })
              onClose()
            }}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-4 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-primary/15"
          >
            <MessageCircle className="size-4" /> Send to chat
          </button>
        )}

        <div className="mt-4 flex items-center gap-2">
          <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Highlighter className="size-3.5" /> Highlight
          </span>
          {HIGHLIGHTS.map((h) => (
            <button
              key={h.key}
              type="button"
              onClick={() => onHighlight(activeHighlight === h.key ? null : h.key)}
              className={cn(
                "size-7 rounded-full ring-2 ring-offset-2 ring-offset-popover-solid transition-all",
                activeHighlight === h.key ? "ring-foreground" : "ring-transparent hover:ring-border",
              )}
              style={{ backgroundColor: h.swatch }}
              aria-label={`${h.label} highlight`}
              aria-pressed={activeHighlight === h.key}
            />
          ))}
          {activeHighlight && (
            <button
              type="button"
              onClick={() => onHighlight(null)}
              className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-secondary"
            >
              <X className="size-3.5" /> Clear
            </button>
          )}
        </div>
    </div>,
    document.body,
  )
}
