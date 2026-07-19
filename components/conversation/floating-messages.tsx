"use client"

import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import type { LiveChatMessageView } from "@/app/actions/live"

type FloatingBubble = {
  key: string
  userName: string
  body: string
  count: number
}

const VISIBLE_MS = 5000
const MAX_VISIBLE = 4

/**
 * Ambient chat overlay shown when the chat panel is closed. New messages float
 * up near the lower part of the participant area, linger a few seconds, then
 * fade. Identical messages arriving together (e.g. a wave of "Amen") are grouped
 * into one bubble with a count instead of flooding the screen.
 */
export function FloatingMessages({
  messages,
  active,
}: {
  messages: LiveChatMessageView[]
  active: boolean
}) {
  const [bubbles, setBubbles] = useState<FloatingBubble[]>([])
  const lastSeenId = useRef<number | null>(null)
  const seqRef = useRef(0)

  // Seed the baseline so we never replay history when the overlay first mounts.
  useEffect(() => {
    if (lastSeenId.current === null && messages.length) {
      lastSeenId.current = messages[messages.length - 1].id
    }
  }, [messages])

  useEffect(() => {
    if (!active) return
    const baseline = lastSeenId.current
    if (baseline === null) return
    const fresh = messages.filter((m) => m.id > baseline && m.kind === "message")
    if (!fresh.length) return
    lastSeenId.current = messages[messages.length - 1].id

    // Group a burst of identical (same sender + body) messages into one bubble.
    const grouped: FloatingBubble[] = []
    for (const m of fresh) {
      const prev = grouped[grouped.length - 1]
      if (prev && prev.userName === m.userName && prev.body === m.body) {
        prev.count += 1
      } else {
        seqRef.current += 1
        grouped.push({ key: `f${seqRef.current}`, userName: m.userName, body: m.body, count: 1 })
      }
    }

    setBubbles((cur) => [...cur, ...grouped].slice(-MAX_VISIBLE))

    const timers = grouped.map((g) =>
      setTimeout(() => setBubbles((cur) => cur.filter((b) => b.key !== g.key)), VISIBLE_MS),
    )
    return () => timers.forEach(clearTimeout)
  }, [messages, active])

  // Clear everything the moment the chat panel opens.
  useEffect(() => {
    if (!active) setBubbles([])
  }, [active])

  if (!active) return null

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-2 z-30 flex flex-col items-start gap-1.5 px-4">
      <AnimatePresence initial={false}>
        {bubbles.map((b) => (
          <motion.p
            key={b.key}
            layout
            initial={{ opacity: 0, y: 14, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -8, filter: "blur(4px)" }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
            className="max-w-[85%] text-sm leading-snug text-white"
            style={{ textShadow: "0 1px 6px rgba(0,0,0,0.65)" }}
          >
            <span className="font-semibold text-primary">{b.userName}</span>{" "}
            <span className="text-pretty">{b.body}</span>
            {b.count > 1 && <span className="ml-1 font-semibold text-white/60">×{b.count}</span>}
          </motion.p>
        ))}
      </AnimatePresence>
    </div>
  )
}
