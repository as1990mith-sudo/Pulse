"use client"

import { useState } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion } from "motion/react"
import { Check, Palette } from "lucide-react"
import { LIVE_THEMES, liveThemeStyle } from "@/lib/live-themes"
import { cn } from "@/lib/utils"

/**
 * Host-only theme picker for a Conversation room. Uses the exact same palette
 * set as the Podcast studio (`LIVE_THEMES`); the chosen theme retints the whole
 * room for the host and every participant (synced via getConversationState).
 */
export function ConversationThemeSheet({
  open,
  current,
  onSelect,
  onClose,
}: {
  open: boolean
  current: string
  onSelect: (id: string) => void
  onClose: () => void
}) {
  const [mounted] = useState(() => typeof document !== "undefined")
  if (!mounted) return null

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
          <motion.button
            type="button"
            aria-label="Close themes"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-md"
          />
          <motion.div
            initial={{ y: "100%", opacity: 0.6 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0.6 }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
            className="relative z-10 m-3 w-full max-w-sm overflow-hidden rounded-3xl border border-white/10 bg-zinc-900/95 p-5 text-white shadow-2xl backdrop-blur-xl"
          >
            <div className="mb-4 flex items-center gap-2">
              <span className="flex size-9 items-center justify-center rounded-xl bg-primary/15 text-primary">
                <Palette className="size-[18px]" />
              </span>
              <div>
                <h3 className="text-sm font-bold">Room theme</h3>
                <p className="text-xs text-white/55">Sets the mood for everyone in the room</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {LIVE_THEMES.map((t) => {
                const active = t.id === current
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => onSelect(t.id)}
                    aria-pressed={active}
                    className={cn(
                      "group relative overflow-hidden rounded-2xl p-3 text-left ring-1 ring-inset transition-all",
                      active ? "ring-2 ring-primary" : "ring-white/15 hover:ring-white/40",
                    )}
                    style={liveThemeStyle(t.id)}
                  >
                    <div className="mb-8 flex items-center gap-1.5">
                      <span className="size-6 rounded-full ring-1 ring-white/20" style={{ background: t.primary }} />
                      <span className="size-6 rounded-full ring-1 ring-white/20" style={{ background: t.accent }} />
                      {active && (
                        <span className="ml-auto flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                          <Check className="size-3.5" strokeWidth={3} />
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-semibold text-white drop-shadow">{t.name}</p>
                    <p className="mt-0.5 text-[11px] leading-snug text-white/70 drop-shadow">{t.description}</p>
                  </button>
                )
              })}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
