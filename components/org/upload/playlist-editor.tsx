"use client"

import { useState } from "react"
import Image from "next/image"
import { ArrowLeft, GripVertical, ListPlus, MoreVertical, Play, Share2, SquarePen } from "lucide-react"
import { toast } from "sonner"
import type { MaterialView } from "@/lib/materials"
import type { PlaylistDetail } from "@/app/actions/materials"
import {
  removeMaterialFromPlaylist,
  reorderPlaylist,
  addMaterialsToPlaylist,
} from "@/app/actions/materials"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SourceBadge, PlayGlyph, Collage } from "./upload-primitives"
import { AddMaterialsSheet } from "./add-materials-sheet"
import { cn } from "@/lib/utils"

/**
 * Playlist editor / viewer. Members see an ordered, read-only tracklist they
 * can open; admins get drag-to-reorder, remove, and an Add Materials sheet.
 * Reordering is optimistic — the new order renders immediately and persists in
 * the background, reverting on failure.
 */
export function PlaylistEditor({
  detail,
  isAdmin,
  organizationId,
  allMaterials,
  onBack,
  onOpenMaterial,
  onEdit,
  onShare,
  onChanged,
}: {
  detail: PlaylistDetail
  isAdmin: boolean
  organizationId: string
  allMaterials: MaterialView[]
  onBack: () => void
  onOpenMaterial: (m: MaterialView) => void
  onEdit: () => void
  onShare: () => void
  onChanged: () => void
}) {
  const { playlist: p } = detail
  const [items, setItems] = useState<MaterialView[]>(detail.materials)
  const [dragId, setDragId] = useState<number | null>(null)
  const [addOpen, setAddOpen] = useState(false)

  async function persistOrder(next: MaterialView[]) {
    const prev = items
    setItems(next)
    try {
      await reorderPlaylist({
        organizationId,
        playlistId: p.id,
        orderedMaterialIds: next.map((m) => m.id),
      })
      onChanged()
    } catch {
      setItems(prev)
      toast.error("Could not save the new order")
    }
  }

  function handleDrop(targetId: number) {
    if (dragId === null || dragId === targetId) return
    const from = items.findIndex((m) => m.id === dragId)
    const to = items.findIndex((m) => m.id === targetId)
    if (from === -1 || to === -1) return
    const next = [...items]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    setDragId(null)
    void persistOrder(next)
  }

  async function remove(materialId: number) {
    const prev = items
    setItems((cur) => cur.filter((m) => m.id !== materialId))
    try {
      await removeMaterialFromPlaylist({ organizationId, playlistId: p.id, materialId })
      onChanged()
    } catch {
      setItems(prev)
      toast.error("Could not remove material")
    }
  }

  async function addMaterials(ids: number[]) {
    if (ids.length === 0) return
    try {
      await addMaterialsToPlaylist({ organizationId, playlistId: p.id, materialIds: ids })
      toast.success(`Added ${ids.length} ${ids.length === 1 ? "material" : "materials"}`)
      onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add materials")
    }
  }

  const covers = items.map((m) => m.cover).filter((c): c is string => Boolean(c))

  return (
    <div className="space-y-5">
      {/* Back to the Upload grid */}
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Upload
      </button>

      {/* Playlist header */}
      <div className="flex gap-4">
        {p.cover ? (
          <div className="relative aspect-square w-28 shrink-0 overflow-hidden rounded-2xl border border-border bg-secondary sm:w-36">
            <Image src={p.cover || "/placeholder.svg"} alt="" fill sizes="144px" className="object-cover" />
          </div>
        ) : (
          <Collage covers={covers} className="aspect-square w-28 shrink-0 sm:w-36" />
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <h1 className="font-display text-xl font-semibold leading-tight tracking-tight text-balance sm:text-2xl">
            {p.name}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {items.length} {items.length === 1 ? "material" : "materials"}
            {items.length > 0 && ` · ${p.totalDurationLabel}`}
          </p>
          {p.description && (
            <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted-foreground">{p.description}</p>
          )}

          <div className="mt-auto flex flex-wrap items-center gap-2 pt-3">
            <button
              type="button"
              onClick={onShare}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border px-3.5 text-sm font-medium transition-colors hover:bg-secondary"
            >
              <Share2 className="size-4" />
              Share
            </button>
            {isAdmin && (
              <>
                <button
                  type="button"
                  onClick={onEdit}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border px-3.5 text-sm font-medium transition-colors hover:bg-secondary"
                >
                  <SquarePen className="size-4" />
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => setAddOpen(true)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-3.5 text-sm font-semibold text-primary-foreground transition-all hover:brightness-110 active:scale-[0.98]"
                >
                  <ListPlus className="size-4" />
                  Add Materials
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Track list */}
      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border px-6 py-12 text-center">
          <p className="text-sm text-muted-foreground">This playlist is empty.</p>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground transition-all hover:brightness-110"
            >
              <ListPlus className="size-4" />
              Add Materials
            </button>
          )}
        </div>
      ) : (
        <div>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Materials</h2>
          <ul className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border">
            {items.map((m, i) => (
              <li
                key={m.id}
                draggable={isAdmin}
                onDragStart={() => setDragId(m.id)}
                onDragOver={(e) => {
                  if (isAdmin) e.preventDefault()
                }}
                onDrop={() => handleDrop(m.id)}
                onDragEnd={() => setDragId(null)}
                className={cn(
                  "group flex items-center gap-3 bg-card p-2.5 transition-colors",
                  dragId === m.id && "opacity-50",
                  isAdmin && "cursor-grab active:cursor-grabbing",
                )}
              >
                {isAdmin && (
                  <GripVertical className="size-4 shrink-0 text-muted-foreground/50 transition-colors group-hover:text-muted-foreground" />
                )}
                <span className="w-6 shrink-0 text-center text-xs font-semibold tabular-nums text-muted-foreground">
                  {String(i + 1).padStart(2, "0")}
                </span>

                <button
                  type="button"
                  onClick={() => onOpenMaterial(m)}
                  className="relative aspect-video w-20 shrink-0 overflow-hidden rounded-lg border border-border/60 bg-secondary"
                  aria-label={`Open ${m.title}`}
                >
                  {m.cover && <Image src={m.cover || "/placeholder.svg"} alt="" fill sizes="80px" className="object-cover" />}
                  <span className="absolute inset-0 grid place-items-center bg-black/25 opacity-0 transition-opacity group-hover:opacity-100">
                    <PlayGlyph className="size-7" />
                  </span>
                </button>

                <button type="button" onClick={() => onOpenMaterial(m)} className="min-w-0 flex-1 text-left">
                  <p className="truncate text-sm font-medium">{m.title}</p>
                  <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    {m.creator && <span className="truncate">{m.creator}</span>}
                    {m.creator && <span aria-hidden>·</span>}
                    <SourceBadge source={m.source} contentType={m.contentType} />
                    {m.duration && (
                      <>
                        <span aria-hidden>·</span>
                        <span className="tabular-nums">{m.duration}</span>
                      </>
                    )}
                  </div>
                </button>

                {isAdmin ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      aria-label={`Manage ${m.title}`}
                      className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                    >
                      <MoreVertical className="size-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuItem onClick={() => onOpenMaterial(m)}>Open</DropdownMenuItem>
                      <DropdownMenuItem variant="destructive" onClick={() => remove(m.id)}>
                        Remove from playlist
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  <button
                    type="button"
                    onClick={() => onOpenMaterial(m)}
                    aria-label={`Open ${m.title}`}
                    className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  >
                    <Play className="size-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {isAdmin && (
        <AddMaterialsSheet
          open={addOpen}
          onOpenChange={setAddOpen}
          materials={allMaterials.filter((m) => !items.some((it) => it.id === m.id))}
          onAdd={addMaterials}
        />
      )}
    </div>
  )
}
