"use client"

import { useEffect, useMemo, useState } from "react"
import Image from "next/image"
import { Check, ListPlus, Search, Sparkles } from "lucide-react"
import { toast } from "sonner"
import { createPlaylist, updatePlaylist, type PlaylistView } from "@/app/actions/materials"
import type { MaterialView } from "@/lib/materials"
import { UploadSheet, Field } from "./upload-primitives"
import { cn } from "@/lib/utils"

type Step = "choose" | "details"

/**
 * Create Playlist flow. Opens on a choice between an empty playlist and a Smart
 * Playlist (visually present but marked Coming Soon in V1). The details step
 * captures name + description, defaults the cover to an auto 2×2 collage, and
 * lets the admin search + select existing materials to seed the playlist —
 * references only, never duplicating a material.
 */
export function CreatePlaylistSheet({
  open,
  onOpenChange,
  organizationId,
  materials,
  onCreated,
  editing,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  organizationId: string
  materials: MaterialView[]
  onCreated: () => void
  /** When provided, the sheet edits this playlist's name/description instead of
   *  creating a new one (skips the choose step and the material picker). */
  editing?: PlaylistView | null
}) {
  const isEditing = Boolean(editing)
  const [step, setStep] = useState<Step>(isEditing ? "details" : "choose")
  const [name, setName] = useState(editing?.name ?? "")
  const [description, setDescription] = useState(editing?.description ?? "")
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [query, setQuery] = useState("")
  const [saving, setSaving] = useState(false)

  // Re-sync when the target playlist changes (the sheet instance is reused).
  useEffect(() => {
    if (open) {
      setStep(editing ? "details" : "choose")
      setName(editing?.name ?? "")
      setDescription(editing?.description ?? "")
      setSelected(new Set())
      setQuery("")
    }
  }, [open, editing])

  function reset() {
    setStep(isEditing ? "details" : "choose")
    setName("")
    setDescription("")
    setSelected(new Set())
    setQuery("")
    setSaving(false)
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset()
    onOpenChange(next)
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return materials
    return materials.filter(
      (m) => m.title.toLowerCase().includes(q) || (m.creator ?? "").toLowerCase().includes(q),
    )
  }, [materials, query])

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function submit() {
    if (!name.trim()) {
      toast.error("Please name the playlist.")
      return
    }
    setSaving(true)
    try {
      if (editing) {
        await updatePlaylist({ id: editing.id, organizationId, name, description, cover: editing.cover })
        toast.success("Playlist updated")
      } else {
        await createPlaylist({
          organizationId,
          name,
          description,
          materialIds: Array.from(selected),
        })
        toast.success("Playlist created")
      }
      onCreated()
      handleOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save playlist")
    } finally {
      setSaving(false)
    }
  }

  return (
    <UploadSheet
      open={open}
      onOpenChange={handleOpenChange}
      title={isEditing ? "Edit playlist" : step === "choose" ? "Create Playlist" : "New playlist"}
      description={
        isEditing
          ? "Update the name and description."
          : step === "choose"
            ? "Curate existing materials into a collection."
            : "Name it, then add materials from your catalogue."
      }
      footer={
        step === "details" ? (
          <>
            {!isEditing && (
              <button
                type="button"
                onClick={() => setStep("choose")}
                className="h-10 rounded-full px-4 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                Back
              </button>
            )}
            <button
              type="button"
              onClick={submit}
              disabled={saving || !name.trim()}
              className="inline-flex h-10 items-center gap-1.5 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
            >
              {isEditing ? "Save changes" : "Create Playlist"}
            </button>
          </>
        ) : undefined
      }
    >
      {step === "choose" ? (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setStep("details")}
            className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
              <ListPlus className="size-5" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold">Create Empty Playlist</span>
              <span className="block text-xs text-muted-foreground">Start from scratch and add materials.</span>
            </span>
          </button>

          <div className="relative flex w-full items-center gap-3 rounded-2xl border border-dashed border-border bg-secondary/30 p-4 text-left opacity-80">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-muted-foreground">
              <Sparkles className="size-5" />
            </span>
            <span className="min-w-0">
              <span className="flex items-center gap-2 text-sm font-semibold">
                Smart Playlist
                <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Coming soon
                </span>
              </span>
              <span className="block text-xs text-muted-foreground">Automatically add materials based on rules.</span>
            </span>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <Field label="Playlist name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Understanding the Holy Spirit"
              autoFocus
              className="h-11 w-full rounded-xl border border-border bg-secondary/40 px-3.5 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/50"
            />
          </Field>
          <Field label="Description" hint="Optional">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A short summary of this collection..."
              rows={2}
              className="w-full resize-none rounded-xl border border-border bg-secondary/40 px-3.5 py-2.5 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/50"
            />
          </Field>

          {!isEditing && (
            <Field label="Cover" hint="Auto 2×2 collage">
              <p className="rounded-xl border border-dashed border-border bg-secondary/30 px-3.5 py-2.5 text-xs text-muted-foreground">
                A cover is generated automatically from the first materials you add. Custom covers can be set later from
                Edit.
              </p>
            </Field>
          )}

          {!isEditing && (
            <Field label="Add Materials" hint={`${selected.size} selected`}>
            <div className="relative mb-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search materials..."
                className="h-10 w-full rounded-lg border border-border bg-secondary/40 pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/50"
              />
            </div>
            {materials.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
                No materials yet. Upload materials first, then curate them here.
              </p>
            ) : (
              <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-border p-1">
                {filtered.map((m) => {
                  const isOn = selected.has(m.id)
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => toggle(m.id)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors",
                        isOn ? "bg-primary/10" : "hover:bg-secondary",
                      )}
                    >
                      <div className="relative aspect-video w-16 shrink-0 overflow-hidden rounded-md bg-secondary">
                        {m.cover && (
                          <Image src={m.cover || "/placeholder.svg"} alt="" fill sizes="64px" className="object-cover" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{m.title}</p>
                        {m.creator && <p className="truncate text-xs text-muted-foreground">{m.creator}</p>}
                      </div>
                      <span
                        className={cn(
                          "grid size-5 shrink-0 place-items-center rounded-full border transition-colors",
                          isOn ? "border-primary bg-primary text-primary-foreground" : "border-border",
                        )}
                      >
                        {isOn && <Check className="size-3" />}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
            </Field>
          )}
        </div>
      )}
    </UploadSheet>
  )
}
