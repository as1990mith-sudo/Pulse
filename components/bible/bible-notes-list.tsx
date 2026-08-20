"use client"

import { useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { BookOpen, ChevronRight, Eye, EyeOff, LogIn, NotebookPen, Pencil, Trash2, X } from "lucide-react"
import { BIBLE_BOOKS } from "@/lib/bible-books"
import { saveBibleNote, deleteBibleNote, type BibleNoteListItem } from "@/app/actions/bible-notes"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { cn } from "@/lib/utils"

function refLabel(item: BibleNoteListItem) {
  const name = BIBLE_BOOKS[item.bookIndex]?.name ?? "Unknown"
  return `${name} ${item.chapter}:${item.verse}`
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })
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
  const [openNote, setOpenNote] = useState<BibleNoteListItem | null>(null)

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

  function handleSaved(verseId: string, body: string) {
    setNotes((prev) => prev.map((n) => (n.verseId === verseId ? { ...n, body } : n)))
  }

  function handleDeleted(verseId: string) {
    setNotes((prev) => prev.filter((n) => n.verseId !== verseId))
    setOpenNote(null)
  }

  if (!signedIn) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-card px-6 py-12 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-secondary text-muted-foreground">
          <NotebookPen className="size-6" />
        </span>
        <p className="font-semibold">Sign in to see your notes</p>
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
        <p className="font-semibold">No notes yet</p>
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
                {group.items.map((item) => (
                  <li key={item.verseId}>
                    <button
                      type="button"
                      onClick={() => setOpenNote(item)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-secondary/50"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-primary">{refLabel(item)}</span>
                        <span className="mt-0.5 block truncate text-sm text-muted-foreground">{item.body}</span>
                      </span>
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )
      })}

      {openNote && (
        <BibleNoteReader
          key={openNote.verseId}
          note={openNote}
          onClose={() => setOpenNote(null)}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  )
}

/**
 * Full-note reader/editor — mirrors the Live Notes reading sheet exactly: a
 * bottom-anchored (desktop-centered) card with a topic + date header, an
 * editable body, and a footer with Delete (left) and Save (right). Closing via
 * the header X persists like Save. Deleting asks for confirmation first.
 */
function BibleNoteReader({
  note,
  onClose,
  onSaved,
  onDeleted,
}: {
  note: BibleNoteListItem
  onClose: () => void
  onSaved: (verseId: string, body: string) => void
  onDeleted: (verseId: string) => void
}) {
  const [body, setBody] = useState(note.body)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [pending, startTransition] = useTransition()

  function save() {
    const trimmed = body.trim()
    // An emptied note is treated as a delete request (with confirmation).
    if (!trimmed) {
      setConfirmOpen(true)
      return
    }
    if (trimmed !== note.body) {
      onSaved(note.verseId, trimmed)
      startTransition(async () => {
        try {
          await saveBibleNote(note.verseId, trimmed)
        } catch {
          // Best-effort; local state already reflects the change.
        }
      })
    }
    onClose()
  }

  function remove() {
    setConfirmOpen(false)
    setBusy(true)
    onDeleted(note.verseId)
    startTransition(async () => {
      try {
        await deleteBibleNote(note.verseId)
      } catch {
        // Best-effort.
      }
    })
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-6">
      <div className="flex max-h-[85dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-border/60 bg-card shadow-2xl sm:rounded-3xl">
        <div className="flex items-start gap-3 border-b border-border/60 p-4">
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-base font-semibold text-primary">{refLabel(note)}</p>
            <p className="mt-0.5 text-[11px] font-medium text-muted-foreground">{formatDate(note.updatedAt)}</p>
          </div>
          <button
            type="button"
            onClick={save}
            aria-label="Close note"
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary/60 text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write your note…"
            className="min-h-[40dvh] w-full resize-none bg-transparent text-[15px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/50"
          />
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border/60 p-3">
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={busy}
            className="tap-scale inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
          >
            <Trash2 className="size-4" /> Delete
          </button>
          <button
            type="button"
            onClick={save}
            disabled={pending || busy}
            className="tap-scale inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            <Pencil className="size-4" /> {pending ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {confirmOpen && (
        <ConfirmDialog
          title="Delete this note?"
          message={`Your note on ${refLabel(note)} will be permanently removed.`}
          confirmLabel="Delete"
          busy={busy}
          onConfirm={remove}
          onCancel={() => setConfirmOpen(false)}
        />
      )}
    </div>
  )
}
