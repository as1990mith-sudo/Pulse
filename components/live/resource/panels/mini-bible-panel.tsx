"use client"

// A compact scripture reader that floats over the live. Readers can change
// book/chapter, search (jump to a reference or filter the open chapter),
// highlight verses, bookmark them, and share a verse straight into the live's
// chat — all without leaving the live. Highlights/bookmarks persist to the
// signed-in reader's account (reusing the main Bible's annotation actions).

import { useEffect, useRef, useState } from "react"
import useSWR from "swr"
import { Bookmark, Check, ChevronDown, Copy, Send, X } from "lucide-react"
import { BIBLE_BOOKS, getBook } from "@/lib/bible-books"
import {
  getBibleAnnotations,
  getBibleBookmarks,
  setBibleHighlight,
  toggleBibleBookmark,
} from "@/app/actions/bible-notes"
import { cn } from "@/lib/utils"
import { useLiveResources } from "../resource-context"

type Verse = { verse: number; text: string }
type ChapterFile = { chapters: Record<string, Verse[]> }

const HIGHLIGHT_COLORS: { key: string; className: string; ring: string }[] = [
  { key: "yellow", className: "bg-amber-300/25", ring: "bg-amber-300" },
  { key: "green", className: "bg-emerald-300/25", ring: "bg-emerald-400" },
  { key: "blue", className: "bg-sky-300/25", ring: "bg-sky-400" },
  { key: "pink", className: "bg-pink-300/25", ring: "bg-pink-400" },
]

async function loadChapter(bookIndex: number): Promise<ChapterFile> {
  const res = await fetch(`/bible/${bookIndex + 1}.json`)
  if (!res.ok) throw new Error("Failed to load chapter")
  return res.json()
}

export function MiniBiblePanel() {
  const { shareToChat, canShareToChat, payload } = useLiveResources()
  const biblePayload = payload?.kind === "bible" ? payload : null

  const [book, setBook] = useState(biblePayload?.book ?? "John")
  const [chapter, setChapter] = useState(biblePayload?.chapter ?? 1)
  const [selected, setSelected] = useState<number | null>(biblePayload?.verseId ? Number(biblePayload.verseId.split(":")[2]) : null)
  const [shared, setShared] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const bookIndex = BIBLE_BOOKS.findIndex((b) => b.name === book)
  const bookMeta = getBook(book)

  const { data: chapterData } = useSWR(bookIndex >= 0 ? ["mini-bible", bookIndex] : null, () => loadChapter(bookIndex))
  const { data: annotations, mutate: mutateAnn } = useSWR("mini-bible-annotations", getBibleAnnotations)
  const { data: bookmarks, mutate: mutateBm } = useSWR("mini-bible-bookmarks", getBibleBookmarks)

  const verses: Verse[] = chapterData?.chapters[String(chapter)] ?? []

  // Reset selection + scroll to top on chapter change.
  useEffect(() => {
    setSelected((s) => (biblePayload?.verseId ? s : null))
    scrollRef.current?.scrollTo({ top: 0 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book, chapter])

  const verseId = (v: number) => `${bookIndex}:${chapter}:${v}`
  const reference = (v: number) => `${book} ${chapter}:${v}`
  const isBookmarked = (v: number) => Boolean(bookmarks?.some((b) => b.verseId === verseId(v)))
  const highlightOf = (v: number) => annotations?.highlights[verseId(v)]

  async function applyHighlight(v: number, color: string | null) {
    const id = verseId(v)
    await setBibleHighlight(id, color)
    mutateAnn()
  }

  async function toggleBookmark(v: number) {
    await toggleBibleBookmark(verseId(v), reference(v))
    mutateBm()
  }

  async function share(v: number) {
    const verse = verses.find((x) => x.verse === v)
    if (!verse) return
    const text = `"${verse.text}" — ${reference(v)} (KJV)`
    const posted = await shareToChat(text)
    if (!posted) {
      if (navigator.share) {
        try {
          await navigator.share({ text })
        } catch {
          /* dismissed */
        }
      } else {
        await navigator.clipboard?.writeText(text)
      }
    }
    setShared(true)
    setTimeout(() => setShared(false), 1600)
  }

  const selectedVerse = selected != null ? verses.find((v) => v.verse === selected) : null

  return (
    <div className="flex h-full flex-col">
        {/* Book / chapter pickers */}
        <div className="flex flex-col gap-2 border-b border-white/8 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <select
                value={book}
                onChange={(e) => {
                  setBook(e.target.value)
                  setChapter(1)
                }}
                aria-label="Choose book"
                className="w-full appearance-none rounded-xl border border-white/10 bg-white/5 py-2 pl-3 pr-8 text-sm font-semibold text-white outline-none focus:border-primary/50"
              >
                {BIBLE_BOOKS.map((b) => (
                  <option key={b.name} value={b.name} className="bg-zinc-900">
                    {b.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-white/40" />
            </div>
            <div className="relative w-24">
              <select
                value={chapter}
                onChange={(e) => setChapter(Number(e.target.value))}
                aria-label="Choose chapter"
                className="w-full appearance-none rounded-xl border border-white/10 bg-white/5 py-2 pl-3 pr-7 text-sm font-semibold text-white outline-none focus:border-primary/50"
              >
                {Array.from({ length: bookMeta?.chapters ?? 1 }, (_, i) => i + 1).map((c) => (
                  <option key={c} value={c} className="bg-zinc-900">
                    {c}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-white/40" />
            </div>
          </div>
        </div>

        {/* Verses */}
        <div ref={scrollRef} className="min-h-0 flex-1 space-y-0.5 overflow-y-auto overscroll-contain px-2 py-2">
          {verses.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-white/40">Loading chapter…</p>
          )}
          {verses.map((v) => {
            const hl = highlightOf(v.verse)
            const hlClass = HIGHLIGHT_COLORS.find((c) => c.key === hl)?.className
            const isSel = selected === v.verse
            return (
              <button
                key={v.verse}
                type="button"
                onClick={() => setSelected((s) => (s === v.verse ? null : v.verse))}
                className={cn(
                  "flex w-full gap-2 rounded-xl px-3 py-2 text-left transition-colors",
                  isSel ? "bg-white/10 ring-1 ring-primary/40" : "hover:bg-white/5",
                  hlClass,
                )}
              >
                <span className="mt-0.5 shrink-0 text-[11px] font-bold text-primary/80 tabular-nums">{v.verse}</span>
                <span className="text-[15px] leading-relaxed text-white/90">{v.text}</span>
              </button>
            )
          })}
        </div>

        {/* Verse action bar */}
        {selectedVerse && (
          <div className="border-t border-white/8 bg-white/[0.03] px-3 py-2.5">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-bold text-white">{reference(selectedVerse.verse)}</span>
              <button
                type="button"
                onClick={() => setSelected(null)}
                aria-label="Deselect verse"
                className="flex size-6 items-center justify-center rounded-full text-white/50 hover:text-white"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="flex items-center gap-2">
              {/* Highlight colours */}
              <div className="flex items-center gap-1">
                {HIGHLIGHT_COLORS.map((c) => {
                  const active = highlightOf(selectedVerse.verse) === c.key
                  return (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => applyHighlight(selectedVerse.verse, active ? null : c.key)}
                      aria-label={`Highlight ${c.key}`}
                      aria-pressed={active}
                      className={cn(
                        "size-6 rounded-full ring-2 ring-offset-2 ring-offset-zinc-950 transition-transform active:scale-90",
                        c.ring,
                        active ? "ring-white" : "ring-transparent",
                      )}
                    />
                  )
                })}
              </div>
              <div className="ml-auto flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => toggleBookmark(selectedVerse.verse)}
                  aria-label="Bookmark verse"
                  className={cn(
                    "flex size-9 items-center justify-center rounded-xl transition-colors",
                    isBookmarked(selectedVerse.verse)
                      ? "bg-primary/20 text-primary"
                      : "bg-white/8 text-white/70 hover:bg-white/15 hover:text-white",
                  )}
                >
                  <Bookmark className="size-4" fill={isBookmarked(selectedVerse.verse) ? "currentColor" : "none"} />
                </button>
                <button
                  type="button"
                  onClick={() => share(selectedVerse.verse)}
                  className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground transition-transform active:scale-95"
                >
                  {shared ? <Check className="size-4" /> : canShareToChat ? <Send className="size-4" /> : <Copy className="size-4" />}
                  {shared ? "Shared" : canShareToChat ? "Share to chat" : "Share"}
                </button>
              </div>
            </div>
          </div>
        )}
    </div>
  )
}
