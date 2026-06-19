"use client"

import { useState } from "react"
import useSWR from "swr"
import { BookOpen, ChevronDown, ChevronLeft, ChevronRight, Loader2 } from "lucide-react"
import { BIBLE_BOOKS, getBook } from "@/lib/bible-books"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

type Verse = { verse: number; text: string }
type ChapterResponse = {
  reference: string
  verses: Verse[]
  translation_name?: string
}

const fetcher = async (url: string): Promise<ChapterResponse> => {
  const res = await fetch(url)
  if (!res.ok) throw new Error("Could not load this passage.")
  return res.json()
}

export function BibleReader() {
  const [book, setBook] = useState("John")
  const [chapter, setChapter] = useState(1)

  const current = getBook(book)
  const query = `${book} ${chapter}`
  const { data, error, isLoading } = useSWR(
    `https://bible-api.com/${encodeURIComponent(query)}?translation=web`,
    fetcher,
    { revalidateOnFocus: false },
  )

  const bookIndex = BIBLE_BOOKS.findIndex((b) => b.name === book)

  function goPrev() {
    if (chapter > 1) {
      setChapter(chapter - 1)
    } else if (bookIndex > 0) {
      const prev = BIBLE_BOOKS[bookIndex - 1]
      setBook(prev.name)
      setChapter(prev.chapters)
    }
    scrollTop()
  }

  function goNext() {
    if (current && chapter < current.chapters) {
      setChapter(chapter + 1)
    } else if (bookIndex < BIBLE_BOOKS.length - 1) {
      const next = BIBLE_BOOKS[bookIndex + 1]
      setBook(next.name)
      setChapter(1)
    }
    scrollTop()
  }

  function scrollTop() {
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" })
  }

  function selectBook(name: string) {
    setBook(name)
    setChapter(1)
  }

  const isFirst = bookIndex === 0 && chapter === 1
  const isLast = bookIndex === BIBLE_BOOKS.length - 1 && current ? chapter >= current.chapters : false

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Book picker */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium transition-colors hover:bg-secondary"
              />
            }
          >
            <BookOpen className="size-4 text-primary" />
            {book}
            <ChevronDown className="size-4 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-[60vh] w-56 overflow-y-auto">
            <DropdownMenuLabel>Old Testament</DropdownMenuLabel>
            {BIBLE_BOOKS.filter((b) => b.testament === "old").map((b) => (
              <DropdownMenuItem
                key={b.name}
                onClick={() => selectBook(b.name)}
                className={cn(b.name === book && "bg-secondary font-medium")}
              >
                {b.name}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuLabel>New Testament</DropdownMenuLabel>
            {BIBLE_BOOKS.filter((b) => b.testament === "new").map((b) => (
              <DropdownMenuItem
                key={b.name}
                onClick={() => selectBook(b.name)}
                className={cn(b.name === book && "bg-secondary font-medium")}
              >
                {b.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Chapter picker */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium transition-colors hover:bg-secondary"
              />
            }
          >
            Chapter {chapter}
            <ChevronDown className="size-4 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-[60vh] w-64 overflow-y-auto">
            <DropdownMenuLabel>Chapters</DropdownMenuLabel>
            <div className="grid grid-cols-5 gap-1 p-1">
              {Array.from({ length: current?.chapters ?? 1 }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => {
                    setChapter(n)
                    scrollTop()
                  }}
                  className={cn(
                    "flex h-9 items-center justify-center rounded-md text-sm transition-colors hover:bg-secondary",
                    n === chapter ? "bg-primary text-primary-foreground" : "text-foreground",
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

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

      {/* Reading pane */}
      <Card className="p-6 sm:p-8">
        <div className="mb-6 flex flex-col gap-1 border-b border-border/60 pb-4">
          <h2 className="text-2xl font-bold tracking-tight">
            {book} {chapter}
          </h2>
          <p className="text-xs text-muted-foreground">{data?.translation_name ?? "World English Bible"}</p>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
            <span className="text-sm">Loading passage…</span>
          </div>
        )}

        {error && (
          <div className="py-16 text-center">
            <p className="text-sm text-muted-foreground">
              We couldn&apos;t load this passage. Please check your connection and try again.
            </p>
          </div>
        )}

        {data && !isLoading && (
          <div className="space-y-1 text-pretty leading-loose text-foreground/90">
            {data.verses.map((v) => (
              <span key={v.verse} className="inline">
                <sup className="mr-1 align-super text-xs font-semibold text-primary">{v.verse}</sup>
                <span>{v.text.replace(/\n/g, " ").trim()} </span>
              </span>
            ))}
          </div>
        )}
      </Card>

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
