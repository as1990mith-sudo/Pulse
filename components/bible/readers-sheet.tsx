"use client"

import { useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import useSWR from "swr"
import { Flame, Loader2, MessageCircle, UserCheck, UserPlus, Users, X } from "lucide-react"
import { getBibleReaders, type BibleActivity, type BibleReaderCard } from "@/app/actions/bible-community"
import { toggleFollow } from "@/app/actions/follow"
import { BIBLE_BOOKS } from "@/lib/bible-books"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { getAvatarColor, getInitials } from "@/lib/identity"
import { haptic } from "@/lib/haptics"
import { cn } from "@/lib/utils"
import { useBibleFellowship } from "./fellowship-context"

const BOOK_ORDER = new Map(BIBLE_BOOKS.map((b, i) => [b.name, i]))

function activityLabel(a: BibleActivity, book: string, chapter: number): string {
  switch (a) {
    case "listening":
      return "Listening to Audio Bible"
    case "highlighting":
      return "Highlighting verses"
    case "notes":
      return "Taking notes"
    default:
      return `Reading ${book} ${chapter}`
  }
}

export function BibleReadersSheet() {
  const { readersOpen, closeReaders, scopeBook, indicator, openProfile, openChat } = useReadersSheetCtx()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const scope = indicator?.scope ?? "global"

  // Poll the reader list while the sheet is open. Pauses entirely when closed.
  const { data, isLoading } = useSWR(
    readersOpen ? ["bible-readers", scope, scopeBook] : null,
    () => getBibleReaders({ scope, book: scopeBook }),
    { refreshInterval: 6000, revalidateOnFocus: false, keepPreviousData: true },
  )

  const readers = data ?? []

  // Group readers by book for the global view (canonical order); a single
  // flat list for the same-book view.
  const groups = useMemo(() => {
    if (scope === "book") return [{ book: scopeBook, readers }]
    const byBook = new Map<string, BibleReaderCard[]>()
    for (const r of readers) {
      const arr = byBook.get(r.book) ?? []
      arr.push(r)
      byBook.set(r.book, arr)
    }
    return [...byBook.entries()]
      .sort((a, b) => (BOOK_ORDER.get(a[0]) ?? 999) - (BOOK_ORDER.get(b[0]) ?? 999))
      .map(([book, list]) => ({ book, readers: list }))
  }, [scope, scopeBook, readers])

  // Lock body scroll while open so the sheet feels modal but the Bible stays put.
  useEffect(() => {
    if (!readersOpen) return
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeReaders()
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [readersOpen, closeReaders])

  if (!mounted || !readersOpen) return null

  const total = readers.length
  const globalCount = indicator?.totalReaders ?? total
  const heading =
    scope === "book"
      ? `Reading ${scopeBook}`
      : `${globalCount} ${globalCount === 1 ? "believer" : "believers"} reading the Bible`

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex flex-col justify-end"
      role="dialog"
      aria-modal="true"
      aria-label="People reading now"
    >
      <button
        type="button"
        aria-label="Close readers"
        onClick={closeReaders}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm duration-200 animate-in fade-in"
      />

      <div className="relative flex max-h-[80vh] flex-col rounded-t-3xl border-t border-border/60 bg-card/85 shadow-2xl backdrop-blur-2xl duration-300 animate-in slide-in-from-bottom-8">
        {/* Grabber + header */}
        <div className="flex flex-col items-center gap-3 px-5 pb-3 pt-3">
          <div className="h-1.5 w-10 rounded-full bg-muted-foreground/30" aria-hidden />
          <div className="flex w-full items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Users className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-bold leading-tight text-balance">{heading}</p>
              <p className="text-xs text-muted-foreground">
                {scope === "book" ? "Fellow readers in this book" : "Across the whole Bible, right now"}
              </p>
            </div>
            <button
              type="button"
              onClick={closeReaders}
              aria-label="Close"
              className="inline-flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>

        {/* List */}
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)]">
          {isLoading && readers.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
              <span className="text-sm">Gathering readers…</span>
            </div>
          ) : readers.length === 0 ? (
            <p className="px-3 py-16 text-center text-sm text-muted-foreground">
              You&apos;re the first one here. Others will appear as they open the Word.
            </p>
          ) : (
            <div className="flex flex-col gap-4 pb-2">
              {groups.map((group) => (
                <div key={group.book} className="flex flex-col gap-2">
                  {scope === "global" && (
                    <p className="px-3 pt-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {group.book}
                      <span className="ml-1.5 font-normal normal-case text-muted-foreground/70">
                        · {group.readers.length}
                      </span>
                    </p>
                  )}
                  {group.readers.map((r) => (
                    <ReaderCard
                      key={r.userId}
                      reader={r}
                      onProfile={() => openProfile(r.userId)}
                      onMessage={() => openChat({ userId: r.userId, name: r.name, image: r.image })}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

function ReaderCard({
  reader,
  onProfile,
  onMessage,
}: {
  reader: BibleReaderCard
  onProfile: () => void
  onMessage: () => void
}) {
  const [following, setFollowing] = useState(reader.isFollowing)
  const [pending, setPending] = useState(false)

  useEffect(() => setFollowing(reader.isFollowing), [reader.isFollowing])

  async function handleFollow() {
    if (reader.isSelf || pending) return
    const next = !following
    setFollowing(next)
    setPending(true)
    haptic(next ? "success" : "light")
    try {
      await toggleFollow({ targetUserId: reader.userId, follow: next })
    } catch {
      setFollowing(!next)
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="rounded-2xl border border-border/60 bg-background/60 p-3 shadow-sm transition-all hover:border-border hover:shadow-md">
      <div className="flex items-center gap-3">
        <button type="button" onClick={onProfile} className="relative shrink-0" aria-label={`View ${reader.name}'s profile`}>
          <Avatar className="size-12">
            {reader.image ? <AvatarImage src={reader.image} alt={reader.name} /> : null}
            <AvatarFallback className={cn("font-semibold", getAvatarColor(reader.userId))}>
              {getInitials(reader.name)}
            </AvatarFallback>
          </Avatar>
          {reader.online && (
            <span
              className="absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full border-2 border-card bg-chart-2"
              aria-hidden
            />
          )}
        </button>

        <button type="button" onClick={onProfile} className="min-w-0 flex-1 text-left">
          <div className="flex items-center gap-1.5">
            <p className="truncate font-semibold leading-tight">{reader.name}</p>
            {reader.isSelf && <span className="shrink-0 text-xs text-muted-foreground">(you)</span>}
          </div>
          <p className="truncate text-xs text-muted-foreground">{reader.handle}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="truncate text-xs text-primary">
              {activityLabel(reader.activity, reader.book, reader.chapter)}
            </span>
            {reader.streak > 0 && (
              <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
                <Flame className="size-3 text-chart-4" />
                {reader.streak}d
              </span>
            )}
          </div>
        </button>
      </div>

      {!reader.isSelf && (
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => void handleFollow()}
            disabled={pending}
            className={cn(
              "flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full text-sm font-semibold transition-all active:scale-95 disabled:opacity-60",
              following
                ? "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                : "bg-primary text-primary-foreground hover:bg-primary/90",
            )}
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : following ? (
              <>
                <UserCheck className="size-4" /> Following
              </>
            ) : (
              <>
                <UserPlus className="size-4" /> Follow
              </>
            )}
          </button>
          <button
            type="button"
            onClick={onMessage}
            className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full border border-border text-sm font-semibold transition-colors hover:bg-secondary active:scale-95"
          >
            <MessageCircle className="size-4" /> Message
          </button>
          <button
            type="button"
            onClick={onProfile}
            className="flex h-9 items-center justify-center rounded-full border border-border px-3 text-sm font-semibold transition-colors hover:bg-secondary active:scale-95"
          >
            Profile
          </button>
        </div>
      )}
    </div>
  )
}

// Small adapter so the sheet can read exactly what it needs from context and
// keep the component body focused.
function useReadersSheetCtx() {
  const ctx = useBibleFellowship()
  return {
    readersOpen: ctx.readersOpen,
    closeReaders: ctx.closeReaders,
    indicator: ctx.indicator,
    scopeBook: ctx.book,
    openProfile: ctx.openProfile,
    openChat: ctx.openChat,
  }
}
