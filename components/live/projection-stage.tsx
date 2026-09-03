"use client"

import { cn } from "@/lib/utils"
import { MonitorUp, Film } from "lucide-react"
import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react"

/**
 * Full-stage presentation of a "Video Project" (a shared screen or a projected
 * video). The projected surface fills the frame; the presenter's own camera (or
 * any secondary content) shrinks into a floating thumbnail so the room stays
 * focused on what's being presented.
 *
 * It is presentation-only — it does NOT own the projected <video>. The caller
 * either:
 *   - passes `registerSurfaceEl` (a callback ref) for a REMOTE screen share, and
 *     the hook attaches the LiveKit track into it, OR
 *   - passes a ready `surface` node (e.g. the host's own local screen preview,
 *     or the synced Project Video element) to render directly.
 *
 * Placement differs by surface, not by this component: Broadcast drops it over
 * the whole stage with the host thumbnail; Conversation mounts it as the focused
 * tile. Both get identical internals from here.
 */
export function ProjectionStage({
  surface,
  registerSurfaceEl,
  kind,
  label,
  presenterName,
  presenterRole = "Presenter",
  thumbnail,
  className,
  rounded = true,
}: {
  /** A ready projection node (local preview / synced Project Video). */
  surface?: ReactNode
  /** Callback ref for a remote screen-share <video> the hook attaches into. */
  registerSurfaceEl?: (el: HTMLVideoElement | null) => void
  /** What is being presented — drives the corner badge icon + default label. */
  kind: "screen" | "video"
  /** Optional override for the corner badge text. */
  label?: string
  /** Who is presenting — shown in a chip so the room knows the source. */
  presenterName?: string
  /** Role word for the presenter chip (e.g. "Host", "Presenter", "You"). */
  presenterRole?: string
  /** The floating thumbnail (presenter camera). Omitted → no thumbnail. */
  thumbnail?: ReactNode
  className?: string
  /** Rounded corners (Broadcast/Conversation tiles) vs full-bleed (viewer). */
  rounded?: boolean
}) {
  const badge = label ?? (kind === "screen" ? "Sharing screen" : "Playing video")
  const Icon = kind === "screen" ? MonitorUp : Film

  // Draggable self-view thumbnail. `pos` is null until the first drag, so it
  // rests at its default bottom-right anchor; once moved it becomes an absolute
  // left/top (px) clamped inside the stage. Pointer capture keeps the drag
  // smooth even if the pointer briefly outruns the small tile.
  const containerRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const dragRef = useRef<{ dx: number; dy: number; startX: number; startY: number } | null>(null)

  function onThumbPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    const cont = containerRef.current
    const thumb = e.currentTarget
    if (!cont) return
    const cr = cont.getBoundingClientRect()
    const tr = thumb.getBoundingClientRect()
    dragRef.current = {
      dx: e.clientX - tr.left,
      dy: e.clientY - tr.top,
      startX: cr.left,
      startY: cr.top,
    }
    thumb.setPointerCapture(e.pointerId)
  }

  function onThumbPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const d = dragRef.current
    const cont = containerRef.current
    if (!d || !cont) return
    const cr = cont.getBoundingClientRect()
    const thumb = e.currentTarget
    const w = thumb.offsetWidth
    const h = thumb.offsetHeight
    // Position relative to the container, clamped so it can't leave the stage.
    const left = Math.max(8, Math.min(e.clientX - d.dx - cr.left, cr.width - w - 8))
    const top = Math.max(8, Math.min(e.clientY - d.dy - cr.top, cr.height - h - 8))
    setPos({ left, top })
  }

  function onThumbPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    dragRef.current = null
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* pointer already released */
    }
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative flex h-full w-full items-center justify-center overflow-hidden bg-neutral-950",
        // Smooth entrance so the stage reflow into projection never snaps.
        "duration-300 animate-in fade-in zoom-in-95",
        rounded && "rounded-2xl",
        className,
      )}
    >
      {/* Projected surface — object-contain so slides/screens are never cropped. */}
      {registerSurfaceEl ? (
        <video
          ref={registerSurfaceEl}
          muted
          playsInline
          className="h-full w-full object-contain"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center [&>*]:h-full [&>*]:w-full [&_video]:h-full [&_video]:w-full [&_video]:object-contain">
          {surface}
        </div>
      )}

      {/* Corner badges — what's being presented, and (when known) by whom. */}
      <div className="pointer-events-none absolute left-3 top-3 z-10 flex flex-wrap items-center gap-1.5">
        <span className="flex items-center gap-1.5 rounded-full bg-black/50 px-2.5 py-1 text-[11px] font-semibold text-white ring-1 ring-inset ring-white/15 backdrop-blur-md">
          <Icon className="size-3.5" aria-hidden="true" />
          {badge}
        </span>
        {presenterName && (
          <span className="flex items-center gap-1 rounded-full bg-primary/90 px-2.5 py-1 text-[11px] font-semibold text-primary-foreground ring-1 ring-inset ring-white/15 backdrop-blur-md">
            <span className="uppercase tracking-wide opacity-80">{presenterRole}</span>
            <span className="max-w-[10rem] truncate">{presenterName}</span>
          </span>
        )}
      </div>

      {/* Floating presenter thumbnail — a draggable portrait PiP. Rests at the
          bottom-right by default (out of the way of captions and the control
          dock); the presenter can drag it anywhere inside the stage. */}
      {thumbnail ? (
        <div
          onPointerDown={onThumbPointerDown}
          onPointerMove={onThumbPointerMove}
          onPointerUp={onThumbPointerUp}
          onPointerCancel={onThumbPointerUp}
          style={pos ? { left: pos.left, top: pos.top, right: "auto", bottom: "auto" } : undefined}
          className={cn(
            "absolute z-20 aspect-[3/4] w-24 touch-none cursor-grab overflow-hidden rounded-xl ring-2 ring-white/20 shadow-lg active:cursor-grabbing sm:w-28",
            !pos && "bottom-3 right-3",
          )}
        >
          {thumbnail}
        </div>
      ) : null}
    </div>
  )
}
