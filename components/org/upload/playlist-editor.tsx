"use client"

import { useRef, useState } from "react"
import Image from "next/image"
import { Reorder, useDragControls } from "motion/react"
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
  const [addOpen, setAddOpen] = useState(false)

  // Reordering is driven by Framer Motion's <Reorder>, which works with touch
  // (the old HTML5 `draggable` never fired on mobile). `onReorder` updates the
  // list live as the user drags; we only hit the server once, when the drag
  // ends. A live ref holds the latest order for that commit, and a snapshot
  // taken at drag-start lets us both skip no-op saves and revert on failure.
  const itemsRef = useRef(items)
  itemsRef.current = items
  const orderAtDragStart = useRef<MaterialView[]>(items)

  function handleDragStart() {
    orderAtDragStart.current = itemsRef.current
  }

  async function commitOrder() {
    const next = itemsRef.current
    const prev = orderAtDragStart.current
    const unchanged = next.map((m) => m.id).join() === prev.map((m) => m.id).join()
    if (unchanged) return
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
          {isAdmin ? (
            // Admins get a touch-friendly reorderable list. Each row carries its
            // own hairline divider (rather than the group's divide-y) and an
            // opaque background so it doesn't turn transparent while lifted.
            <Reorder.Group axis="y" values={items} onReorder={setItems} as="ul">
              {items.map((m) => (
                <ReorderRow
                  key={m.id}
                  m={m}
                  onOpenMaterial={onOpenMaterial}
                  onRemove={remove}
                  onDragStart={handleDragStart}
                  onCommit={commitOrder}
                />
              ))}
            </Reorder.Group>
          ) : (
            <ul className="divide-y divide-border/60">
              {items.map((m) => (
                <li key={m.id} className="group flex items-center gap-3 py-3 pr-1">
                  <RowBody m={m} isAdmin={false} onOpenMaterial={onOpenMaterial} onRemove={remove} />
                </li>
              ))}
            </ul>
          )}
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

/**
 * The shared visual body of a material row (thumbnail, title/meta, and the
 * trailing kebab-or-play control) — everything except the wrapper element and
 * the admin-only drag handle. Reused by both the reorderable admin list and the
 * read-only member list so the two never drift.
 */
function RowBody({
  m,
  isAdmin,
  onOpenMaterial,
  onRemove,
}: {
  m: MaterialView
  isAdmin: boolean
  onOpenMaterial: (m: MaterialView) => void
  onRemove: (id: number) => void
}) {
  return (
    <>
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
            <DropdownMenuItem variant="destructive" onClick={() => onRemove(m.id)}>
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
    </>
  )
}

/**
 * A single reorderable material row. The grip is the ONLY drag trigger
 * (`dragListener={false}` + `controls.start`), so the thumbnail and title stay
 * tappable, and `touch-none` on the grip stops the page from scrolling mid-drag
 * on mobile. The order is persisted once, on drag end, by the parent.
 */
function ReorderRow({
  m,
  onOpenMaterial,
  onRemove,
  onDragStart,
  onCommit,
}: {
  m: MaterialView
  onOpenMaterial: (m: MaterialView) => void
  onRemove: (id: number) => void
  onDragStart: () => void
  onCommit: () => void
}) {
  const controls = useDragControls()
  return (
    <Reorder.Item
      value={m}
      dragListener={false}
      dragControls={controls}
      onDragStart={onDragStart}
      onDragEnd={onCommit}
      className="group flex items-center gap-3 border-b border-border/60 bg-background py-3 pr-1 last:border-b-0"
    >
      <button
        type="button"
        aria-label={`Drag to reorder ${m.title}`}
        onPointerDown={(e) => {
          e.preventDefault()
          controls.start(e)
        }}
        className="shrink-0 cursor-grab touch-none text-muted-foreground/50 transition-colors hover:text-muted-foreground active:cursor-grabbing"
      >
        <GripVertical className="size-4" />
      </button>
      <RowBody m={m} isAdmin onOpenMaterial={onOpenMaterial} onRemove={onRemove} />
    </Reorder.Item>
  )
}
