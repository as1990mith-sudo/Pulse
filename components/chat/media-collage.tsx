"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { ChevronLeft, ChevronRight, Play, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { exclusivePlaybackProps, installExclusivePlayback } from "@/lib/exclusive-playback"
import { ActionSheet, type SheetAction } from "@/components/action-sheet"
import { SmartImage } from "@/components/ui/smart-image"

export type CollageMedia = {
  /** React key (usually the message id). */
  key: string | number
  /** DOM id used for pinned-message jump / scroll anchoring. */
  anchorId?: string
  url: string
  type: "image" | "video"
  name?: string | null
}

/** Up to this many tiles are shown; extras collapse behind a "+N" overlay. */
const MAX_TILES = 4

/**
 * WhatsApp-style grouped media collage. Renders 2 / 3 / 4+ media items in an
 * adaptive layout inside a single rounded card, with a "+N" overlay when there
 * are more items than fit. Tapping any tile opens a self-contained full-screen
 * viewer that can page through every item in the group (so items hidden behind
 * the "+N" overlay stay reachable). Long-pressing a tile opens the same action
 * sheet the parent supplies for that specific underlying message, so pin/delete
 * remain available per media item.
 *
 * This component is purely additive: single (ungrouped) media messages keep
 * using their existing bubble + ImageLightbox rendering elsewhere.
 */
export function MediaCollage({
  items,
  mine,
  className,
  buildActions,
}: {
  items: CollageMedia[]
  mine: boolean
  className?: string
  /** Optional long-press menu for the item at `index`. */
  buildActions?: (index: number) => SheetAction[]
}) {
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)
  const [menuIndex, setMenuIndex] = useState<number | null>(null)
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressedRef = useRef(false)

  const count = items.length
  const visible = items.slice(0, MAX_TILES)
  const overflow = count - MAX_TILES // >0 means the last visible tile shows "+N"

  function startPress(index: number) {
    if (!buildActions) return
    longPressedRef.current = false
    longPressRef.current = setTimeout(() => {
      const actions = buildActions(index)
      if (actions.length > 0) {
        longPressedRef.current = true
        setMenuIndex(index)
      }
    }, 450)
  }
  function cancelPress() {
    if (longPressRef.current) {
      clearTimeout(longPressRef.current)
      longPressRef.current = null
    }
  }
  function openViewer(index: number) {
    // A long-press that already opened the menu must not also open the viewer.
    if (longPressedRef.current) {
      longPressedRef.current = false
      return
    }
    setViewerIndex(index)
  }

  // Layout: grid template varies with the number of visible tiles. 3 and 4 use a
  // fixed-height 2x2 grid (the 3-item case makes the first tile span both rows),
  // while 2 items sit as two equal squares.
  const gridClass =
    visible.length === 2
      ? "grid grid-cols-2"
      : "grid h-64 grid-cols-2 grid-rows-2"

  const menuActions = menuIndex != null && buildActions ? buildActions(menuIndex) : []

  return (
    <>
      <div
        className={cn(
          "w-64 max-w-[75vw] gap-[3px] overflow-hidden bg-border/40",
          gridClass,
          className,
        )}
      >
        {visible.map((item, index) => {
          const isFirstOfThree = visible.length === 3 && index === 0
          const showOverflow = overflow > 0 && index === MAX_TILES - 1
          return (
            <button
              key={item.key}
              type="button"
              id={item.anchorId}
              onClick={() => openViewer(index)}
              onPointerDown={() => startPress(index)}
              onPointerUp={cancelPress}
              onPointerLeave={cancelPress}
              onPointerCancel={cancelPress}
              onContextMenu={(e) => {
                if (!buildActions) return
                const actions = buildActions(index)
                if (actions.length === 0) return
                e.preventDefault()
                longPressedRef.current = true
                setMenuIndex(index)
              }}
              aria-label={item.type === "video" ? "Play video" : "View photo"}
              className={cn(
                "group/tile relative block h-full w-full select-none overflow-hidden bg-muted scroll-mt-24",
                isFirstOfThree && "row-span-2",
                visible.length === 2 && "aspect-square",
              )}
            >
              {item.type === "video" ? (
                // Muted, controls-less first frame acts as the thumbnail; the
                // play badge signals it's a video. Full playback happens in the
                // viewer overlay on tap.
                // eslint-disable-next-line jsx-a11y/media-has-caption
                <video
                  src={item.url}
                  muted
                  playsInline
                  preload="metadata"
                  className="h-full w-full object-cover"
                />
              ) : (
                <SmartImage
                  src={item.url}
                  alt={item.name ?? "Shared photo"}
                  w={640}
                  className="h-full w-full object-cover transition-transform duration-200 group-hover/tile:scale-[1.02]"
                />
              )}

              {item.type === "video" && !showOverflow && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 flex items-center justify-center"
                >
                  <span className="flex size-10 items-center justify-center rounded-full bg-background/55 text-foreground backdrop-blur-sm">
                    <Play className="size-5 translate-x-[1px] fill-current" />
                  </span>
                </span>
              )}

              {showOverflow && (
                <span
                  aria-hidden
                  className="absolute inset-0 flex items-center justify-center bg-background/60 text-2xl font-semibold text-foreground backdrop-blur-[1px]"
                >
                  {`+${overflow}`}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {viewerIndex != null && (
        <CollageViewer
          items={items}
          index={viewerIndex}
          onIndex={setViewerIndex}
          onClose={() => setViewerIndex(null)}
        />
      )}

      {buildActions && (
        <ActionSheet
          open={menuIndex != null}
          onClose={() => setMenuIndex(null)}
          title={mine ? "Your media" : "Media"}
          preview={menuIndex != null ? items[menuIndex]?.name ?? undefined : undefined}
          actions={menuActions}
        />
      )}
    </>
  )
}

/**
 * Full-screen viewer for a media group. Mirrors the look of the app's existing
 * ImageLightbox (dark scrim, close button, Esc + scroll-lock) but adds paging so
 * every item in the group — including any hidden behind the "+N" overlay — is
 * reachable. Images render contained; videos get native controls and autoplay.
 */
function CollageViewer({
  items,
  index,
  onIndex,
  onClose,
}: {
  items: CollageMedia[]
  index: number
  onIndex: (i: number) => void
  onClose: () => void
}) {
  const total = items.length
  const current = items[index]

  // Arm the app-wide "only one recorded media element plays" guard (idempotent).
  useEffect(() => {
    installExclusivePlayback()
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
      else if (e.key === "ArrowRight" && index < total - 1) onIndex(index + 1)
      else if (e.key === "ArrowLeft" && index > 0) onIndex(index - 1)
    }
    document.addEventListener("keydown", onKey)
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = ""
    }
  }, [index, total, onIndex, onClose])

  if (typeof document === "undefined" || !current) return null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Media viewer"
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close viewer"
        className="absolute right-4 top-4 z-10 flex size-10 items-center justify-center rounded-full bg-secondary text-foreground transition-colors hover:bg-secondary/80"
      >
        <X className="size-5" />
      </button>

      {total > 1 && (
        <span className="absolute left-1/2 top-5 z-10 -translate-x-1/2 rounded-full bg-secondary/90 px-3 py-1 text-xs font-medium text-foreground">
          {`${index + 1} / ${total}`}
        </span>
      )}

      {index > 0 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onIndex(index - 1)
          }}
          aria-label="Previous"
          className="absolute left-3 top-1/2 z-10 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-secondary/80 text-foreground transition-colors hover:bg-secondary"
        >
          <ChevronLeft className="size-6" />
        </button>
      )}
      {index < total - 1 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onIndex(index + 1)
          }}
          aria-label="Next"
          className="absolute right-3 top-1/2 z-10 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-secondary/80 text-foreground transition-colors hover:bg-secondary"
        >
          <ChevronRight className="size-6" />
        </button>
      )}

      {current.type === "video" ? (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <video
          key={current.key}
          src={current.url}
          controls
          autoPlay
          playsInline
          className="max-h-[90vh] max-w-[90vw] rounded-lg"
          onClick={(e) => e.stopPropagation()}
          // Opened from a tap and plays with sound, so it must silence any feed
          // clip or episode still running behind the lightbox.
          {...exclusivePlaybackProps}
        />
      ) : (
        <SmartImage
          key={current.key}
          src={current.url}
          alt={current.name ?? "Shared photo"}
          priority
          w={1920}
          className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain"
          onClick={(e) => e.stopPropagation()}
        />
      )}
    </div>,
    document.body,
  )
}
