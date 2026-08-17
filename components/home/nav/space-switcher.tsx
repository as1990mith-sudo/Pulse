"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { AnimatePresence, motion } from "motion/react"
import { Check, ChevronsUpDown, Globe, Plus } from "lucide-react"
import { DEFAULT_HOME_ACCENT } from "@/lib/home/accent"
import { cn } from "@/lib/utils"

// A space the viewer can switch into. `handle` null ⇒ Frequency Universal (the
// public platform at "/"); otherwise a private Home at "/home/[handle]".
export type SpaceLink = {
  handle: string | null
  name: string
  logo: string | null
  initials: string
  accent: string
}

function SpaceMark({ space, size = 40 }: { space: SpaceLink; size?: number }) {
  if (space.handle === null) {
    return (
      <span
        className="flex shrink-0 items-center justify-center rounded-xl bg-foreground text-background"
        style={{ width: size, height: size }}
      >
        <Globe style={{ width: size * 0.5, height: size * 0.5 }} />
      </span>
    )
  }
  return (
    <span
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-xl text-sm font-bold text-white"
      style={{ width: size, height: size, backgroundColor: space.accent }}
    >
      {space.logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={space.logo || "/placeholder.svg"} alt="" className="size-full object-cover" />
      ) : (
        space.initials
      )}
    </span>
  )
}

/**
 * The "MY SPACES" context switcher. Makes the CURRENT space unmistakable and
 * lets a member who belongs to several organisations (plus Frequency Universal)
 * move between them. Switching routes to the new space — an intentional
 * "entering another space" gesture, not a feed filter — with a soft transition.
 */
export function SpaceSwitcher({
  current,
  spaces,
}: {
  current: SpaceLink
  spaces: SpaceLink[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open])

  function go(space: SpaceLink) {
    setOpen(false)
    if (space.handle === current.handle) return
    router.push(space.handle === null ? "/" : `/home/${space.handle}`)
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="group flex w-full items-center gap-3 rounded-2xl border border-border/60 bg-card/60 px-3 py-2.5 text-left transition-colors hover:bg-card"
      >
        <SpaceMark space={current} />
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            My space
          </span>
          <span className="block truncate text-sm font-semibold text-foreground">{current.name}</span>
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              className="fixed inset-0 z-40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
            />
            <motion.div
              role="menu"
              initial={{ opacity: 0, y: -8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 420, damping: 32 }}
              className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-border/60 bg-popover p-1.5 shadow-2xl"
            >
              <p className="px-2.5 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                My spaces
              </p>
              <div className="max-h-[min(60vh,420px)] space-y-0.5 overflow-y-auto">
                {spaces.map((s) => {
                  const active = s.handle === current.handle
                  return (
                    <button
                      key={s.handle ?? "universal"}
                      type="button"
                      role="menuitem"
                      onClick={() => go(s)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors",
                        active ? "bg-secondary" : "hover:bg-secondary/60",
                      )}
                    >
                      <SpaceMark space={s} size={36} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-foreground">{s.name}</span>
                        <span className="block text-xs text-muted-foreground">
                          {s.handle === null ? "The public platform" : "Private home"}
                        </span>
                      </span>
                      {active && <Check className="size-4 shrink-0" style={{ color: current.accent }} />}
                    </button>
                  )
                })}
              </div>
              <div className="mt-1 border-t border-border/60 pt-1">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false)
                    router.push("/home")
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
                >
                  <span className="flex size-9 items-center justify-center rounded-xl border border-dashed border-border">
                    <Plus className="size-4" />
                  </span>
                  Find or join a home
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

export { SpaceMark }
export const FALLBACK_ACCENT = DEFAULT_HOME_ACCENT
