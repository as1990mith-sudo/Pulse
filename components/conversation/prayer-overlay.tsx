"use client"

import { useEffect, useState } from "react"
import { AnimatePresence, motion } from "motion/react"

/**
 * Full-room Prayer Mode overlay. Runs a 3-2-1 countdown into "Pray", then
 * settles into a calm ambient wash that stays until the host ends prayer.
 * Nobody is muted — this only sets the mood for corporate prayer.
 */
export function PrayerOverlay({ active, endedAt }: { active: boolean; endedAt: number | null }) {
  const [count, setCount] = useState(3)
  const [phase, setPhase] = useState<"count" | "pray">("count")

  // Restart the countdown each time prayer mode is (re)activated.
  useEffect(() => {
    if (!active) return
    setPhase("count")
    setCount(3)
    let n = 3
    const iv = setInterval(() => {
      n -= 1
      if (n <= 0) {
        clearInterval(iv)
        setPhase("pray")
      } else {
        setCount(n)
      }
    }, 1000)
    return () => clearInterval(iv)
  }, [active])

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6 }}
          className="pointer-events-none absolute inset-0 z-40 flex flex-col items-center justify-center overflow-hidden"
        >
          {/* Calm ambient wash */}
          <div
            aria-hidden="true"
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(80% 60% at 50% 30%, color-mix(in oklch, var(--primary) 34%, transparent), transparent 70%), linear-gradient(to bottom, rgba(9,9,11,0.72), rgba(9,9,11,0.92))",
            }}
          />
          <motion.div
            aria-hidden="true"
            className="absolute left-1/2 top-1/3 size-[42rem] -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ background: "radial-gradient(circle, color-mix(in oklch, var(--primary) 26%, transparent), transparent 60%)" }}
            animate={{ scale: [1, 1.12, 1], opacity: [0.5, 0.75, 0.5] }}
            transition={{ duration: 6, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
          />

          <div className="relative flex flex-col items-center gap-4 px-6 text-center">
            <motion.div
              initial={{ scale: 0.7, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
              className="text-4xl"
              aria-hidden="true"
            >
              🙏
            </motion.div>
            <h2 className="text-lg font-bold tracking-tight text-white">Prayer Mode</h2>
            <p className="max-w-xs text-pretty text-sm leading-relaxed text-white/70">Let us unite in prayer.</p>

            <div className="mt-2 flex h-24 items-center justify-center">
              <AnimatePresence mode="popLayout">
                {phase === "count" ? (
                  <motion.span
                    key={count}
                    initial={{ scale: 0.4, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 1.6, opacity: 0 }}
                    transition={{ duration: 0.5 }}
                    className="text-7xl font-black tabular-nums text-white"
                  >
                    {count}
                  </motion.span>
                ) : (
                  <motion.span
                    key="pray"
                    initial={{ scale: 0.6, opacity: 0, letterSpacing: "0.5em" }}
                    animate={{ scale: 1, opacity: 1, letterSpacing: "0.08em" }}
                    transition={{ type: "spring", stiffness: 220, damping: 18 }}
                    className="text-5xl font-black uppercase text-white"
                  >
                    Pray
                  </motion.span>
                )}
              </AnimatePresence>
            </div>

            {phase === "pray" && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="text-xs font-medium uppercase tracking-widest text-white/45"
              >
                Everyone is praying together
              </motion.p>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/**
 * Brief "Prayer has ended." confirmation shown once when prayer mode turns off.
 * `endedAt` is a timestamp that changes each time prayer ends, retriggering it.
 */
export function PrayerEndedToast({ endedAt }: { endedAt: number | null }) {
  const [show, setShow] = useState(false)
  useEffect(() => {
    if (!endedAt) return
    setShow(true)
    const t = setTimeout(() => setShow(false), 2600)
    return () => clearTimeout(t)
  }, [endedAt])

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          className="pointer-events-none absolute inset-x-0 top-24 z-40 flex justify-center px-6"
        >
          <span className="rounded-full bg-white/12 px-4 py-2 text-sm font-medium text-white backdrop-blur-md ring-1 ring-inset ring-white/15">
            Prayer has ended.
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
