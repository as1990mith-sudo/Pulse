"use client"

// Shared chrome for every floating mini-panel. Gives each panel a premium,
// draggable card: a grab handle + title header, a compact switcher to jump
// straight to another resource (only one panel is ever open), a close button,
// and a smoothly animated body. The live plays on underneath the whole time —
// this is an overlay, never a navigation.

import { useEffect, useRef, useState } from "react"
import { animate, motion, useDragControls, useMotionValue } from "motion/react"
import {
  BookOpen,
  FileText,
  GripHorizontal,
  Maximize2,
  Minimize2,
  Minus,
  NotebookPen,
  Pin,
  Video,
  X,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { useLiveResources, type ResourcePanelId } from "./resource-context"

const SWITCHER: { id: ResourcePanelId; icon: LucideIcon; label: string }[] = [
  { id: "bible", icon: BookOpen, label: "Bible" },
  { id: "notes", icon: NotebookPen, label: "Notes" },
  { id: "pdf", icon: FileText, label: "PDFs" },
  { id: "video", icon: Video, label: "Video" },
  { id: "pinned", icon: Pin, label: "Pinned" },
]

export function MiniPanelShell({
  panelId,
  title,
  subtitle,
  icon: Icon,
  children,
  constraintsRef,
}: {
  // Which resource is showing. The card itself stays mounted across switches,
  // so this is used to react to a change rather than to key the component.
  panelId: ResourcePanelId
  title: string
  subtitle?: string
  icon: LucideIcon
  children: React.ReactNode
  // Ref to the layer element, so the panel can't be dragged off-screen.
  constraintsRef: React.RefObject<HTMLDivElement | null>
}) {
  const { activePanel, openPanel, closePanel, openDrawer, videoLocked, descriptor } = useLiveResources()
  // The shared-video resource only exists on the audio surfaces (podcast &
  // audio conversation); video broadcast/conversation already show video.
  const switcher = SWITCHER.filter((s) => s.id !== "video" || descriptor?.mode === "audio")
  const dragControls = useDragControls()
  const panelRef = useRef<HTMLDivElement>(null)
  // "Expand" grows the floating card ~20% larger (both height and width) so more
  // of the resource is visible, while staying an overlay the live plays behind.
  const [expanded, setExpanded] = useState(false)

  // Drag offset is held in explicit motion values rather than Motion's internal
  // ones so it can be reset. The card now survives a resource switch, so a
  // position the user dragged to (possibly measured while the mobile keyboard
  // was open and the viewport was shorter) would otherwise carry over and could
  // leave the card parked outside the visible area.
  const x = useMotionValue(0)
  const y = useMotionValue(0)

  useEffect(() => {
    const opts = { type: "spring", stiffness: 320, damping: 30 } as const
    animate(x, 0, opts)
    animate(y, 0, opts)
  }, [panelId, x, y])

  return (
    <motion.div
      ref={panelRef}
      drag
      dragControls={dragControls}
      dragListener={false}
      dragConstraints={constraintsRef}
      dragElastic={0.06}
      dragMomentum={false}
      style={{ x, y }}
      // Open/close only — and deliberately no `y` here, since `y` is now owned
      // by the drag motion value above and the two would fight each other.
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.94 }}
      transition={{ type: "spring", stiffness: 320, damping: 30 }}
      className={cn(
        "pointer-events-auto absolute bottom-4 left-1/2 z-[15] flex w-[calc(100%-1.5rem)] -translate-x-1/2 flex-col overflow-hidden rounded-3xl border border-white/12 bg-zinc-950/95 shadow-2xl ring-1 ring-black/50 backdrop-blur-2xl transition-[height,max-width,max-height] duration-300 ease-out",
        // Base size vs. expanded (+20% on each axis: 68%→82%, 560→672px, 28→33.6rem).
        expanded ? "h-[82%] max-h-[672px] max-w-[33.6rem]" : "h-[68%] max-h-[560px] max-w-md",
      )}
    >
      {/* Drag handle + header */}
      <div
        onPointerDown={(e) => dragControls.start(e)}
        className="flex cursor-grab touch-none flex-col gap-1.5 border-b border-white/8 bg-white/[0.03] px-4 pb-2 pt-1.5 active:cursor-grabbing"
      >
        <div className="mx-auto flex items-center text-white/25">
          <GripHorizontal className="size-4" />
        </div>
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Icon className="size-[18px]" strokeWidth={2.1} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[15px] font-bold leading-tight text-white">{title}</h2>
          </div>
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            aria-label={expanded ? "Shrink panel" : "Expand panel"}
            aria-pressed={expanded}
            className="flex size-8 items-center justify-center rounded-full bg-white/8 text-white/70 transition-colors hover:bg-white/15 hover:text-white"
          >
            {expanded ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          </button>
          {/* Minimise + close are hidden while a host-driven video is playing —
              participants must stay on the shared video. Expand and drag remain,
              and the live session itself can still be minimised elsewhere. */}
          {!videoLocked && (
            <>
              <button
                type="button"
                onClick={openDrawer}
                aria-label="Minimize to resources"
                className="flex size-8 items-center justify-center rounded-full bg-white/8 text-white/70 transition-colors hover:bg-white/15 hover:text-white"
              >
                <Minus className="size-4" />
              </button>
              <button
                type="button"
                onClick={closePanel}
                aria-label="Close panel"
                className="flex size-8 items-center justify-center rounded-full bg-white/8 text-white/70 transition-colors hover:bg-white/15 hover:text-white"
              >
                <X className="size-4" />
              </button>
            </>
          )}
        </div>

        {/* Quick switcher — jump to another resource without leaving the live.
            Hidden while locked: no switching tabs during a shared video. */}
        {!videoLocked && (
        <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
          {switcher.map((s) => {
            const SwIcon = s.icon
            const active = activePanel === s.id
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => openPanel(s.id)}
                aria-label={s.label}
                aria-pressed={active}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-semibold transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "bg-white/6 text-white/55 hover:bg-white/12 hover:text-white",
                )}
              >
                <SwIcon className="size-3.5" strokeWidth={2.3} />
                {active && <span>{s.label}</span>}
              </button>
            )
          })}
        </div>
        )}
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </motion.div>
  )
}
