"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
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
  const [mounted, setMounted] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  useEffect(() => setMounted(true), [])

  // Anchor the portaled menu just below the trigger. Recomputed whenever it
  // opens so it tracks the button's real viewport position.
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return
    const r = triggerRef.current.getBoundingClientRect()
    setPos({ top: r.bottom + 8, left: r.left })
  }, [open])

  if (!showMenu) {
    return (
      <button
        type="button"
        onClick={onExit}
        aria-label="Back"
        className="relative flex size-10 shrink-0 items-center justify-center rounded-full bg-black/40 text-white ring-1 ring-inset ring-white/10 backdrop-blur-md transition-colors hover:bg-black/55"
      >
        <ArrowLeft className="size-5" strokeWidth={2.5} />
      </button>
    )
  }

  return (
    <div className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Back options"
        aria-expanded={open}
        className="relative flex size-10 items-center justify-center rounded-full bg-black/40 text-white ring-1 ring-inset ring-white/10 backdrop-blur-md transition-colors hover:bg-black/55"
      >
        <ArrowLeft className="size-5" strokeWidth={2.5} />
      </button>
      {open &&
        mounted &&
        pos &&
        createPortal(
        <>
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-[110] cursor-default"
          />
          <div
            role="menu"
            style={{ top: pos.top, left: pos.left }}
            className="fixed z-[120] w-48 overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/95 p-1 shadow-2xl ring-1 ring-black/50 backdrop-blur-xl"
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
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/10"
            >
              <LogOut className="size-4" strokeWidth={2.5} /> {exitLabel}
            </button>
          </div>
        </>,
        document.body,
      )}
    </div>
  )
}
