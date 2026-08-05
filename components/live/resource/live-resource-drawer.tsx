"use client"

// The universal resource drawer: a bottom sheet listing the six resource types.
// Opening any entry launches its floating mini-panel and closes the drawer — the
// live keeps running underneath the whole time. Presented as a premium sheet
// (rounded top, soft backdrop blur, calm spring motion), not a full takeover.

import { AnimatePresence, motion } from "motion/react"
import { BookOpen, FileText, NotebookPen, Pin, X } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { useLiveResources, type ResourcePanelId } from "./resource-context"

type Entry = {
  id: ResourcePanelId
  label: string
  description: string
  icon: LucideIcon
}

const ENTRIES: Entry[] = [
  { id: "bible", label: "Bible", description: "Read & search scripture", icon: BookOpen },
  { id: "notes", label: "Live Notes", description: "Capture what you're learning", icon: NotebookPen },
  { id: "pdf", label: "PDFs & Documents", description: "Study handouts & guides", icon: FileText },
  { id: "pinned", label: "Pinned Resources", description: "Shared by the host", icon: Pin },
]

export function LiveResourceDrawer() {
  const { drawerOpen, closeDrawer, openPanel } = useLiveResources()

  return (
    <AnimatePresence>
      {drawerOpen && (
        <>
          <motion.div
            className="pointer-events-auto absolute inset-0 z-[20] bg-black/50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={closeDrawer}
            aria-hidden
          />
          <motion.div
            role="dialog"
            aria-label="Live resources"
            className="pointer-events-auto absolute inset-x-0 bottom-0 z-[21] mx-auto w-full max-w-md rounded-t-3xl border-t border-white/10 bg-zinc-950/95 p-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-2xl ring-1 ring-white/5 backdrop-blur-2xl"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 32 }}
          >
            <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-white/20" aria-hidden />
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-white text-balance">Resources</h2>
                <p className="text-sm text-white/50">Everything stays inside the live</p>
              </div>
              <button
                type="button"
                onClick={closeDrawer}
                aria-label="Close resources"
                className="flex size-9 items-center justify-center rounded-full bg-white/10 text-white/70 transition-colors hover:bg-white/15 hover:text-white"
              >
                <X className="size-5" />
              </button>
            </div>

            <ul className="grid grid-cols-1 gap-2">
              {ENTRIES.map((entry) => {
                const Icon = entry.icon
                return (
                  <li key={entry.id}>
                    <button
                      type="button"
                      onClick={() => openPanel(entry.id)}
                      className="flex w-full items-center gap-3.5 rounded-2xl border border-white/8 bg-white/[0.03] p-3.5 text-left transition-colors hover:border-white/15 hover:bg-white/[0.07]"
                    >
                      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                        <Icon className="size-5" strokeWidth={2.1} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] font-semibold text-white">{entry.label}</span>
                        <span className="block truncate text-[13px] text-white/45">{entry.description}</span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
