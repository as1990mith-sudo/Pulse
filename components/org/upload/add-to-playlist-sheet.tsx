"use client"

import { useState } from "react"
import { ListMusic, Loader2, Plus } from "lucide-react"
import { toast } from "sonner"
import type { MaterialView } from "@/lib/materials"
import { addMaterialsToPlaylist, createPlaylist, type PlaylistView } from "@/app/actions/materials"
import { PlaylistCollage } from "./playlist-card"
import { UploadSheet } from "./upload-primitives"

/**
 * Adds a single material to an existing playlist (or a brand-new one). Opens
 * when `material` is non-null; the parent clears it to close. References only —
 * the material itself is never copied.
 */
export function AddToPlaylistSheet({
  material,
  organizationId,
  playlists,
  onOpenChange,
  onDone,
}: {
  material: MaterialView | null
  organizationId: string
  playlists: PlaylistView[]
  onOpenChange: (open: boolean) => void
  onDone: () => void
}) {
  const [busyId, setBusyId] = useState<number | "new" | null>(null)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState("")

  async function addTo(playlistId: number) {
    if (!material) return
    setBusyId(playlistId)
    try {
      await addMaterialsToPlaylist({ organizationId, playlistId, materialIds: [material.id] })
      toast.success("Added to playlist")
      onDone()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add")
    } finally {
      setBusyId(null)
    }
  }

  async function createAndAdd() {
    if (!material || !newName.trim()) return
    setBusyId("new")
    try {
      await createPlaylist({ organizationId, name: newName, materialIds: [material.id] })
      toast.success("Playlist created")
      setNewName("")
      setCreating(false)
      onDone()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create")
    } finally {
      setBusyId(null)
    }
  }

  return (
    <UploadSheet
      open={material !== null}
      onOpenChange={(o) => {
        if (!o) {
          setCreating(false)
          setNewName("")
        }
        onOpenChange(o)
      }}
      title="Add to Playlist"
      description={material ? material.title : undefined}
    >
      <div className="space-y-3">
        {/* Create new */}
        {creating ? (
          <div className="flex items-center gap-2 rounded-xl border border-primary/40 bg-primary/5 p-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New playlist name"
              autoFocus
              className="h-9 flex-1 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary/50"
            />
            <button
              type="button"
              onClick={createAndAdd}
              disabled={!newName.trim() || busyId === "new"}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground transition-all hover:brightness-110 disabled:opacity-50"
            >
              {busyId === "new" ? <Loader2 className="size-4 animate-spin" /> : "Create"}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex w-full items-center gap-3 rounded-xl border border-dashed border-border p-3 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <Plus className="size-5" />
            </span>
            <span className="text-sm font-semibold">New playlist</span>
          </button>
        )}

        {/* Existing */}
        {playlists.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
            No playlists yet — create one above.
          </p>
        ) : (
          <ul className="space-y-1">
            {playlists.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => addTo(p.id)}
                  disabled={busyId === p.id}
                  className="flex w-full items-center gap-3 rounded-xl p-2 text-left transition-colors hover:bg-secondary disabled:opacity-60"
                >
                  {p.cover ? (
                    <span className="relative size-11 shrink-0 overflow-hidden rounded-lg border border-border bg-secondary">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.cover || "/placeholder.svg"} alt="" className="size-full object-cover" />
                    </span>
                  ) : (
                    <PlaylistCollage covers={p.collage} className="size-11 shrink-0" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{p.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {p.count} {p.count === 1 ? "material" : "materials"}
                    </span>
                  </span>
                  {busyId === p.id ? (
                    <Loader2 className="size-4 animate-spin text-muted-foreground" />
                  ) : (
                    <Plus className="size-4 text-muted-foreground" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </UploadSheet>
  )
}
