"use client"

// The single universal resource trigger. Rendered by the resource layer pinned
// to the middle-right edge of every live format. Tapping it opens the resource
// drawer without ever leaving the live. It sits vertically centered against the
// right edge — clear of every format's header, bottom control dock, chat panel
// and text composer — so it can never overlap the keyboard, a textbox or any
// interactive control. It tucks itself away while a mini-panel or the drawer is
// already open so it never overlaps them.

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
      // Motion owns the `transform`, so vertical centering (y: -50%) lives here
      // rather than as a Tailwind `-translate-y-1/2` class (which Motion would
      // overwrite). The hide animation slides the button off the right edge.
      animate={
        hidden
          ? { opacity: 0, scale: 0.8, x: 12, y: "-50%", pointerEvents: "none" }
          : { opacity: 1, scale: 1, x: 0, y: "-50%" }
      }
      transition={{ type: "spring", stiffness: 320, damping: 26 }}
      whileTap={{ scale: 0.92 }}
      className="pointer-events-auto absolute right-3 top-1/2 z-[10] flex size-12 items-center justify-center rounded-full border border-white/15 bg-zinc-900/85 text-white shadow-2xl ring-1 ring-black/40 backdrop-blur-xl"
    >
      <span className="absolute inset-0 rounded-full bg-primary/15" aria-hidden />
      <BookOpen className="relative size-5" strokeWidth={2.2} />
    </motion.button>
  )
}
