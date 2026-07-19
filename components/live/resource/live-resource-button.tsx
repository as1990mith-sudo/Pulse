"use client"

// The single universal resource trigger. Rendered by the resource layer in the
// bottom-right of every live format. Tapping it opens the resource drawer
// without ever leaving the live. It tucks itself away while a mini-panel or the
// drawer is already open so it never overlaps them.

import { motion } from "motion/react"
import { BookOpen } from "lucide-react"
import { useLiveResources } from "./resource-context"

export function LiveResourceButton() {
  const { openDrawer, drawerOpen, activePanel } = useLiveResources()
  const hidden = drawerOpen || activePanel !== null

  return (
    <motion.button
      type="button"
      onClick={openDrawer}
      aria-label="Open study resources"
      initial={false}
      animate={hidden ? { opacity: 0, scale: 0.8, y: 12, pointerEvents: "none" } : { opacity: 1, scale: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 320, damping: 26 }}
      whileTap={{ scale: 0.92 }}
      className="pointer-events-auto absolute bottom-[calc(1.25rem+env(safe-area-inset-bottom))] right-4 z-[10] flex size-14 items-center justify-center rounded-full border border-white/15 bg-zinc-900/85 text-white shadow-2xl ring-1 ring-black/40 backdrop-blur-xl"
    >
      <span className="absolute inset-0 rounded-full bg-primary/15" aria-hidden />
      <BookOpen className="relative size-6" strokeWidth={2.2} />
    </motion.button>
  )
}
