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

const DEFAULT_PER_PAGE = 12

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
function ParticipantCard({ p, onTap }: { p: GridParticipant; onTap?: (p: GridParticipant) => void }) {
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
      className="flex min-w-0 flex-col items-center gap-1.5 rounded-2xl p-1.5 text-center focus:outline-none"
    >
      <span className="relative inline-flex">
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
            "size-14 ring-2 transition-colors sm:size-16",
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
      {p.isHost && (
        <span className="flex items-center gap-0.5 text-[9px] font-semibold uppercase tracking-wide text-live">
          <Shield className="size-2" strokeWidth={3} /> Host
        </span>
      )}
    </motion.button>
  )
}

/**
 * Paginated, swipeable participant grid — 12 people per page. Cards fade/scale
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
            <div className="grid h-full grid-cols-3 content-start gap-x-2 gap-y-4 px-3 py-4 sm:grid-cols-4">
              <AnimatePresence mode="popLayout">
                {pages[clamped].map((p) => (
                  <ParticipantCard key={p.identity} p={p} onTap={onTapParticipant} />
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
