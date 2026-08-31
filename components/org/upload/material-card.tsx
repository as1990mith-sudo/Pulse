"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  Archive,
  ArchiveRestore,
  Copy,
  ListPlus,
  Loader2,
  MoreVertical,
  Pencil,
  Trash2,
} from "lucide-react"
import { type MaterialView, formatMaterialDate } from "@/lib/materials"
import { deleteMaterial, duplicateMaterial, setMaterialArchived } from "@/app/actions/materials"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { PlayGlyph, SourceBadge, Thumbnail } from "./upload-primitives"

export function MaterialCard({
  material,
  isOwner,
  onOpen,
  onEdit,
  onAddToPlaylist,
  className,
}: {
  material: MaterialView
  isOwner: boolean
  onOpen: (m: MaterialView) => void
  onEdit?: (m: MaterialView) => void
  onAddToPlaylist?: (m: MaterialView) => void
  className?: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [confirming, setConfirming] = useState(false)

  function run(action: () => Promise<unknown>) {
    startTransition(async () => {
      try {
        await action()
        router.refresh()
      } catch (err) {
        console.error("[v0] material action failed:", err)
      }
    })
  }

  return (
    <div
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-2xl border border-border/60 bg-card/40 transition-colors hover:border-border",
        material.archived && "opacity-60",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => onOpen(material)}
        className="relative block aspect-video w-full overflow-hidden text-left"
        aria-label={`Open ${material.title}`}
      >
        <Thumbnail
          cover={material.cover}
          title={material.title}
          contentType={material.contentType}
          rounded="rounded-none"
          className="absolute inset-0 size-full"
        />
        {/* Play affordance on hover */}
        <span className="absolute inset-0 flex items-center justify-center bg-background/0 transition-colors group-hover:bg-background/30">
          <span className="flex size-11 scale-90 items-center justify-center rounded-full bg-primary text-primary-foreground opacity-0 shadow-lg transition-all duration-200 group-hover:scale-100 group-hover:opacity-100">
            <PlayGlyph className="size-5" />
          </span>
        </span>
        {material.duration && (
          <span className="absolute bottom-2 right-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-white">
            {material.duration}
          </span>
        )}
        <SourceBadge source={material.source} contentType={material.contentType} className="absolute left-2 top-2" />
        {material.archived && (
          <span className="absolute right-2 top-2 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Archived
          </span>
        )}
      </button>

      <div className="flex items-start gap-2 p-3">
        <button type="button" onClick={() => onOpen(material)} className="min-w-0 flex-1 text-left">
          <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-foreground text-balance">
            {material.title}
          </h3>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {material.creator ? material.creator : material.category || "Resource"}
            {material.resourceDateMs ? ` · ${formatMaterialDate(material.resourceDateMs)}` : ""}
          </p>
        </button>

        {isOwner && (
          <DropdownMenu onOpenChange={(o) => !o && setConfirming(false)}>
            <DropdownMenuTrigger
              aria-label={`More options for ${material.title}`}
              className="-mr-1 -mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground data-[state=open]:bg-secondary"
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : <MoreVertical className="size-4" />}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {onEdit && (
                <DropdownMenuItem onClick={() => onEdit(material)}>
                  <Pencil className="size-4" /> Edit details
                </DropdownMenuItem>
              )}
              {onAddToPlaylist && (
                <DropdownMenuItem onClick={() => onAddToPlaylist(material)}>
                  <ListPlus className="size-4" /> Add to playlist
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={() => run(() => duplicateMaterial({ id: material.id, organizationId: material.organizationId }))}
              >
                <Copy className="size-4" /> Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  run(() =>
                    setMaterialArchived({
                      id: material.id,
                      organizationId: material.organizationId,
                      archived: !material.archived,
                    }),
                  )
                }
              >
                {material.archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
                {material.archived ? "Restore" : "Archive"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {confirming ? (
                <DropdownMenuItem
                  variant="destructive"
                  closeOnClick={false}
                  onClick={() => run(() => deleteMaterial({ id: material.id, organizationId: material.organizationId }))}
                >
                  <Trash2 className="size-4" /> Confirm delete
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem variant="destructive" closeOnClick={false} onClick={() => setConfirming(true)}>
                  <Trash2 className="size-4" /> Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  )
}
