"use client"

import { useMemo, useState } from "react"
import useSWR from "swr"
import { Mic, NotebookPen, Pencil, Trash2, Video, X } from "lucide-react"
import {
  deleteLiveNote,
  getLiveNotes,
  updateLiveNote,
  type LiveNoteHostGroup,
  type GroupedLiveNote,
} from "@/app/actions/live-notes"
import { cn } from "@/lib/utils"

/**
 * Main-app "Live Notes" browser. Notes are grouped Host → Topic → Date. Tapping a
 * note opens it in a full editor overlay where the user can revise or delete it.
 * Data is seeded from the server and revalidated with SWR after mutations.
 */
export function LiveNotesBrowser({
  initialGroups,
  signedIn,
}: {
  initialGroups: LiveNoteHostGroup[]
  signedIn: boolean
}) {
  const { data: groups = initialGroups, mutate } = useSWR("live-notes", () => getLiveNotes(), {
    fallbackData: initialGroups,
    revalidateOnFocus: false,
  })

  const [openNote, setOpenNote] = useState<GroupedLiveNote | null>(null)

  if (!signedIn) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-center">
        <NotebookPen className="mx-auto mb-3 size-7 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Sign in to see the notes you take during lives.</p>
      </div>
    )
  }

  if (groups.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-center">
        <NotebookPen className="mx-auto mb-3 size-7 text-muted-foreground" />
        <p className="text-sm font-medium text-foreground">No live notes yet</p>
        <p className="mx-auto mt-1 max-w-xs text-sm leading-relaxed text-muted-foreground">
          Open the resource drawer inside any live and start writing — your notes save here automatically.
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="space-y-6">
        {groups.map((group) => (
          <HostGroup
            key={group.hostId ?? group.hostName}
            group={group}
            onOpen={(note) => setOpenNote(note)}
          />
        ))}
      </div>

      {openNote && (
        <NoteEditor
          note={openNote}
          onClose={() => setOpenNote(null)}
          onSaved={async () => {
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

function HostGroup({ group, onOpen }: { group: LiveNoteHostGroup; onOpen: (n: GroupedLiveNote) => void }) {
  return (
    <section>
      <h2 className="mb-2 px-1 font-display text-lg font-semibold tracking-tight text-foreground">
        {group.hostName}
      </h2>
      <ul className="space-y-2">
        {group.notes.map((note) => (
          <li key={note.id}>
            <button
              type="button"
              onClick={() => onOpen(note)}
              className="tap-scale flex w-full items-start gap-3 rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:bg-secondary/40"
            >
              <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-secondary/70 text-muted-foreground">
                {note.mode === "video" ? <Video className="size-4" /> : <Mic className="size-4" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-foreground">{note.topic}</span>
                <span className="mt-0.5 block text-xs font-medium text-muted-foreground">{formatDate(note.date)}</span>
                {note.preview && (
                  <span className="mt-1 block truncate text-sm text-muted-foreground">{note.preview}</span>
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

function NoteEditor({
  note,
  onClose,
  onSaved,
  onDeleted,
}: {
  note: GroupedLiveNote
  onClose: () => void
  onSaved: () => Promise<void>
  onDeleted: () => Promise<void>
}) {
  const { data: full } = useSWR(["live-note-full", note.id], async () => {
    // The grouped view only has a preview; refetch the group to hydrate the full
    // body for this note id.
    const groups = await getLiveNotes()
    for (const g of groups) {
      const match = g.notes.find((n) => n.id === note.id)
      if (match) return match
    }
    return note
  })

  const [body, setBody] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState(false)
  // Once the full note loads, seed the editable body (only if the user hasn't
  // started typing).
  const seededBody = body ?? full?.preview ?? note.preview

  async function save() {
    if (body == null) {
      onClose()
      return
    }
    setSaving(true)
    await updateLiveNote(note.id, body)
    setSaving(false)
    await onSaved()
    onClose()
  }

  async function remove() {
    setBusy(true)
    await deleteLiveNote(note.id)
    setBusy(false)
    await onDeleted()
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-6">
      <div className="flex max-h-[85dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-border bg-card shadow-2xl sm:rounded-3xl">
        <div className="flex items-start gap-3 border-b border-border p-4">
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-lg font-semibold text-foreground">{note.topic}</p>
            <p className="mt-0.5 text-xs font-medium text-muted-foreground">{formatDate(note.date)}</p>
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
            value={seededBody}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Your note…"
            className="min-h-[40dvh] w-full resize-none bg-transparent text-[15px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground"
          />
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border p-3">
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
            onClick={save}
            disabled={saving}
            className="tap-scale inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            <Pencil className="size-4" /> {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  )
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })
}
