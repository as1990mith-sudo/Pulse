"use client"

import { cn } from "@/lib/utils"
import { MonitorUp, Film } from "lucide-react"
import type { ReactNode } from "react"

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

  return (
    <div
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

      {/* Floating presenter thumbnail — bottom-right, out of the way of captions
          and the control dock. */}
      {thumbnail ? (
        <div className="absolute bottom-3 right-3 z-10 aspect-[3/4] w-24 overflow-hidden rounded-xl ring-2 ring-white/20 shadow-lg sm:w-28">
          {thumbnail}
        </div>
      ) : null}
    </div>
  )
}
