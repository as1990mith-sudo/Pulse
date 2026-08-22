"use client"

import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion, type Variants } from "motion/react"
import { Crown, Mic, MicOff, Pin, Shield } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { getInitials } from "@/lib/identity"
import { cn } from "@/lib/utils"

export type GridParticipant = {
  identity: string
  name: string
  image: string | null
  color: string
  isSpeaking: boolean
  micOn: boolean
  isLocal: boolean
  isHost: boolean
  pinned: boolean
}

// 4 columns x 4 rows. The row count is load-bearing: all four rows must land
// inside the stage area rather than the last one clipping below the fold, so
// rows are explicit equal tracks (see `gridTemplateRows`) and each tile carries
// `min-h-0` instead of sizing to its content.
const COLUMNS = 4
const DEFAULT_PER_PAGE = COLUMNS * 4

// Horizontal page transition. `custom` carries the swipe direction (1 = forward,
// -1 = back) so incoming/outgoing pages slide the natural way.
const pageVariants: Variants = {
  enter: (dir: number) => ({ opacity: 0, x: dir > 0 ? 60 : -60 }),
  center: { opacity: 1, x: 0 },
  exit: (dir: number) => ({ opacity: 0, x: dir > 0 ? -60 : 60 }),
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out.length ? out : [[]]
}

/**
 * A single participant tile. Gently enlarges with an animated ring while the
 * person is speaking, and shows their mic state + host/pin badges.
 */
function ParticipantCard({
  p,
  onTap,
  compact = false,
}: {
  p: GridParticipant
  onTap?: (p: GridParticipant) => void
  // Set when the stage is short (chat open). Uses the original smaller avatar so
  // rows fit their tracks instead of names colliding with the row below.
  compact?: boolean
}) {
  return (
    <motion.button
      type="button"
      layout
      layoutId={p.identity}
      onClick={() => onTap?.(p)}
      initial={{ opacity: 0, scale: 0.6 }}
      animate={{ opacity: 1, scale: p.isSpeaking ? 1.06 : 1 }}
      exit={{ opacity: 0, scale: 0.6 }}
      transition={{ type: "spring", stiffness: 460, damping: 34, mass: 0.7 }}
      // `min-h-0` lets the tile shrink inside its row track rather than forcing
      // the row taller than the stage. Tiles hug their content (`justify-start`)
      // so the name sits directly under the avatar instead of drifting.
      className="flex min-h-0 min-w-0 flex-col items-center justify-start gap-1.5 rounded-2xl p-0.5 text-center focus:outline-none"
    >
      <span className="relative inline-flex shrink-0">
        {/* Soft animated ring while speaking. */}
        <AnimatePresence>
          {p.isSpeaking && (
            <motion.span
              aria-hidden="true"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1.18 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.25 }}
              className="absolute inset-0 rounded-full ring-2 ring-primary/70"
              style={{ boxShadow: "0 0 0 6px color-mix(in oklch, var(--primary) 22%, transparent)" }}
            />
          )}
        </AnimatePresence>
        <Avatar
          className={cn(
            "ring-2 transition-colors",
            // Full stage: 10% up on the original 3.5rem/4rem slots. At 4 columns
            // a ~384px stage gives roughly 78px per cell, so this fills the cell
            // while leaving room for the speaking ring's 6px glow to breathe.
            // Compact (chat open) keeps the original size so 2 rows still fit.
            compact ? "size-14 sm:size-16" : "size-[3.85rem] sm:size-[4.4rem]",
            p.isSpeaking ? "ring-primary/80" : "ring-white/10",
          )}
        >
          {p.image && <AvatarImage src={p.image || "/placeholder.svg"} alt={p.name} />}
          <AvatarFallback className={cn("text-sm font-semibold text-white", p.color)}>
            {getInitials(p.name)}
          </AvatarFallback>
        </Avatar>

        {/* Mic state chip, bottom-right of the avatar. */}
        <span
          className={cn(
            "absolute -bottom-0.5 -right-0.5 flex size-5 items-center justify-center rounded-full ring-2 ring-zinc-950",
            p.micOn ? "bg-primary text-primary-foreground" : "bg-zinc-700 text-white/80",
          )}
        >
          {p.micOn ? <Mic className="size-2.5" strokeWidth={3} /> : <MicOff className="size-2.5" strokeWidth={3} />}
        </span>

        {/* Host / pin badge, top-right. */}
        {(p.isHost || p.pinned) && (
          <span className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-live text-live-foreground ring-2 ring-zinc-950">
            {p.isHost ? <Crown className="size-2.5" strokeWidth={3} /> : <Pin className="size-2.5" strokeWidth={3} />}
          </span>
        )}
      </span>

      <span className="flex max-w-full items-center gap-0.5">
        <span className="truncate text-[11px] font-medium leading-tight text-white/85">
          {p.isLocal ? "You" : p.name}
        </span>
      </span>
      {/* Rendered for everyone (hidden for non-hosts) rather than only for the
          host. The host's label is a third line of content, so mounting it
          conditionally made that one tile taller than its neighbours and pushed
          it into the row below. Reserving the line on every tile keeps all tiles
          the same height, which is what actually keeps the rows aligned. */}
      <span
        aria-hidden={!p.isHost}
        className={cn(
          "flex items-center gap-0.5 text-[9px] font-semibold uppercase tracking-wide text-live",
          !p.isHost && "invisible",
        )}
      >
        <Shield className="size-2" strokeWidth={3} /> Host
      </span>
    </motion.button>
  )
}

/**
 * Paginated, swipeable participant grid — 16 people per page (4x4). Cards fade/scale
 * in on join, reorder smoothly, and pages slide with spring physics. Empty
 * seats are never shown (only present participants render).
 */
export function ParticipantGrid({
  participants,
  onTapParticipant,
  perPage = DEFAULT_PER_PAGE,
}: {
  participants: GridParticipant[]
  onTapParticipant?: (p: GridParticipant) => void
  // How many participants fit on a page. Rooms pass a smaller value when the
  // chat is open so the grid pages instead of clipping people behind the chat.
  perPage?: number
}) {
  const pages = chunk(participants, perPage)
  // Rows needed to hold a full page at 5 across, so a reduced `perPage` (chat
  // open) shows fewer, taller rows instead of 4 short ones with gaps.
  const rows = Math.max(1, Math.ceil(perPage / COLUMNS))
  const [page, setPage] = useState(0)
  const [dir, setDir] = useState(0)
  const clamped = Math.min(page, pages.length - 1)
  const prevPageCount = useRef(pages.length)

  // Keep the active page valid as people join/leave.
  useEffect(() => {
    if (page > pages.length - 1) setPage(Math.max(0, pages.length - 1))
    prevPageCount.current = pages.length
  }, [pages.length, page])

  const goto = (next: number) => {
    const target = Math.max(0, Math.min(next, pages.length - 1))
    if (target === clamped) return
    setDir(target > clamped ? 1 : -1)
    setPage(target)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="relative flex-1 overflow-hidden">
        <AnimatePresence initial={false} custom={dir} mode="popLayout">
          <motion.div
            key={clamped}
            custom={dir}
            variants={pageVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.14}
            onDragEnd={(_e, info) => {
              if (info.offset.x < -70 || info.velocity.x < -450) goto(clamped + 1)
              else if (info.offset.x > 70 || info.velocity.x > 450) goto(clamped - 1)
            }}
            className="absolute inset-0"
          >
            {/* 4 columns x N rows. Rows are explicit, evenly-divided tracks
                rather than content-sized, so the bottom row can't spill past the
                stage. Row count is set inline because it varies with `perPage`
                (4 normally, 2 when the chat is open) and Tailwind can't
                statically extract a computed class name.

                Vertical framing: rows share the stage evenly (`1fr` tracks) so
                the block fills the space instead of clumping at the top, and the
                bottom padding is larger than the top so the group sits slightly
                high with more clearance beneath it than above.

                Both the bottom padding and the avatar size step down on a short
                stage (chat open, 2 rows): a flat `pb-8` plus full-size avatars
                overflowed the shorter tracks and names collided with the row
                below. */}
            <div
              className={cn("grid h-full grid-cols-4 gap-x-2 gap-y-1 px-3 pt-2", rows >= 4 ? "pb-8" : "pb-3")}
              style={{ gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }}
            >
              <AnimatePresence mode="popLayout">
                {pages[clamped].map((p) => (
                  <ParticipantCard key={p.identity} p={p} onTap={onTapParticipant} compact={rows < 4} />
                ))}
              </AnimatePresence>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Page dots */}
      {pages.length > 1 && (
        <div className="flex shrink-0 items-center justify-center gap-1.5 pb-1 pt-2">
          {pages.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Go to page ${i + 1}`}
              onClick={() => goto(i)}
              className={cn(
                "h-1.5 rounded-full transition-all",
                i === clamped ? "w-5 bg-primary" : "w-1.5 bg-white/25 hover:bg-white/40",
              )}
            />
          ))}
        </div>
      )}
    </div>
  )
}
