"use client"

import type React from "react"
import {
  BookOpen,
  FileText,
  Headphones,
  LinkIcon,
  Mic,
  Play,
  Radio,
  Video,
} from "lucide-react"
import {
  type MaterialContentType,
  type MaterialSource,
  CONTENT_TYPE_LABELS,
  SOURCE_LABELS,
} from "@/lib/materials"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

// A small accent dot keyed by hosting platform — no per-brand logo assets, so
// nothing can 404. The colour is a stable hash into a small themed palette.
const SOURCE_DOT: Record<MaterialSource, string> = {
  youtube: "bg-red-500",
  spotify: "bg-emerald-500",
  vimeo: "bg-sky-500",
  facebook: "bg-blue-500",
  drive: "bg-amber-500",
  meet: "bg-green-500",
  other: "bg-muted-foreground",
}

const CONTENT_ICON: Record<MaterialContentType, React.ComponentType<{ className?: string }>> = {
  video: Video,
  audio: Headphones,
  article: FileText,
  sermon: Mic,
  podcast: Radio,
  resource: BookOpen,
}

export function ContentTypeIcon({ type, className }: { type: MaterialContentType; className?: string }) {
  const Icon = CONTENT_ICON[type] ?? LinkIcon
  return <Icon className={className} />
}

/** "Sermon · YouTube" chip line used across cards and the detail sheet. */
export function SourceBadge({
  source,
  contentType,
  className,
}: {
  source: MaterialSource
  contentType: MaterialContentType
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full bg-background/70 px-2 py-0.5 text-[11px] font-medium text-muted-foreground backdrop-blur",
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", SOURCE_DOT[source])} aria-hidden />
      <span className="text-foreground/90">{CONTENT_TYPE_LABELS[contentType]}</span>
      <span aria-hidden className="text-muted-foreground/50">
        ·
      </span>
      <span>{SOURCE_LABELS[source]}</span>
    </span>
  )
}

/**
 * A material thumbnail with a graceful fallback: when the resource has no cover
 * we render a themed gradient tile with the content-type glyph, so the grid
 * never shows a broken image or an empty box.
 */
export function Thumbnail({
  cover,
  title,
  contentType,
  className,
  rounded = "rounded-xl",
}: {
  cover: string | null
  title: string
  contentType: MaterialContentType
  className?: string
  rounded?: string
}) {
  return (
    <div className={cn("relative overflow-hidden bg-secondary", rounded, className)}>
      {cover ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={cover || "/placeholder.svg"}
          alt=""
          loading="lazy"
          className="size-full object-cover"
          onError={(e) => {
            // Hide a dead thumbnail so the gradient fallback shows through.
            ;(e.currentTarget as HTMLImageElement).style.display = "none"
          }}
        />
      ) : null}
      {!cover && (
        <div className="flex size-full items-center justify-center bg-gradient-to-br from-primary/15 via-secondary to-secondary">
          <ContentTypeIcon type={contentType} className="size-1/4 max-h-8 max-w-8 text-primary/50" />
        </div>
      )}
    </div>
  )
}

/**
 * A 2×2 cover collage for playlists without a custom cover. Fills missing tiles
 * with themed placeholders so the shape is always a clean square grid.
 */
export function Collage({ covers, className }: { covers: string[]; className?: string }) {
  const tiles = [0, 1, 2, 3]
  return (
    <div className={cn("grid grid-cols-2 grid-rows-2 gap-px overflow-hidden bg-border/60", className)}>
      {tiles.map((i) => {
        const cover = covers[i]
        return (
          <div key={i} className="relative overflow-hidden bg-secondary">
            {cover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cover || "/placeholder.svg"} alt="" loading="lazy" className="size-full object-cover" />
            ) : (
              <div className="size-full bg-gradient-to-br from-primary/10 via-secondary to-background" />
            )}
          </div>
        )
      })}
    </div>
  )
}

export function PlayGlyph({ className }: { className?: string }) {
  return <Play className={cn("translate-x-px fill-current", className)} />
}

/**
 * Responsive modal shell: a bottom sheet on phones that becomes a centred modal
 * on larger screens. Wraps the app's Base-UI Sheet so every Upload flow shares
 * the same chrome (grab handle, sticky header/footer, scrollable body).
 */
export function UploadSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  headerAccessory,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: React.ReactNode
  footer?: React.ReactNode
  headerAccessory?: React.ReactNode
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className={cn(
          "max-h-[92dvh] gap-0 rounded-t-3xl border-border/70 bg-background p-0",
          // Desktop: lift off the bottom edge into a centred card.
          "sm:inset-0 sm:m-auto sm:h-fit sm:max-h-[85vh] sm:max-w-lg sm:rounded-3xl sm:border",
        )}
      >
        <div className="flex items-start gap-3 border-b border-border/60 px-5 pb-3 pt-3">
          <span
            aria-hidden
            className="absolute left-1/2 top-2 h-1 w-10 -translate-x-1/2 rounded-full bg-border sm:hidden"
          />
          <div className="min-w-0 flex-1 pt-2">
            <h2 className="font-display text-lg font-semibold tracking-tight text-foreground">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
          </div>
          {headerAccessory}
        </div>
        <div data-scroll className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
          {children}
        </div>
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-border/60 bg-background/95 px-5 py-3">
            {footer}
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-baseline justify-between text-sm font-medium text-foreground">
        <span>{label}</span>
        {hint && <span className="text-xs font-normal text-muted-foreground">{hint}</span>}
      </label>
      {children}
    </div>
  )
}
