"use client"

import Image from "next/image"
import { Reorder, useDragControls } from "motion/react"
import { GripVertical, ListMusic, MoreVertical, Play } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { PlaylistView } from "@/app/actions/materials"
import { formatMaterialDate } from "@/lib/materials"
import { cn } from "@/lib/utils"

/**
 * A 2×2 collage built from up to four material covers. Falls back gracefully:
 * with fewer than four covers the available tiles stretch to fill, and with
 * none we show a single tinted placeholder so the card never looks broken.
 */
export function PlaylistCollage({ covers, className }: { covers: string[]; className?: string }) {
  if (covers.length === 0) {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-xl border border-border bg-gradient-to-br from-primary/15 to-secondary text-muted-foreground",
          className,
        )}
      >
        <ListMusic className="size-8" />
      </div>
    )
  }
  // Fill to exactly four tiles by repeating from the start when short, so the
  // grid always reads as a balanced collage rather than a ragged row.
  const tiles = covers.length >= 4 ? covers.slice(0, 4) : Array.from({ length: 4 }, (_, i) => covers[i % covers.length])
  return (
    <div className={cn("grid grid-cols-2 grid-rows-2 gap-0.5 overflow-hidden rounded-xl border border-border", className)}>
      {tiles.map((src, i) => (
        <div key={i} className="relative overflow-hidden bg-secondary">
          <Image src={src || "/placeholder.svg"} alt="" fill sizes="120px" className="object-cover" />
        </div>
      ))}
    </div>
  )
}

/**
 * Playlist row for the discovery list. A horizontal media-row — square thumbnail
 * on the left, name + "N materials · duration · updated" in the middle, a round
 * Play affordance and (for admins) the ••• management menu on the right — so
 * playlists read like the rest of the Catalogue's stacked listings rather than a
 * separate grid of tiles. The whole left region is tappable to open.
 */
export function PlaylistCard({
  playlist: p,
  isAdmin = false,
  onOpen,
  onEdit,
  onShare,
  onDuplicate,
  onDelete,
}: {
  playlist: PlaylistView
  isAdmin?: boolean
  onOpen: () => void
  onEdit?: () => void
  onShare?: () => void
  onDuplicate?: () => void
  onDelete?: () => void
}) {
  const materialsLabel = `${p.count} ${p.count === 1 ? "material" : "materials"}${p.count > 0 ? ` · ${p.totalDurationLabel}` : ""}`
  const meta =
    p.childCount > 0
      ? `${p.childCount} ${p.childCount === 1 ? "playlist" : "playlists"} · ${materialsLabel}`
      : materialsLabel
  return (
    <div className="group relative flex items-center gap-3 py-3">
      {/* Thumbnail + primary text: one large tap target that opens the playlist. */}
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Open ${p.name}`}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        {p.cover ? (
          <div className="relative size-16 shrink-0 overflow-hidden rounded-xl border border-border bg-secondary">
            <Image src={p.cover || "/placeholder.svg"} alt="" fill sizes="64px" className="object-cover" />
          </div>
        ) : (
          <PlaylistCollage covers={p.collage} className="size-16 shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[15px] font-semibold leading-snug">{p.name}</h3>
          <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
            <ListMusic className="size-3.5 shrink-0" />
            <span className="truncate">{meta}</span>
          </p>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground/70">
            Updated {formatMaterialDate(p.updatedAtMs)}
          </p>
        </div>
      </button>

      {/* Round Play — opens the playlist to start playback, mirroring the live
          list rows. */}
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Play ${p.name}`}
        className="grid size-11 shrink-0 place-items-center rounded-full bg-secondary text-foreground transition-all hover:bg-primary hover:text-primary-foreground active:scale-95"
      >
        <Play className="size-5 translate-x-px fill-current" />
      </button>

      {isAdmin && (
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={`Manage ${p.name}`}
            className="grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <MoreVertical className="size-5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={onOpen}>Open</DropdownMenuItem>
            {onEdit && <DropdownMenuItem onClick={onEdit}>Edit</DropdownMenuItem>}
            {onShare && <DropdownMenuItem onClick={onShare}>Share</DropdownMenuItem>}
            {onDuplicate && <DropdownMenuItem onClick={onDuplicate}>Duplicate</DropdownMenuItem>}
            {onDelete && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={onDelete}>
                  Delete
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}

/**
 * A drag-to-reorder wrapper around {@link PlaylistCard}, matching the material
 * tracklist's reorder feel exactly (Framer Motion `<Reorder.Item>` so it works
 * on touch, grip-only drag via `dragControls` so the card body stays tappable,
 * animated layout as siblings shift). The grip carries `touch-none` so a drag
 * never scrolls the page on mobile, and the row gets an opaque background + its
 * own hairline divider so it doesn't turn transparent while lifted. Order is
 * committed once, on drag end, by the parent.
 */
export function ReorderablePlaylistRow({
  playlist: p,
  onOpen,
  onEdit,
  onShare,
  onDuplicate,
  onDelete,
  onDragStart,
  onCommit,
}: {
  playlist: PlaylistView
  onOpen: () => void
  onEdit?: () => void
  onShare?: () => void
  onDuplicate?: () => void
  onDelete?: () => void
  onDragStart: () => void
  onCommit: () => void
}) {
  const controls = useDragControls()
  return (
    <Reorder.Item
      value={p}
      dragListener={false}
      dragControls={controls}
      onDragStart={onDragStart}
      onDragEnd={onCommit}
      className="flex items-center gap-1 border-b border-border/60 bg-background last:border-b-0"
    >
      <button
        type="button"
        aria-label={`Drag to reorder ${p.name}`}
        onPointerDown={(e) => {
          e.preventDefault()
          controls.start(e)
        }}
        className="-mr-1 shrink-0 cursor-grab touch-none py-3 pl-1 text-muted-foreground/50 transition-colors hover:text-muted-foreground active:cursor-grabbing"
      >
        <GripVertical className="size-4" />
      </button>
      <div className="min-w-0 flex-1">
        <PlaylistCard
          playlist={p}
          isAdmin
          onOpen={onOpen}
          onEdit={onEdit}
          onShare={onShare}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
        />
      </div>
    </Reorder.Item>
  )
}
