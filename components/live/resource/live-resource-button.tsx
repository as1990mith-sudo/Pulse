"use client"

// The single universal resource trigger, present on every live format. It is
// freely draggable and always snaps to whichever side (left/right edge) it is
// dropped nearest — it can never come to rest floating in the middle of the
// screen, where it would cover participants. Snapping uses a spring so the
// motion feels buttery, never draggy. Tapping (without dragging) opens the
// resource drawer without leaving the live. It tucks itself away while a
// mini-panel or the drawer is already open so it never overlaps them.

import { useLayoutEffect, useRef, useState } from "react"
import { motion, useMotionValue, animate, type PanInfo } from "motion/react"
import { BookOpen } from "lucide-react"
import { useLiveResources } from "./resource-context"

const SIZE = 48 // matches size-12
const EDGE_MARGIN = 12 // resting gap from the left/right edge
const TOP_MARGIN = 84 // keep clear of the header
const BOTTOM_MARGIN = 96 // keep clear of the bottom dock
const SNAP = { type: "spring", stiffness: 420, damping: 34, mass: 0.9 } as const

export function LiveResourceButton({
  constraintsRef,
}: {
  constraintsRef: React.RefObject<HTMLDivElement | null>
}) {
  const { openDrawer, drawerOpen, activePanel } = useLiveResources()
  const hidden = drawerOpen || activePanel !== null

  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const [ready, setReady] = useState(false)
  const draggingRef = useRef(false)

  // Clamp a vertical position into the safe band (below header, above dock).
  const clampY = (val: number, height: number) =>
    Math.min(Math.max(val, TOP_MARGIN), Math.max(TOP_MARGIN, height - SIZE - BOTTOM_MARGIN))

  // Resolve the resting x for whichever side the button currently sits nearer.
  const restX = (width: number) => {
    const center = x.get() + SIZE / 2
    const side = ready ? (center < width / 2 ? "left" : "right") : "right"
    return side === "left" ? EDGE_MARGIN : width - SIZE - EDGE_MARGIN
  }

  // Place on mount and keep pinned to an edge across resize/orientation change.
  useLayoutEffect(() => {
    const place = () => {
      const el = constraintsRef.current
      if (!el) return
      const { width, height } = el.getBoundingClientRect()
      if (!width || !height) return
      x.set(restX(width))
      y.set(clampY(ready ? y.get() : height / 2 - SIZE / 2, height))
      setReady(true)
    }
    place()
    window.addEventListener("resize", place)
    return () => window.removeEventListener("resize", place)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [constraintsRef])

  const handleDragEnd = (_e: unknown, _info: PanInfo) => {
    const el = constraintsRef.current
    if (el) {
      const { width, height } = el.getBoundingClientRect()
      // Spring to the nearest side and into the safe vertical band.
      animate(x, restX(width), SNAP)
      animate(y, clampY(y.get(), height), SNAP)
    }
    // Let the click handler know this pointer sequence was a drag.
    window.setTimeout(() => (draggingRef.current = false), 0)
  }

  return (
    <motion.button
      type="button"
      aria-label="Open study resources"
      drag
      dragConstraints={constraintsRef}
      dragElastic={0.08}
      dragMomentum={false}
      onDragStart={() => (draggingRef.current = true)}
      onDragEnd={handleDragEnd}
      onClick={() => {
        if (!draggingRef.current) openDrawer()
      }}
      style={{ x, y }}
      initial={false}
      animate={
        hidden
          ? { opacity: 0, scale: 0.8, pointerEvents: "none" }
          : { opacity: ready ? 1 : 0, scale: 1, pointerEvents: "auto" }
      }
      transition={{ type: "spring", stiffness: 320, damping: 26 }}
      whileDrag={{ scale: 1.08 }}
      whileTap={{ scale: 0.92 }}
      className="pointer-events-auto absolute left-0 top-0 z-[10] flex size-12 touch-none items-center justify-center rounded-full border border-white/15 bg-zinc-900/85 text-white shadow-2xl ring-1 ring-black/40 backdrop-blur-xl"
    >
      <span className="absolute inset-0 rounded-full bg-primary/15" aria-hidden />
      <BookOpen className="relative size-5" strokeWidth={2.2} />
    </motion.button>
  )
}
