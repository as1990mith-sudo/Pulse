"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import useSWR from "swr"
import { Check, Clock, DoorOpen, Loader2, UserPlus } from "lucide-react"
import { getHomeJoinState } from "@/app/actions/discovery"
import { joinDiscoverableHome, setActiveHome } from "@/app/actions/home"
import { haptic } from "@/lib/haptics"
import { cn } from "@/lib/utils"

/**
 * Join affordance on a Home's public profile, for a viewer who is NOT the owner.
 * Self-contained: it resolves the viewer's join state for this handle and shows
 * the correct action. It only appears for DISCOVERABLE Homes — a private Home
 * returns discoverable:false and this renders nothing, so discovery never leaks
 * a join path the Home didn't opt into. "Discoverable" is not "open": an
 * approval-policy Home turns a Join into a pending request rather than instant
 * membership. Access rules are enforced server-side in joinDiscoverableHome;
 * this button only reflects them.
 */
export function HomeJoinButton({ handle, className }: { handle: string; className?: string }) {
  const router = useRouter()
  const { data, isLoading, mutate } = useSWR(["home-join-state", handle], () => getHomeJoinState(handle), {
    revalidateOnFocus: false,
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Nothing to show until we know the Home is discoverable. A private Home, a
  // missing Home, or the owner's own view all render no discovery CTA.
  if (isLoading) {
    return <div className={cn("h-11 w-full animate-pulse rounded-full bg-secondary/60", className)} aria-hidden />
  }
  if (!data || !data.discoverable || data.relation === "owner") return null

  async function enter() {
    setBusy(true)
    try {
      await setActiveHome(handle)
      router.push("/feed")
      router.refresh()
    } catch {
      setBusy(false)
    }
  }

  async function join() {
    setBusy(true)
    setError(null)
    haptic("medium")
    try {
      const res = await joinDiscoverableHome(handle)
      await mutate()
      if (res.status === "joined" || res.status === "already_member") {
        // Instant membership (auto policy) — drop the new member straight into
        // the Home they just joined.
        router.push("/feed")
        router.refresh()
      } else {
        // Approval policy — the request is now pending; the button reflects it.
        setBusy(false)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't join this Home.")
      setBusy(false)
    }
  }

  // Already a member → offer to enter the Home.
  if (data.relation === "member") {
    return (
      <button
        type="button"
        onClick={enter}
        disabled={busy}
        className={cn(
          "inline-flex h-11 items-center justify-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-[0.98] disabled:opacity-70",
          className,
        )}
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <DoorOpen className="size-4 shrink-0" />}
        Open Home
      </button>
    )
  }

  // Pending approval → informative, non-actionable.
  if (data.relation === "pending") {
    return (
      <div
        className={cn(
          "inline-flex h-11 items-center justify-center gap-2 rounded-full border border-border/70 bg-secondary/50 px-5 text-sm font-semibold text-muted-foreground",
          className,
        )}
      >
        <Clock className="size-4 shrink-0" />
        Request pending
      </div>
    )
  }

  // Not a member yet → Join. Approval-policy Homes get a clarifying label.
  const needsApproval = data.joinPolicy !== "auto"
  return (
    <div className={cn("flex flex-col items-stretch gap-1.5", className)}>
      <button
        type="button"
        onClick={join}
        disabled={busy}
        className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-[0.98] disabled:opacity-70"
      >
        {busy ? (
          <Loader2 className="size-4 animate-spin" />
        ) : needsApproval ? (
          <Check className="size-4 shrink-0" />
        ) : (
          <UserPlus className="size-4 shrink-0" />
        )}
        {needsApproval ? "Request to join" : "Join Home"}
      </button>
      {needsApproval && !error && (
        <span className="text-center text-xs text-muted-foreground">Joining needs admin approval</span>
      )}
      {error && <span className="text-center text-xs font-medium text-destructive">{error}</span>}
    </div>
  )
}
