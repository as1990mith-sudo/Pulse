"use client"

import Image from "next/image"
import { ListMusic, MoreVertical } from "lucide-react"
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
 * Playlist card for the discovery grid. Members tap anywhere to open; admins
 * additionally get the ••• management menu (open / edit / share / duplicate /
 * delete). Compact by design — the collage does the visual work.
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
  return (
    <div className="group relative flex flex-col gap-3 rounded-2xl border border-border bg-card p-3 transition-all duration-200 hover:border-primary/40">
      <button type="button" onClick={onOpen} aria-label={`Open ${p.name}`} className="block text-left">
        {p.cover ? (
          <div className="relative aspect-square w-full overflow-hidden rounded-xl border border-border bg-secondary">
            <Image src={p.cover || "/placeholder.svg"} alt="" fill sizes="240px" className="object-cover" />
          </div>
        ) : (
          <PlaylistCollage covers={p.collage} className="aspect-square w-full" />
        )}
      </button>

      <div className="min-w-0">
        <div className="flex items-start justify-between gap-2">
          <button type="button" onClick={onOpen} className="min-w-0 text-left">
            <h3 className="truncate text-sm font-semibold leading-snug">{p.name}</h3>
          </button>
          {isAdmin && (
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label={`Manage ${p.name}`}
                className="-mr-1 -mt-0.5 grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <MoreVertical className="size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onClick={onOpen}>Open</DropdownMenuItem>
                <DropdownMenuItem onClick={onEdit}>Edit</DropdownMenuItem>
                <DropdownMenuItem onClick={onShare}>Share</DropdownMenuItem>
                <DropdownMenuItem onClick={onDuplicate}>Duplicate</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={onDelete}>
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {p.count} {p.count === 1 ? "material" : "materials"}
          {p.count > 0 && ` · ${p.totalDurationLabel}`}
        </p>
        {p.description && <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{p.description}</p>}
        <p className="mt-1.5 text-[11px] text-muted-foreground/70">Updated {formatMaterialDate(p.updatedAtMs)}</p>
      </div>
    </div>
  )
}
