"use client"

// A gentle, premium alert that floats in from the top of the Bible page when a
// fellow reader (someone also reading the Bible right now) sends a message.
// Tapping it opens the floating chat; it auto-dismisses after a short while so
// it never distracts from Scripture. Renders via a portal above the page.

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { BookOpen, MessageCircle, X } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { getAvatarColor, getInitials } from "@/lib/identity"
import { haptic } from "@/lib/haptics"
import { useBibleFellowship } from "./fellowship-context"

// How long the alert lingers before quietly dismissing itself.
const AUTO_DISMISS_MS = 7000

export function BibleMessagePing() {
  const { messagePing, dismissMessagePing, openChat } = useBibleFellowship()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  // Auto-dismiss timer, reset whenever a new ping arrives.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!messagePing) return
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => dismissMessagePing(), AUTO_DISMISS_MS)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [messagePing, dismissMessagePing])

  if (!mounted || !messagePing) return null

  const ping = messagePing

  const open = () => {
    haptic("light")
    openChat({ userId: ping.userId, name: ping.name, image: ping.image })
    dismissMessagePing()
  }

  return createPortal(
    <div
      className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top,0px)+4.5rem)] z-[55] flex justify-center px-4"
      role="alert"
      aria-live="polite"
    >
      <div className="pointer-events-auto w-full max-w-sm duration-300 animate-in fade-in slide-in-from-top-4">
        <div className="flex items-stretch gap-3 rounded-2xl border border-border/70 bg-card/90 p-3 shadow-2xl backdrop-blur-2xl">
          <button
            type="button"
            onClick={open}
            className="flex min-w-0 flex-1 items-center gap-3 text-left"
            aria-label={`Open message from ${ping.name}`}
          >
            <div className="relative shrink-0">
              <Avatar className="size-11 border border-border/60">
                <AvatarImage src={ping.image ?? undefined} alt="" />
                <AvatarFallback className={getAvatarColor(ping.userId)}>
                  {getInitials(ping.name)}
                </AvatarFallback>
              </Avatar>
              {/* Little chat glyph marking this as an incoming message. */}
              <span className="absolute -bottom-1 -right-1 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground ring-2 ring-card">
                <MessageCircle className="size-3" />
              </span>
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-semibold text-foreground">{ping.name}</span>
                <span className="shrink-0 text-[11px] text-muted-foreground">now</span>
              </div>
              <p className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-primary">
                <BookOpen className="size-3 shrink-0" />
                <span className="truncate">
                  Reading {ping.book} {ping.chapter}
                </span>
              </p>
              <p className="mt-0.5 truncate text-sm text-muted-foreground">{ping.preview}</p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              haptic("light")
              dismissMessagePing()
            }}
            aria-label="Dismiss notification"
            className="flex size-8 shrink-0 items-center justify-center self-start rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
