"use client"

import { useMemo, useState } from "react"
import useSWR from "swr"
import { ChevronDown, Mic, Pencil, Search, Trash2, Video, X } from "lucide-react"
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
  const [query, setQuery] = useState("")

  // Filter across host, topic and preview; keep only groups with matches and
  // narrow each group's notes to the matching ones.
  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return groups
    return groups
      .map((g) => {
        const hostMatch = g.hostName.toLowerCase().includes(q)
        const notes = hostMatch
          ? g.notes
          : g.notes.filter((n) => `${n.topic} ${n.preview ?? ""}`.toLowerCase().includes(q))
        return { ...g, notes }
      })
      .filter((g) => g.notes.length > 0)
  }, [groups, query])

  if (!signedIn) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">Sign in to see your live notes.</p>
      </div>
    )
  }

  if (groups.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border/60 bg-card/50 p-10 text-center">
        <p className="text-sm font-medium text-muted-foreground">No live notes yet</p>
      </div>
    )
  }

  return (
    <>
      {/* Search across all captured live notes. */}
      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search live notes"
          aria-label="Search live notes"
          className="w-full rounded-full border border-border/60 bg-secondary/40 py-2.5 pl-9 pr-3 text-sm text-foreground outline-none ring-primary/40 transition-shadow placeholder:text-muted-foreground focus:ring-2"
        />
      </div>

      {filteredGroups.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/60 bg-card/50 p-10 text-center">
          <p className="text-sm font-medium text-muted-foreground">No live notes match &ldquo;{query.trim()}&rdquo;</p>
        </div>
      ) : (
        <div className="space-y-5">
          {filteredGroups.map((group) => (
            <HostGroup
              key={group.hostId ?? group.hostName}
              group={group}
              onOpen={(note) => setOpenNote(note)}
            />
          ))}
        </div>
      )}

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
  const [open, setOpen] = useState(true)
  return (
    <section>
      <h2 className="mb-2 px-1">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="tap-scale flex w-full items-center justify-between gap-3 rounded-xl py-1 text-left transition-colors"
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate font-display text-[15px] font-semibold tracking-tight text-foreground">
              {group.hostName}
            </span>
            <span className="flex min-w-5 shrink-0 items-center justify-center rounded-full bg-secondary/70 px-1.5 text-[11px] font-semibold text-muted-foreground">
              {group.notes.length}
            </span>
          </span>
          <ChevronDown
            className={cn("size-4 shrink-0 text-muted-foreground transition-transform duration-300", open ? "rotate-180" : "rotate-0")}
          />
        </button>
      </h2>
      <ul className={cn("space-y-1.5", !open && "hidden")}>
        {group.notes.map((note) => (
          <li key={note.id}>
            <button
              type="button"
              onClick={() => onOpen(note)}
              className="tap-scale flex w-full items-start gap-3 rounded-xl border border-border/60 bg-card p-3 text-left transition-colors hover:border-primary/40 hover:bg-secondary/30"
            >
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary/70 text-muted-foreground">
                {note.mode === "video" ? <Video className="size-3.5" /> : <Mic className="size-3.5" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-semibold text-foreground">{note.topic}</span>
                  <span className="shrink-0 text-[11px] font-medium tabular-nums text-muted-foreground/70">
                    {formatDate(note.date)}
                  </span>
                </span>
                {note.preview && (
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">{note.preview}</span>
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
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-6">
      <div className="flex max-h-[85dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-border/60 bg-card shadow-2xl sm:rounded-3xl">
        <div className="flex items-start gap-3 border-b border-border/60 p-4">
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-base font-semibold text-foreground">{note.topic}</p>
            <p className="mt-0.5 text-[11px] font-medium text-muted-foreground">{formatDate(note.date)}</p>
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
            className="min-h-[40dvh] w-full resize-none bg-transparent text-[15px] leading-relaxed text-foreground outline-none"
          />
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border/60 p-3">
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
