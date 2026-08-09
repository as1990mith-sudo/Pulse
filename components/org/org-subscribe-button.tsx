"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Bell, BellOff, Check, Plus } from "lucide-react"
import { toggleSubscribe, setSubscriptionNotify } from "@/app/actions/organizations"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * Subscribe / Subscribed toggle for an organisation, plus an inline notify
 * toggle that appears once subscribed. "Subscribe" is the org-facing equivalent
 * of Follow. Optimistic UI with a transition so it feels instant.
 */
export function OrgSubscribeButton({
  organizationId,
  initialSubscribed,
  initialNotify,
  showNotify = true,
  compact = false,
  className,
}: {
  organizationId: string
  initialSubscribed: boolean
  initialNotify: boolean
  showNotify?: boolean
  /** Smaller height/text so it can sit inline with other header actions. */
  compact?: boolean
  className?: string
}) {
  const router = useRouter()
  const [subscribed, setSubscribed] = useState(initialSubscribed)
  const [notify, setNotify] = useState(initialNotify)
  const [pending, startTransition] = useTransition()

  function onToggle() {
    const next = !subscribed
    setSubscribed(next)
    if (next) setNotify(true)
    startTransition(async () => {
      try {
        await toggleSubscribe({ organizationId, subscribe: next })
        router.refresh()
      } catch {
        setSubscribed(!next) // revert on failure
      }
    })
  }

  function onToggleNotify() {
    const next = !notify
    setNotify(next)
    startTransition(async () => {
      try {
        await setSubscriptionNotify({ organizationId, notify: next })
      } catch {
        setNotify(!next)
      }
    })
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Button
        type="button"
        onClick={onToggle}
        disabled={pending}
        variant={subscribed ? "outline" : "default"}
        className={cn("flex-1 rounded-full font-semibold", compact ? "h-9 px-3 text-xs" : "h-10 text-sm")}
      >
        {subscribed ? (
          <>
            <Check className="size-4" /> Subscribed
          </>
        ) : (
          <>
            <Plus className="size-4" /> Subscribe
          </>
        )}
      </Button>

      {showNotify && subscribed && (
        <button
          type="button"
          onClick={onToggleNotify}
          disabled={pending}
          aria-label={notify ? "Turn off notifications" : "Turn on notifications"}
          aria-pressed={notify}
          className={cn(
            "flex shrink-0 items-center justify-center rounded-full border transition-colors",
            compact ? "size-9" : "size-10",
            notify
              ? "border-primary bg-primary/10 text-primary"
              : "border-border/60 text-muted-foreground hover:text-foreground",
          )}
        >
          {notify ? <Bell className="size-4" /> : <BellOff className="size-4" />}
        </button>
      )}
    </div>
  )
}
