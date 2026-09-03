"use client"

import { cn } from "@/lib/utils"
import { Video, VideoOff } from "lucide-react"

/**
 * The host's own camera as a compact portrait tile, shown inside ProjectionStage
 * while screen-sharing so the presenter can still see (and manage) themselves.
 * Purely presentational: the camera track is attached into the <video> by the
 * live hook via `registerVideoEl`. Dragging is owned by ProjectionStage; the cam
 * toggle here stops pointer propagation so tapping it never starts a drag.
 */
export function SelfViewPip({
  registerVideoEl,
  camOn,
  mirror = true,
  name,
  image,
  onToggleCam,
}: {
  registerVideoEl: (el: HTMLVideoElement | null) => void
  camOn: boolean
  /** Front camera → mirror the self-view (matches the main stage). */
  mirror?: boolean
  name: string
  image?: string | null
  onToggleCam?: () => void
}) {
  const initial = (name?.trim()?.[0] ?? "?").toUpperCase()

  return (
    <div className="relative h-full w-full bg-neutral-900">
      {/* Camera feed — always mounted so the track stays attached; hidden (not
          unmounted) when the camera is off so toggling back on is instant. */}
      <video
        ref={registerVideoEl}
        muted
        playsInline
        className={cn(
          "h-full w-full object-cover transition-opacity",
          mirror && "scale-x-[-1]",
          camOn ? "opacity-100" : "opacity-0",
        )}
      />

      {/* Camera-off state — avatar/initial so the presenter still has presence. */}
      {!camOn && (
        <div className="absolute inset-0 flex items-center justify-center bg-neutral-800">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image || "/placeholder.svg"} alt="" className="size-9 rounded-full object-cover" />
          ) : (
            <span className="flex size-9 items-center justify-center rounded-full bg-neutral-700 text-sm font-semibold text-white">
              {initial}
            </span>
          )}
        </div>
      )}

      {/* "You" label */}
      <span className="pointer-events-none absolute left-1.5 top-1.5 rounded-md bg-black/50 px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
        You
      </span>

      {/* Camera on/off toggle — lets the host drop their video during a share
          without leaving the presentation. stopPropagation so it doesn't drag. */}
      {onToggleCam && (
        <button
          type="button"
          aria-label={camOn ? "Turn off camera" : "Turn on camera"}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onToggleCam}
          className={cn(
            "absolute bottom-1.5 right-1.5 flex size-7 items-center justify-center rounded-full ring-1 ring-inset ring-white/20 backdrop-blur-md transition-colors",
            camOn ? "bg-black/50 text-white hover:bg-black/70" : "bg-red-500/90 text-white hover:bg-red-500",
          )}
        >
          {camOn ? <Video className="size-3.5" /> : <VideoOff className="size-3.5" />}
        </button>
      )}
    </div>
  )
}
