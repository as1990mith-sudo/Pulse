"use client"

import { useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { BookOpen, Check, ChevronRight, Copy, Eye, EyeOff, LogIn, NotebookPen, Pencil, Trash2, X } from "lucide-react"
import { BIBLE_BOOKS } from "@/lib/bible-books"
import { saveBibleNote, deleteBibleNote, type BibleNoteListItem } from "@/app/actions/bible-notes"
import { cn } from "@/lib/utils"

function refLabel(item: BibleNoteListItem) {
  const name = BIBLE_BOOKS[item.bookIndex]?.name ?? "Unknown"
  return `${name} ${item.chapter}:${item.verse}`
}

export function BibleNotesList({
  initialNotes,
  signedIn,
}: {
  initialNotes: BibleNoteListItem[]
  signedIn: boolean
}) {
  const [notes, setNotes] = useState<BibleNoteListItem[]>(initialNotes)
  // Books whose notes are hidden. Keyed by bookIndex so collapse state survives
  // note edits/deletes that re-derive the groups.
  const [collapsedBooks, setCollapsedBooks] = useState<Set<number>>(new Set())
  const [openId, setOpenId] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState("")
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [, startSave] = useTransition()

  // Group the (already Bible-ordered) notes under their book heading so the list
  // reads like a table of contents.
  const groups = useMemo(() => {
    const out: { bookIndex: number; name: string; items: BibleNoteListItem[] }[] = []
    for (const n of notes) {
      const last = out[out.length - 1]
      if (last && last.bookIndex === n.bookIndex) last.items.push(n)
      else out.push({ bookIndex: n.bookIndex, name: BIBLE_BOOKS[n.bookIndex]?.name ?? "Unknown", items: [n] })
    }
    return out
  }, [notes])

  function toggleBook(bookIndex: number) {
    setCollapsedBooks((prev) => {
      const next = new Set(prev)
      if (next.has(bookIndex)) next.delete(bookIndex)
      else next.add(bookIndex)
      return next
    })
  }

  function toggle(item: BibleNoteListItem) {
    if (openId === item.verseId) {
      setOpenId(null)
      setEditing(false)
      return
    }
    setOpenId(item.verseId)
    setEditing(false)
    setDraft(item.body)
  }

  function save(item: BibleNoteListItem) {
    const trimmed = draft.trim()
    if (!trimmed) {
      remove(item)
      return
    }
    setNotes((prev) =>
      prev.map((n) => (n.verseId === item.verseId ? { ...n, body: trimmed } : n)),
    )
    setEditing(false)
    startSave(async () => {
      try {
        await saveBibleNote(item.verseId, trimmed)
      } catch {
        // Best-effort; local state already reflects the change.
      }
    })
  }

  function remove(item: BibleNoteListItem) {
    setNotes((prev) => prev.filter((n) => n.verseId !== item.verseId))
    setOpenId(null)
    setEditing(false)
    startSave(async () => {
      try {
        await deleteBibleNote(item.verseId)
      } catch {
        // Best-effort.
      }
    })
  }

  async function copy(item: BibleNoteListItem) {
    try {
      await navigator.clipboard.writeText(`${refLabel(item)}\n\n${item.body}`)
      setCopiedId(item.verseId)
      setTimeout(() => setCopiedId((id) => (id === item.verseId ? null : id)), 1600)
    } catch {
      // Clipboard may be blocked.
    }
  }

  if (!signedIn) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-card px-6 py-12 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-secondary text-muted-foreground">
          <NotebookPen className="size-6" />
        </span>
        <div>
          <p className="font-semibold">Sign in to see your notes</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Your verse notes are saved to your account so you can read them anywhere.
          </p>
        </div>
        <Link
          href="/sign-in"
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-95"
        >
          <LogIn className="size-4" /> Sign in
        </Link>
      </div>
    )
  }

  if (notes.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-card px-6 py-12 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-secondary text-muted-foreground">
          <NotebookPen className="size-6" />
        </span>
        <div>
          <p className="font-semibold">No notes yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Tap a verse while reading and choose &ldquo;Add note&rdquo; to start.
          </p>
        </div>
        <Link
          href="/bible"
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-95"
        >
          <BookOpen className="size-4" /> Open the Bible
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {groups.map((group) => {
        const collapsed = collapsedBooks.has(group.bookIndex)
        return (
        <section key={group.bookIndex}>
          <button
            type="button"
            onClick={() => toggleBook(group.bookIndex)}
            className="mb-2 flex w-full items-center gap-2 px-1 text-left"
            aria-expanded={!collapsed}
            aria-label={collapsed ? `Show ${group.name} notes` : `Hide ${group.name} notes`}
          >
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.name}</h2>
            <span className="text-[11px] font-medium text-muted-foreground/70">{group.items.length}</span>
            {collapsed ? (
              <Eye className="ml-auto size-4 text-muted-foreground" />
            ) : (
              <EyeOff className="ml-auto size-4 text-muted-foreground" />
            )}
          </button>
          {!collapsed && (
          <ul className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border bg-card">
            {group.items.map((item) => {
              const open = openId === item.verseId
              return (
                <li key={item.verseId}>
                  <button
                    type="button"
                    onClick={() => toggle(item)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-secondary/50"
                    aria-expanded={open}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-primary">{refLabel(item)}</span>
                      {!open && (
                        <span className="mt-0.5 block truncate text-sm text-muted-foreground">
                          {item.body}
                        </span>
                      )}
                    </span>
                    <ChevronRight
                      className={cn(
                        "size-4 shrink-0 text-muted-foreground transition-transform",
                        open && "rotate-90",
                      )}
                    />
                  </button>

                  {open && (
                    <div className="px-4 pb-4">
                      {editing ? (
                        <div className="space-y-2">
                          <textarea
                            autoFocus
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            rows={5}
                            className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm leading-relaxed text-foreground outline-none ring-primary/40 transition-shadow placeholder:text-muted-foreground focus:ring-2"
                            placeholder="Write your note…"
                          />
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => save(item)}
                              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-95"
                            >
                              <Check className="size-4" /> Save
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setDraft(item.body)
                                setEditing(false)
                              }}
                              className="rounded-xl bg-secondary px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-secondary/80"
                            >
                              <X className="size-4" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <p className="whitespace-pre-wrap rounded-xl border border-border/60 bg-secondary/40 px-3 py-2.5 text-sm leading-relaxed text-foreground">
                            {item.body}
                          </p>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setDraft(item.body)
                                setEditing(true)
                              }}
                              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-secondary px-3 py-2 text-sm font-semibold transition-colors hover:bg-secondary/80"
                            >
                              <Pencil className="size-3.5" /> Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => void copy(item)}
                              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-secondary px-3 py-2 text-sm font-semibold transition-colors hover:bg-secondary/80"
                            >
                              {copiedId === item.verseId ? (
                                <Check className="size-3.5 text-primary" />
                              ) : (
                                <Copy className="size-3.5" />
                              )}
                              {copiedId === item.verseId ? "Copied" : "Copy"}
                            </button>
                            <button
                              type="button"
                              onClick={() => remove(item)}
                              className="flex items-center justify-center rounded-xl px-3 py-2 text-sm font-semibold text-destructive transition-colors hover:bg-destructive/10"
                              aria-label="Delete note"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
          )}
        </section>
        )
      })}
    </div>
  )
}
