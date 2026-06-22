"use client"

import { useState } from "react"
import { ArrowLeft, LogOut, Minimize2 } from "lucide-react"

/**
 * Back control for a live room. While the session is active it opens a small
 * menu offering the primary exit action (End / Leave) plus Minimise. When the
 * session is no longer active it acts as a plain back button that exits.
 */
export function BackExitMenu({
  exitLabel,
  onExit,
  onMinimize,
  showMenu,
}: {
  exitLabel: string
  onExit: () => void
  onMinimize: () => void
  showMenu: boolean
}) {
  const [open, setOpen] = useState(false)

  if (!showMenu) {
    return (
      <button
        type="button"
        onClick={onExit}
        aria-label="Back"
        className="relative flex size-10 shrink-0 items-center justify-center rounded-full bg-white/15 text-white ring-1 ring-inset ring-white/15 transition-colors hover:bg-white/25"
      >
        <ArrowLeft className="size-5" strokeWidth={2.75} />
      </button>
    )
  }

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Back options"
        aria-expanded={open}
        className="relative flex size-10 items-center justify-center rounded-full bg-white/15 text-white ring-1 ring-inset ring-white/15 transition-colors hover:bg-white/25"
      >
        <ArrowLeft className="size-5" strokeWidth={2.75} />
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div
            role="menu"
            className="absolute left-0 top-full z-50 mt-2 w-48 overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/95 p-1 shadow-2xl ring-1 ring-black/50 backdrop-blur-xl"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false)
                onMinimize()
              }}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/10"
            >
              <Minimize2 className="size-4" strokeWidth={2.5} /> Minimise
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false)
                onExit()
              }}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold text-live transition-colors hover:bg-live/15"
            >
              <LogOut className="size-4" strokeWidth={2.5} /> {exitLabel}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
