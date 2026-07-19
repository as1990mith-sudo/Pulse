"use client"

// Shared chrome for every floating mini-panel. Gives each panel a premium,
// draggable card: a grab handle + title header, a compact switcher to jump
// straight to another resource (only one panel is ever open), a close button,
// and a smoothly animated body. The live plays on underneath the whole time —
// this is an overlay, never a navigation.

import { useRef } from "react"
import { motion, useDragControls } from "motion/react"
import {
  BookMarked,
  BookOpen,
  FileText,
  GripHorizontal,
  HandHeart,
  Minus,
  NotebookPen,
  Pin,
  X,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { useLiveResources, type ResourcePanelId } from "./resource-context"

const SWITCHER: { id: ResourcePanelId; icon: LucideIcon; label: string }[] = [
  { id: "bible", icon: BookOpen, label: "Bible" },
  { id: "notes", icon: NotebookPen, label: "Notes" },
  { id: "pdf", icon: FileText, label: "PDFs" },
  { id: "books", icon: BookMarked, label: "Books" },
  { id: "pinned", icon: Pin, label: "Pinned" },
  { id: "prayer", icon: HandHeart, label: "Prayer" },
]

export function MiniPanelShell({
  title,
  subtitle,
  icon: Icon,
  children,
  constraintsRef,
}: {
  title: string
  subtitle?: string
  icon: LucideIcon
  children: React.ReactNode
  // Ref to the layer element, so the panel can't be dragged off-screen.
  constraintsRef: React.RefObject<HTMLDivElement | null>
}) {
  const { activePanel, openPanel, closePanel, openDrawer } = useLiveResources()
  const dragControls = useDragControls()
  const panelRef = useRef<HTMLDivElement>(null)

  return (
    <motion.div
      ref={panelRef}
      drag
      dragControls={dragControls}
      dragListener={false}
      dragConstraints={constraintsRef}
      dragElastic={0.06}
      dragMomentum={false}
      initial={{ opacity: 0, scale: 0.94, y: 24 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.94, y: 24 }}
      transition={{ type: "spring", stiffness: 320, damping: 30 }}
      className="pointer-events-auto absolute bottom-4 left-1/2 z-[15] flex h-[68%] max-h-[560px] w-[calc(100%-1.5rem)] max-w-md -translate-x-1/2 flex-col overflow-hidden rounded-3xl border border-white/12 bg-zinc-950/95 shadow-2xl ring-1 ring-black/50 backdrop-blur-2xl"
    >
      {/* Drag handle + header */}
      <div
        onPointerDown={(e) => dragControls.start(e)}
        className="flex cursor-grab touch-none flex-col gap-2 border-b border-white/8 bg-white/[0.03] px-4 pb-3 pt-2.5 active:cursor-grabbing"
      >
        <div className="mx-auto flex items-center text-white/25">
          <GripHorizontal className="size-4" />
        </div>
        <div className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <Icon className="size-5" strokeWidth={2.1} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[15px] font-bold text-white">{title}</h2>
            {subtitle && <p className="truncate text-xs text-white/45">{subtitle}</p>}
          </div>
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
        </div>

        {/* Quick switcher — jump to another resource without leaving the live */}
        <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
          {SWITCHER.map((s) => {
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
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </motion.div>
  )
}
