"use client"

import { useEffect, useRef, useState } from "react"
import useSWR from "swr"
import { Gift, Smile, X } from "lucide-react"
import { getLiveReactions, sendLiveReaction, type LiveReactionView } from "@/app/actions/live"
import { cn } from "@/lib/utils"

export const QUICK_REACTIONS = ["❤️", "👏", "🔥", "😂", "🙌", "💯"]

export const VIRTUAL_GIFTS: { emoji: string; label: string }[] = [
  { emoji: "🌹", label: "Rose" },
  { emoji: "🎉", label: "Party" },
  { emoji: "☕", label: "Coffee" },
  { emoji: "💎", label: "Diamond" },
  { emoji: "👑", label: "Crown" },
  { emoji: "🚀", label: "Rocket" },
  { emoji: "🏆", label: "Trophy" },
  { emoji: "🎁", label: "Gift" },
]

type FloatingItem = {
  key: string
  emoji: string
  kind: "reaction" | "gift"
  userName: string
  left: number
  rot: number
}

/**
 * Polls the room's reactions and floats each new one up over the stage so the
 * whole room sees the same reaction/gift in near real time.
 */
export function ReactionLayer({ roomName }: { roomName?: string }) {
  const lastIdRef = useRef<number>(0)
  const seededRef = useRef(false)
  const [items, setItems] = useState<FloatingItem[]>([])

  const { data } = useSWR<LiveReactionView[]>(
    roomName ? ["live-reactions", roomName] : null,
    () => getLiveReactions({ roomName: roomName!, afterId: lastIdRef.current || undefined }),
    { refreshInterval: 1500 },
  )

  useEffect(() => {
    if (!data || data.length === 0) return
    const fresh = data.filter((r) => r.id > lastIdRef.current)
    if (fresh.length === 0) return
    lastIdRef.current = Math.max(lastIdRef.current, ...fresh.map((r) => r.id))

    // On first load just sync the cursor — don't replay the whole backlog.
    if (!seededRef.current) {
      seededRef.current = true
      return
    }

    const additions: FloatingItem[] = fresh.map((r) => ({
      key: `${r.id}-${Math.random().toString(36).slice(2)}`,
      emoji: r.emoji,
      kind: r.kind,
      userName: r.userName,
      left: 8 + Math.random() * 78,
      rot: Math.random() * 24 - 12,
    }))
    setItems((cur) => [...cur, ...additions].slice(-24))

    // Clear each item after its animation completes.
    additions.forEach((a) => {
      setTimeout(() => setItems((cur) => cur.filter((i) => i.key !== a.key)), 2800)
    })
  }, [data])

  return (
    <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden" aria-hidden="true">
      {items.map((i) => (
        <div
          key={i.key}
          className="reaction-float absolute bottom-6 flex flex-col items-center"
          style={{ left: `${i.left}%`, ["--reaction-rot" as string]: `${i.rot}deg` }}
        >
          <span className={cn("drop-shadow-lg", i.kind === "gift" ? "text-4xl" : "text-3xl")}>{i.emoji}</span>
          {i.kind === "gift" && (
            <span className="mt-0.5 max-w-20 truncate rounded-full bg-card/90 px-1.5 py-0.5 text-[9px] font-medium text-foreground">
              {i.userName}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

/**
 * Compact reaction + gift sender. Shows a quick reaction row and an expandable
 * gift tray. Calls the server so the reaction broadcasts to everyone.
 */
export function ReactionPicker({
  roomName,
  disabled = false,
  showGifts = true,
  className,
}: {
  roomName?: string
  disabled?: boolean
  /** When false, only emoji reactions are offered (no virtual gifts). */
  showGifts?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<"reactions" | "gifts">("reactions")

  async function send(emoji: string, kind: "reaction" | "gift", label?: string) {
    if (!roomName) return
    await sendLiveReaction({ roomName, emoji, kind, label }).catch(() => {})
  }

  return (
    <>
      <button
        type="button"
        disabled={disabled || !roomName}
        onClick={() => setOpen(true)}
        aria-label={showGifts ? "Send a reaction or gift" : "Send a reaction"}
        className={cn(
          "flex size-11 items-center justify-center rounded-full bg-secondary text-foreground transition-colors hover:bg-secondary/80 disabled:opacity-50",
          className,
        )}
      >
        <Smile className="size-5" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="relative z-10 w-full rounded-t-2xl border border-border/60 bg-card p-4 sm:max-w-sm sm:rounded-2xl">
            <div className="mb-3 flex items-center justify-between">
              {showGifts ? (
                <div className="flex gap-1 rounded-full bg-secondary p-1">
                  <button
                    type="button"
                    onClick={() => setTab("reactions")}
                    className={cn(
                      "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
                      tab === "reactions" ? "bg-primary text-primary-foreground" : "text-muted-foreground",
                    )}
                  >
                    Reactions
                  </button>
                  <button
                    type="button"
                    onClick={() => setTab("gifts")}
                    className={cn(
                      "flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold transition-colors",
                      tab === "gifts" ? "bg-primary text-primary-foreground" : "text-muted-foreground",
                    )}
                  >
                    <Gift className="size-3.5" /> Gifts
                  </button>
                </div>
              ) : (
                <span className="text-sm font-semibold text-foreground">Send a reaction</span>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary"
              >
                <X className="size-4" />
              </button>
            </div>

            {!showGifts || tab === "reactions" ? (
              <div className="grid grid-cols-6 gap-2">
                {QUICK_REACTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => void send(emoji, "reaction")}
                    className="flex aspect-square items-center justify-center rounded-xl bg-secondary text-2xl transition-transform hover:scale-110 active:scale-95"
                    aria-label={`Send ${emoji} reaction`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {VIRTUAL_GIFTS.map((g) => (
                  <button
                    key={g.label}
                    type="button"
                    onClick={() => void send(g.emoji, "gift", g.label)}
                    className="flex flex-col items-center gap-1 rounded-xl bg-secondary px-1 py-2 transition-transform hover:scale-105 active:scale-95"
                    aria-label={`Send ${g.label} gift`}
                  >
                    <span className="text-2xl">{g.emoji}</span>
                    <span className="text-[10px] font-medium text-muted-foreground">{g.label}</span>
                  </button>
                ))}
              </div>
            )}
            <p className="mt-3 text-center text-[11px] text-muted-foreground">Everyone in the room sees your reaction.</p>
          </div>
        </div>
      )}
    </>
  )
}
