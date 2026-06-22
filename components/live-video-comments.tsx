"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import useSWR from "swr"
import { Send } from "lucide-react"
import { getLiveChat, sendLiveChat, type LiveChatMessageView } from "@/app/actions/live"
import { getAvatarColor, getInitials } from "@/lib/identity"
import { cn } from "@/lib/utils"

/**
 * TikTok-style live comment stream that floats over the bottom-left of a video
 * broadcast. Comments fade in from the bottom and gently fade out near the top
 * via a mask gradient. Polls the same DB-backed chat the audio rooms use.
 */
export function VideoCommentStream({ roomName, className }: { roomName?: string; className?: string }) {
  const listRef = useRef<HTMLUListElement>(null)
  const { data: messages = [] } = useSWR<LiveChatMessageView[]>(
    roomName ? ["live-chat", roomName] : null,
    () => getLiveChat({ roomName: roomName! }),
    { refreshInterval: 2000 },
  )

  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  // Only keep the most recent handful visible so the overlay stays light.
  const visible = messages.slice(-12)

  return (
    <div
      className={cn("pointer-events-none w-full max-w-[78%] sm:max-w-sm", className)}
      style={{
        maskImage: "linear-gradient(to top, black 70%, transparent)",
        WebkitMaskImage: "linear-gradient(to top, black 70%, transparent)",
      }}
    >
      <ul ref={listRef} className="flex max-h-56 flex-col gap-2 overflow-hidden">
        {visible.map((m) => (
          <li key={m.id} className="live-comment-in flex items-start gap-2">
            <span
              className={cn(
                "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white",
                getAvatarColor(m.userName),
              )}
              aria-hidden="true"
            >
              {getInitials(m.userName)}
            </span>
            <p className="rounded-2xl bg-black/35 px-3 py-1.5 text-sm leading-snug text-white/95 ring-1 ring-inset ring-white/10 backdrop-blur-md">
              <span className={cn("mr-1.5 font-semibold", m.isHost ? "text-live" : "text-white/70")}>
                {m.userName}
                {m.isHost && " (host)"}
              </span>
              {m.body}
            </p>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * Glassy comment composer pinned to the bottom of the video overlay. Sends to
 * the shared live chat so the comment appears in everyone's stream.
 */
export function VideoCommentComposer({
  roomName,
  placeholder = "Add a comment…",
  asHost = false,
  className,
}: {
  roomName?: string
  placeholder?: string
  asHost?: boolean
  className?: string
}) {
  const [draft, setDraft] = useState("")
  const [isPending, startTransition] = useTransition()

  function send(e: React.FormEvent) {
    e.preventDefault()
    const text = draft.trim()
    if (!text || !roomName) return
    setDraft("")
    startTransition(async () => {
      await sendLiveChat({ roomName, body: text }).catch(() => {})
    })
  }

  return (
    <form onSubmit={send} className={cn("flex items-center gap-2", className)}>
      <div className="flex flex-1 items-center rounded-full bg-black/35 pr-1 ring-1 ring-inset ring-white/15 backdrop-blur-md">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={asHost ? "Say something to the room…" : placeholder}
          aria-label="Add a comment"
          className="w-full bg-transparent px-4 py-2.5 text-sm text-white placeholder:text-white/50 focus:outline-none"
        />
        <button
          type="submit"
          disabled={!draft.trim() || isPending}
          aria-label="Send comment"
          className="mr-1 flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          <Send className="size-4" />
        </button>
      </div>
    </form>
  )
}
