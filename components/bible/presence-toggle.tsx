"use client"

// Premium Public/Private reading-privacy control shown beneath the reader
// presence indicator. Public = fellow readers can see you and start a chat;
// Private = you're invisible and undisturbed. An info button opens a beautiful
// explainer describing exactly what each mode does. Reads/writes the shared
// fellowship visibility state, so switching instantly changes presence.

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { Globe, Lock, Info, X, MessageCircle, EyeOff, Users } from "lucide-react"
import { cn } from "@/lib/utils"
import { useBibleFellowshipOptional } from "./fellowship-context"

export function BiblePresenceToggle() {
  const fellowship = useBibleFellowshipOptional()
  const [infoOpen, setInfoOpen] = useState(false)

  // Only meaningful for signed-in readers (the provider supplies context).
  if (!fellowship) return null

  const { visibility, setVisibility } = fellowship
  const isPrivate = visibility === "private"

  return (
    <div className="flex items-center justify-center gap-2">
      <div
        role="radiogroup"
        aria-label="Reading visibility"
        className="relative flex rounded-full border border-border/60 bg-secondary/40 p-1 backdrop-blur-sm"
      >
        {/* Sliding thumb — sits behind the two options and glides between them. */}
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-full bg-primary shadow-sm",
            "transition-transform duration-300 ease-out motion-reduce:transition-none",
            isPrivate && "translate-x-full",
          )}
        />
        {(
          [
            { value: "public", label: "Public", icon: Globe },
            { value: "private", label: "Private", icon: Lock },
          ] as const
        ).map((opt) => {
          const active = visibility === opt.value
          const Icon = opt.icon
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setVisibility(opt.value)}
              className={cn(
                "relative z-10 flex min-w-[92px] items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium",
                "transition-colors duration-200",
                active
                  ? "text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-3.5" />
              {opt.label}
            </button>
          )
        })}
      </div>

      {/* Info trigger — opens the explainer describing both modes. */}
      <button
        type="button"
        onClick={() => setInfoOpen(true)}
        className="tap-scale inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-border/60 bg-secondary/40 text-muted-foreground backdrop-blur-sm transition-colors hover:text-foreground"
        aria-label="What do public and private mode do?"
      >
        <Info className="size-4" />
      </button>

      {infoOpen && <PresenceInfoDialog onClose={() => setInfoOpen(false)} />}
    </div>
  )
}

function PresenceInfoDialog({ onClose }: { onClose: () => void }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  // Close on Escape and lock body scroll while open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  if (!mounted) return null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="presence-info-title"
      className="fixed inset-0 z-[80] flex items-end justify-center p-4 sm:items-center"
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-background/70 backdrop-blur-sm animate-in fade-in duration-200"
      />

      {/* Card */}
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-border bg-popover-solid p-6 text-popover-foreground shadow-2xl duration-300 animate-in fade-in slide-in-from-bottom-4 sm:zoom-in-95 sm:slide-in-from-bottom-0">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 id="presence-info-title" className="text-lg font-bold tracking-tight">
              Reading visibility
            </h2>
            <p className="mt-1 text-sm text-muted-foreground text-pretty">
              Choose whether other believers can join you while you read.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="tap-scale inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-secondary/60 text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-3">
          {/* Public */}
          <div className="rounded-2xl border border-border/70 bg-card p-4">
            <div className="flex items-center gap-2.5">
              <span className="flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Globe className="size-5" />
              </span>
              <h3 className="font-semibold">Public</h3>
            </div>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <Users className="mt-0.5 size-4 shrink-0 text-primary" />
                <span>Fellow readers can see you&apos;re reading and where.</span>
              </li>
              <li className="flex items-start gap-2">
                <MessageCircle className="mt-0.5 size-4 shrink-0 text-primary" />
                <span>They can start a chat with you as you read together.</span>
              </li>
            </ul>
          </div>

          {/* Private */}
          <div className="rounded-2xl border border-border/70 bg-card p-4">
            <div className="flex items-center gap-2.5">
              <span className="flex size-9 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Lock className="size-5" />
              </span>
              <h3 className="font-semibold">Private</h3>
            </div>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <EyeOff className="mt-0.5 size-4 shrink-0 text-foreground/70" />
                <span>No one can see that you&apos;re reading the Bible.</span>
              </li>
              <li className="flex items-start gap-2">
                <Lock className="mt-0.5 size-4 shrink-0 text-foreground/70" />
                <span>You won&apos;t receive chats or alerts — just you and the Word.</span>
              </li>
            </ul>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="tap-scale mt-5 w-full rounded-full bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-95"
        >
          Got it
        </button>
      </div>
    </div>,
    document.body,
  )
}
