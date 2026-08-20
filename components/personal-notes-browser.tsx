"use client"

import { useEffect, useRef, useState } from "react"
import useSWR from "swr"
import { Plus, Trash2, X } from "lucide-react"
import {
  createPersonalNote,
  deletePersonalNote,
  getPersonalNotes,
  updatePersonalNote,
  type PersonalNoteView,
} from "@/app/actions/personal-notes"

/**
 * Personal Notes — a plain, always-available notes app. Tapping New opens a
 * blank note; tapping a card opens the editor. Edits autosave on close. Data is
 * seeded from the server and revalidated with SWR after mutations.
 */
export function PersonalNotesBrowser({
  initialNotes,
  signedIn,
}: {
  initialNotes: PersonalNoteView[]
  signedIn: boolean
}) {
  const { data: notes = initialNotes, mutate } = useSWR("personal-notes", () => getPersonalNotes(), {
    fallbackData: initialNotes,
    revalidateOnFocus: false,
  })

  const [openNote, setOpenNote] = useState<PersonalNoteView | null>(null)
  const [creating, setCreating] = useState(false)

  if (!signedIn) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">Sign in to write and keep your notes.</p>
      </div>
    )
  }

  async function newNote() {
    if (creating) return
    setCreating(true)
    const res = await createPersonalNote()
    setCreating(false)
    if (res.ok && res.note) {
      await mutate()
      setOpenNote(res.note)
    }
  }

  return (
    <>
      {/* New-note action — a single, prominent control. */}
      <button
        type="button"
        onClick={newNote}
        disabled={creating}
        className="tap-scale mb-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-primary/30 bg-primary/10 py-3 text-sm font-semibold text-primary transition-colors hover:bg-primary/15 disabled:opacity-50"
      >
        <Plus className="size-4" /> New note
      </button>

      {notes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/60 bg-card/50 p-10 text-center">
          <p className="text-sm font-medium text-muted-foreground">Nothing here yet</p>
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-2.5">
          {notes.map((note) => (
            <li key={note.id}>
              <button
                type="button"
                onClick={() => setOpenNote(note)}
                className="tap-scale flex h-full min-h-[128px] w-full flex-col rounded-2xl border border-border/60 bg-card p-3.5 text-left transition-colors hover:border-primary/40 hover:bg-secondary/30"
              >
                <span className="line-clamp-1 text-sm font-semibold text-foreground">
                  {note.title.trim() || firstLine(note.body) || "Untitled"}
                </span>
                <span className="mt-1 line-clamp-4 flex-1 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                  {bodyPreview(note)}
                </span>
                <span className="mt-2 text-[11px] font-medium tabular-nums text-muted-foreground/70">
                  {formatDate(note.updatedAt)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {openNote && (
        <NoteEditor
          key={openNote.id}
          note={openNote}
          onClose={() => setOpenNote(null)}
          onChanged={async () => {
            await mutate()
          }}
          onDeleted={async () => {
            setOpenNote(null)
            await mutate()
          }}
        />
      )}
    </>
  )
}

function NoteEditor({
  note,
  onClose,
  onChanged,
  onDeleted,
}: {
  note: PersonalNoteView
  onClose: () => void
  onChanged: () => Promise<void>
  onDeleted: () => Promise<void>
}) {
  const [title, setTitle] = useState(note.title)
  const [body, setBody] = useState(note.body)
  const [busy, setBusy] = useState(false)
  const dirtyRef = useRef(false)
  const bodyRef = useRef<HTMLTextAreaElement>(null)

  // Focus the body of a fresh (empty) note so the user can start typing at once.
  useEffect(() => {
    if (!note.title && !note.body) bodyRef.current?.focus()
  }, [note.title, note.body])

  async function persistAndClose() {
    if (dirtyRef.current) {
      setBusy(true)
      await updatePersonalNote(note.id, { title, body })
      await onChanged()
    }
    onClose()
  }

  async function remove() {
    setBusy(true)
    await deletePersonalNote(note.id)
    await onDeleted()
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-6">
      <div className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-border/60 bg-card shadow-2xl sm:rounded-3xl">
        {/* Header: title input + close. Close persists. */}
        <div className="flex items-center gap-2 border-b border-border/60 p-3">
          <input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value)
              dirtyRef.current = true
            }}
            placeholder="Title"
            className="min-w-0 flex-1 bg-transparent px-1 font-display text-lg font-semibold text-foreground outline-none placeholder:text-muted-foreground/50"
          />
          <button
            type="button"
            onClick={persistAndClose}
            disabled={busy}
            aria-label="Done"
            className="tap-scale flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary/60 text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          <textarea
            ref={bodyRef}
            value={body}
            onChange={(e) => {
              setBody(e.target.value)
              dirtyRef.current = true
            }}
            className="min-h-[46dvh] w-full resize-none bg-transparent text-[15px] leading-relaxed text-foreground outline-none"
          />
        </div>

        {/* Footer: delete only — save is implicit on close. */}
        <div className="flex items-center justify-between border-t border-border/60 p-3">
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            className="tap-scale inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
          >
            <Trash2 className="size-4" /> Delete
          </button>
          <button
            type="button"
            onClick={persistAndClose}
            disabled={busy}
            className="tap-scale inline-flex items-center rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

function firstLine(body: string): string {
  return body.split("\n")[0]?.trim() ?? ""
}

function bodyPreview(note: PersonalNoteView): string {
  // If the title already shows the first line, preview the remainder.
  const trimmed = note.body.trim()
  if (!note.title.trim()) {
    const rest = trimmed.split("\n").slice(1).join("\n").trim()
    return rest || trimmed
  }
  return trimmed
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" })
}
