"use client"

import { useEffect, useRef, useState } from "react"
import useSWR from "swr"
import { Check, Loader2, Plus, Trash2 } from "lucide-react"
import { motion, AnimatePresence } from "motion/react"
import {
  createLiveNote,
  updateLiveNote,
  deleteLiveNote,
  getLiveNotesForSession,
  type LiveNoteView,
} from "@/app/actions/live-notes"
import { useLiveResources } from "@/components/live/resource/resource-context"
import { cn } from "@/lib/utils"

/**
 * Personal Live Notes panel. Notes are private to the signed-in user and are
 * auto-tagged with the current session's host/topic/date (via the descriptor
 * carried on the resource context) so they surface in the main-app Live Notes
 * section grouped Host → Topic → Date.
 *
 * Editing auto-saves on a debounce; there is no explicit save button so the
 * flow stays calm and the user can keep listening to the live.
 */
export function MiniNotesPanel() {
  const { descriptor } = useLiveResources()
  const roomName = descriptor?.roomName ?? null

  const { data, mutate, isLoading } = useSWR(
    roomName ? ["live-notes", roomName] : null,
    () => getLiveNotesForSession(roomName as string),
    { revalidateOnFocus: false },
  )
  const notes: LiveNoteView[] = data ?? []

  const [activeId, setActiveId] = useState<number | null>(null)
  const [draft, setDraft] = useState("")
  const [saving, setSaving] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  const active = notes.find((n) => n.id === activeId) ?? null

  // Load the active note's body into the editor when selection changes.
  useEffect(() => {
    setDraft(active?.body ?? "")
  }, [activeId]) // eslint-disable-line react-hooks/exhaustive-deps

  function scheduleSave(next: string) {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      if (activeId == null) return
      setSaving(true)
      await updateLiveNote(activeId, next)
      setSaving(false)
      void mutate()
    }, 700)
  }

  async function startNew() {
    if (!roomName) return
    const res = await createLiveNote({
      body: "",
      context: {
        roomName,
        streamId: descriptor?.streamId ?? null,
        hostId: descriptor?.hostId ?? null,
        hostName: descriptor?.hostName ?? null,
        topic: descriptor?.topic ?? null,
        sessionTitle: descriptor?.sessionTitle ?? null,
        mode: descriptor?.mode ?? null,
      },
    })
    if (res.ok && res.note) {
      await mutate()
      setActiveId(res.note.id)
      requestAnimationFrame(() => textareaRef.current?.focus())
    }
  }

  async function remove(id: number) {
    await deleteLiveNote(id)
    if (activeId === id) setActiveId(null)
    void mutate()
  }

  // Editing view --------------------------------------------------------------
  if (active) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
          <button
            onClick={() => setActiveId(null)}
            className="text-sm font-medium text-white/60 transition-colors hover:text-white"
          >
            Back
          </button>
          <span className="flex items-center gap-1.5 text-xs text-white/40">
            {saving ? (
              <>
                <Loader2 className="size-3 animate-spin" /> Saving
              </>
            ) : (
              <>
                <Check className="size-3 text-emerald-400" /> Saved
              </>
            )}
          </span>
        </div>
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value)
            scheduleSave(e.target.value)
          }}
          placeholder="Capture the teaching, a key point, a verse…"
          className="min-h-0 flex-1 resize-none bg-transparent px-4 py-3 text-[15px] leading-relaxed text-white outline-none placeholder:text-white/30"
        />
      </div>
    )
  }

  // List view ------------------------------------------------------------------
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 pb-2 pt-3">
        <p className="text-xs text-white/40">Private to you</p>
        <button
          onClick={startNew}
          className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-black transition-transform active:scale-95"
        >
          <Plus className="size-3.5" strokeWidth={2.5} /> New note
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {isLoading ? (
          <div className="flex h-24 items-center justify-center">
            <Loader2 className="size-5 animate-spin text-white/40" />
          </div>
        ) : notes.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
            <p className="text-sm text-white/50">No notes yet.</p>
            <p className="max-w-[220px] text-pretty text-xs text-white/30">
              Start a note to capture what you&apos;re learning. It saves to your Live Notes automatically.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            <AnimatePresence initial={false}>
              {notes.map((n) => (
                <motion.li
                  key={n.id}
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                >
                  <div className="group flex items-start gap-2 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                    <button onClick={() => setActiveId(n.id)} className="min-w-0 flex-1 text-left">
                      <p className={cn("truncate text-sm font-medium", n.body ? "text-white" : "text-white/40")}>
                        {n.body ? firstLine(n.body) : "Empty note"}
                      </p>
                      <p className="mt-0.5 text-[11px] text-white/35">{formatWhen(n.updatedAt)}</p>
                    </button>
                    <button
                      onClick={() => remove(n.id)}
                      aria-label="Delete note"
                      className="rounded-full p-1.5 text-white/30 transition-colors hover:bg-white/10 hover:text-red-400"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>
    </div>
  )
}

function firstLine(body: string) {
  const line = body.split("\n").find((l) => l.trim().length > 0) ?? body
  return line.trim().slice(0, 80)
}

function formatWhen(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " · " +
    d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
}
