"use client"

import { useEffect, useState } from "react"

type Remaining = { days: number; hours: number; mins: number; secs: number }

function diff(target: number): Remaining {
  const ms = Math.max(0, target - Date.now())
  const s = Math.floor(ms / 1000)
  return {
    days: Math.floor(s / 86400),
    hours: Math.floor((s % 86400) / 3600),
    mins: Math.floor((s % 3600) / 60),
    secs: s % 60,
  }
}

const PAD = (n: number) => String(n).padStart(2, "0")

/**
 * Live countdown to the event start. Renders nothing meaningful until mounted
 * (starts `null`) so server and first client paint agree — a ticking clock in
 * SSR HTML would otherwise hydrate-mismatch every second.
 */
export function Countdown({ targetISO }: { targetISO: string }) {
  const target = new Date(targetISO).getTime()
  const [t, setT] = useState<Remaining | null>(null)

  useEffect(() => {
    setT(diff(target))
    const id = setInterval(() => setT(diff(target)), 1000)
    return () => clearInterval(id)
  }, [target])

  const cells: Array<{ label: string; value: string }> = [
    { label: "Days", value: t ? PAD(t.days) : "--" },
    { label: "Hours", value: t ? PAD(t.hours) : "--" },
    { label: "Mins", value: t ? PAD(t.mins) : "--" },
    { label: "Secs", value: t ? PAD(t.secs) : "--" },
  ]

  const done = t && t.days + t.hours + t.mins + t.secs === 0

  return (
    <section className="px-5">
      <div className="relative overflow-hidden rounded-[22px] border border-white/[0.07] bg-[#0B0B0B] p-6">
        {/* atmospheric amber glow bleeding from the top edge */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-16 left-1/2 h-40 w-72 -translate-x-1/2 rounded-full blur-[70px]"
          style={{ backgroundColor: "var(--home-accent, #FF7A1A)", opacity: 0.2 }}
        />
        <p
          className="relative text-center text-[11px] font-medium uppercase tracking-[0.28em]"
          style={{ color: "var(--home-accent, #FF9D4D)" }}
        >
          {done ? "The night has begun" : "Event starts in"}
        </p>
        <div className="relative mt-5 grid grid-cols-4 gap-2.5">
          {cells.map((c) => (
            <div
              key={c.label}
              className="flex flex-col items-center rounded-2xl border border-white/[0.06] bg-white/[0.02] py-4"
            >
              <span
                className="font-serif text-[32px] font-semibold leading-none text-white tabular-nums"
                style={{ fontFamily: "var(--font-playfair)" }}
              >
                {c.value}
              </span>
              <span className="mt-2 text-[10px] uppercase tracking-[0.18em] text-[#71717A]">{c.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
