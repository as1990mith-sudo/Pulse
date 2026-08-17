"use client"

import { useState } from "react"
import { PartyPopper, X } from "lucide-react"
import type { HomeView } from "@/lib/home/types"
import { homeRoleLabel, type HomeRole } from "@/lib/home/roles"
import { homeAccentStyle } from "@/lib/home/accent"

// Shown right after a Home is created (or a member joins). Dismissible; purely
// celebratory so it doesn't clutter the overview on repeat visits.
export function WelcomeBanner({ home, role }: { home: HomeView; role: HomeRole }) {
  const [open, setOpen] = useState(true)
  if (!open) return null
  return (
    <div
      className="relative mt-5 overflow-hidden rounded-2xl border border-border/60 p-5"
      style={{
        ...homeAccentStyle(home),
        backgroundColor: "color-mix(in oklab, var(--home-accent) 12%, transparent)",
      }}
    >
      <button
        type="button"
        onClick={() => setOpen(false)}
        aria-label="Dismiss"
        className="absolute right-3 top-3 rounded-full p-1 text-muted-foreground transition-colors hover:bg-background/60 hover:text-foreground"
      >
        <X className="size-4" />
      </button>
      <div className="flex items-start gap-3">
        <span
          className="flex size-10 shrink-0 items-center justify-center rounded-xl text-white"
          style={{ backgroundColor: "var(--home-accent)" }}
        >
          <PartyPopper className="size-5" />
        </span>
        <div>
          <p className="text-base font-bold tracking-tight text-balance">Welcome to {home.name}</p>
          <p className="mt-1 text-sm leading-relaxed text-foreground/75 text-pretty">
            You're in as {homeRoleLabel(role)}. This is your organisation's private home — everything here stays between
            your members.
          </p>
        </div>
      </div>
    </div>
  )
}
