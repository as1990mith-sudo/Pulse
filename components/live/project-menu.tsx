"use client"

// The host's "Project" chooser, shared by the Video Broadcast and Video
// Conversation control docks. It replaces the old flip-camera control and opens
// a small popover with the two ways a host can put something on the stage:
//
//   • Share screen  — LiveKit screen capture (desktop / browsers that expose
//                     getDisplayMedia). Hidden as unavailable elsewhere.
//   • Project a video — the synced live_video_state playback (upload or link),
//                     which works on every device, reusing the resource "video"
//                     panel that the audio surfaces already use.
//
// The trigger is supplied by each dock via `renderTrigger` so it keeps that
// surface's native button styling (GlassButton vs DockButton); this component
// only owns the menu, its open/close state, and outside-click dismissal.

import { useEffect, useRef, useState } from "react"
import { Film, MonitorUp, MonitorX, MonitorSmartphone } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

export function ProjectMenu({
  canScreenShare,
  screenShareOn,
  onToggleScreenShare,
  onSwitchScreenShare,
  onProjectVideo,
  renderTrigger,
}: {
  canScreenShare: boolean
  screenShareOn: boolean
  onToggleScreenShare: () => void
  // Switch to a different screen/window while already sharing (reopens the OS
  // picker). When provided and a share is live, the menu splits into an explicit
  // "Share another screen" + "Stop sharing screen" pair for easy management.
  onSwitchScreenShare?: () => void
  onProjectVideo: () => void
  renderTrigger: (args: { toggle: () => void; open: boolean; active: boolean }) => React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Dismiss on any tap/click outside the menu (docks live at the screen edge,
  // so a tap elsewhere should quietly close the chooser).
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("pointerdown", onDown)
    return () => document.removeEventListener("pointerdown", onDown)
  }, [open])

  const choose = (fn: () => void) => {
    setOpen(false)
    fn()
  }

  return (
    <div ref={ref} className="relative">
      {renderTrigger({ toggle: () => setOpen((o) => !o), open, active: screenShareOn })}
      {open && (
        <div
          role="menu"
          aria-label="Projection options"
          // Anchor to the trigger's LEFT edge (not centered): the Project button
          // is the leftmost dock item, so a centered menu spilled off the left
          // of the screen. Opening rightward keeps it fully on-screen, and the
          // width is capped to the viewport for very narrow devices.
          className="absolute bottom-full left-0 z-50 mb-2 w-64 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-2xl border border-white/10 bg-neutral-900/95 p-1.5 shadow-2xl ring-1 ring-black/40 backdrop-blur-xl"
        >
          {screenShareOn ? (
            <>
              {/* Already sharing: split into explicit switch + stop so the host
                  can swap screens without a manual stop→start dance. */}
              {onSwitchScreenShare && canScreenShare ? (
                <MenuItem
                  icon={MonitorSmartphone}
                  title="Share another screen"
                  subtitle="Switch to a different screen, window or tab"
                  onClick={() => choose(onSwitchScreenShare)}
                />
              ) : null}
              <MenuItem
                icon={MonitorX}
                title="Stop sharing screen"
                subtitle="Take your screen off the stage"
                onClick={() => choose(onToggleScreenShare)}
              />
            </>
          ) : (
            <MenuItem
              icon={MonitorUp}
              title="Share screen"
              subtitle={canScreenShare ? "Present your screen to the room" : "Not available on this device"}
              disabled={!canScreenShare}
              onClick={() => choose(onToggleScreenShare)}
            />
          )}
          <MenuItem
            icon={Film}
            title="Project a video"
            subtitle="Upload or paste a link — synced to everyone"
            onClick={() => choose(onProjectVideo)}
          />
        </div>
      )}
    </div>
  )
}

function MenuItem({
  icon: Icon,
  title,
  subtitle,
  onClick,
  disabled,
}: {
  icon: LucideIcon
  title: string
  subtitle: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
        disabled ? "cursor-not-allowed opacity-40" : "hover:bg-white/10 active:bg-white/15",
      )}
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white">
        <Icon className="size-[18px]" strokeWidth={2.1} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-white">{title}</span>
        <span className="block truncate text-xs text-white/55">{subtitle}</span>
      </span>
    </button>
  )
}
