"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { Users, X } from "lucide-react"
import type { HomeRosterMember } from "@/lib/home/access"
import { homeRoleLabel } from "@/lib/home/roles"

/**
 * The org hero's "Members" affordance: a count that reads as a link and opens a
 * roster of the organisation's Home members (owner first). Public-safe — it
 * shows names, avatars and roles only, never emails. Renders nothing when the
 * organisation has no members yet, so the hero stays clean for brand-new Homes.
 *
 * Presented as a bottom sheet that slides up from the bottom of the screen,
 * matching the app-wide comment sheet (same grabber, header and animation)
 * rather than a centre-screen dialog. The sheet hugs its content instead of
 * filling a fixed height, so a two-member Home doesn't open a mostly-empty
 * panel, and it stays inset from the edges on wider screens.
 */
export function OrgMembersDialog({ members }: { members: HomeRosterMember[] }) {
  const [open, setOpen] = useState(false)
  // Portals need the DOM; only render into document.body after mount (SSR-safe).
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Lock body scroll while open so only the roster scrolls.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  // Close on Escape for keyboard users.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open])

  if (members.length === 0) return null

  const count = members.length

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group inline-flex items-center gap-1 rounded-full px-1 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`View ${count} ${count === 1 ? "member" : "members"}`}
      >
        <span className="font-semibold text-foreground">{formatCount(count)}</span>
        <span className="underline-offset-2 group-hover:underline">{count === 1 ? "member" : "members"}</span>
      </button>

      {open &&
        mounted &&
        createPortal(
          // Portaled to <body> so `fixed` anchors to the viewport rather than a
          // transformed hero ancestor, letting the sheet rise from the bottom.
          <div className="fixed inset-0 z-[70] flex flex-col justify-end" data-no-swipe>
            <button
              type="button"
              aria-label="Close members"
              onClick={() => setOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-[2px] animate-in fade-in duration-200"
            />

            <div className="relative mx-auto flex w-full max-h-[70%] flex-col rounded-t-[1.75rem] border-t border-border bg-background text-foreground shadow-2xl animate-in slide-in-from-bottom duration-300 ease-out sm:max-w-md sm:rounded-b-[1.75rem] sm:border">
              {/* Grabber + title row. The count sits immediately beside the
                  members icon so the two read as one unit, keeping it clear of
                  the close button in the corner. */}
              <header className="relative shrink-0 px-4 pt-2.5">
                <span
                  className="mx-auto mb-2.5 block h-1 w-9 rounded-full bg-muted-foreground/30"
                  aria-hidden="true"
                  onClick={() => setOpen(false)}
                />
                <div className="flex items-center justify-center pb-3">
                  <div className="flex items-center gap-2">
                    <Users className="size-[18px] text-muted-foreground" />
                    <h2 className="text-[15px] font-semibold tracking-tight">
                      {count} {count === 1 ? "member" : "members"}
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label="Close"
                    className="absolute right-3 top-3 flex size-8 items-center justify-center rounded-full bg-secondary text-muted-foreground transition-colors hover:bg-secondary/80 hover:text-foreground"
                  >
                    <X className="size-[18px]" />
                  </button>
                </div>
                <div className="h-px w-full bg-gradient-to-r from-transparent via-border to-transparent" />
              </header>

              <ul className="flex-1 overflow-y-auto overscroll-contain p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
                {members.map((m) => (
                  <li key={m.userId} className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-muted/50">
                    {m.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={m.image || "/placeholder.svg"}
                        alt=""
                        className="size-9 shrink-0 rounded-full object-cover"
                      />
                    ) : (
                      <span
                        className="flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                        style={{ backgroundColor: m.color }}
                      >
                        {m.initials}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{m.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{homeRoleLabel(m.role)}</span>
                    </span>
                    {m.isOwner && (
                      <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                        Owner
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}K`
  return String(n)
}
