"use client"

import { useState } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion } from "motion/react"
import { Check, ImageIcon } from "lucide-react"
import { CHAT_BACKGROUNDS, chatBackgroundSwatchStyle } from "@/lib/chat-backgrounds"
import { cn } from "@/lib/utils"

/**
 * Bottom-sheet wallpaper picker for a single conversation. Mirrors the visual
 * language of the room theme sheet: a dark rounded sheet with a grid of tappable
 * swatches (default dark surface + 3 gradients + 7 blurred photos). The choice
 * is scoped to this thread only (the caller persists it per conversation id).
 */
export function ChatBackgroundSheet({
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
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="Change chat background"
        >
          <motion.button
            type="button"
            aria-label="Close background picker"
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
                <ImageIcon className="size-[18px]" />
              </span>
              <div>
                <h3 className="text-sm font-bold">Chat background</h3>
                <p className="text-xs text-white/55">Only changes this conversation</p>
              </div>
            </div>

            <div className="grid max-h-[52vh] grid-cols-3 gap-3 overflow-y-auto overscroll-contain pr-0.5">
              {CHAT_BACKGROUNDS.map((bg) => {
                const active = bg.id === current
                return (
                  <button
                    key={bg.id}
                    type="button"
                    onClick={() => onSelect(bg.id)}
                    aria-pressed={active}
                    aria-label={bg.label}
                    className={cn(
                      "group relative flex aspect-[3/4] flex-col justify-end overflow-hidden rounded-2xl p-2 text-left ring-1 ring-inset transition-all",
                      active ? "ring-2 ring-primary" : "ring-white/15 hover:ring-white/40",
                      bg.kind === "default" && "bg-zinc-800",
                    )}
                    style={chatBackgroundSwatchStyle(bg)}
                  >
                    {/* Legibility scrim so the label reads on bright photos. */}
                    <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                    {active && (
                      <span className="absolute right-1.5 top-1.5 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <Check className="size-3.5" strokeWidth={3} />
                      </span>
                    )}
                    <span className="relative text-[11px] font-semibold text-white drop-shadow">{bg.label}</span>
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
