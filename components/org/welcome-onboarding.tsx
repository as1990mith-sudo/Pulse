"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Check, Plus, Radio, Sparkles } from "lucide-react"
import { completeOnboarding, toggleSubscribe, type DiscoverOrganizationView } from "@/app/actions/organizations"
import { AvatarWithBadge } from "@/components/org/verified-badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function WelcomeOnboarding({ orgs, name }: { orgs: DiscoverOrganizationView[]; name: string }) {
  const router = useRouter()
  const [subscribed, setSubscribed] = useState<Set<string>>(
    () => new Set(orgs.filter((o) => o.isSubscribed).map((o) => o.id)),
  )
  const [finishing, startFinish] = useTransition()

  const count = subscribed.size
  // Suggest the strongest candidates first (discover already ranks them), but
  // hide the user's own organisation if they somehow own one.
  const suggestions = useMemo(() => orgs.filter((o) => !o.isOwner).slice(0, 24), [orgs])

  function toggle(id: string) {
    setSubscribed((prev) => {
      const next = new Set(prev)
      const willSubscribe = !next.has(id)
      if (willSubscribe) next.add(id)
      else next.delete(id)
      // Fire-and-forget the write; the optimistic Set drives the UI.
      void toggleSubscribe({ organizationId: id, subscribe: willSubscribe }).catch(() => {})
      return next
    })
  }

  function finish() {
    startFinish(async () => {
      await completeOnboarding()
      router.push("/feed")
      router.refresh()
    })
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 pb-32 pt-8 sm:px-6">
      <div className="mb-6">
        <span className="mb-4 inline-flex size-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
          <Radio className="size-5" />
        </span>
        <h1 className="text-2xl font-bold tracking-tight text-balance">
          {name ? `Welcome, ${name}` : "Welcome to Frequency"}
        </h1>
        <p className="mt-1.5 text-pretty text-sm leading-relaxed text-muted-foreground">
          Your feed is built from the ministries you follow. Subscribe to a few to get started — you can always find
          more later in Discover.
        </p>
      </div>

      {suggestions.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-muted/30 px-6 py-16 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-secondary text-muted-foreground">
            <Sparkles className="size-6" />
          </span>
          <p className="font-medium">No ministries to show yet</p>
          <p className="max-w-sm text-pretty text-sm text-muted-foreground">
            New organisations are joining Frequency. You can continue and explore the feed.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {suggestions.map((org) => {
            const isOn = subscribed.has(org.id)
            return (
              <button
                key={org.id}
                type="button"
                onClick={() => toggle(org.id)}
                aria-pressed={isOn}
                className={cn(
                  "flex items-center gap-3 rounded-2xl border p-3 text-left transition-all",
                  isOn
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "border-border/60 bg-card hover:border-border hover:bg-muted/40",
                )}
              >
                <AvatarWithBadge verified={org.verified} badgeSize="sm">
                  <span
                    className={cn(
                      "flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full text-sm font-semibold",
                      !org.logo && org.color,
                    )}
                  >
                    {org.logo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={org.logo || "/placeholder.svg"} alt="" className="size-full object-cover" />
                    ) : (
                      org.initials
                    )}
                  </span>
                </AvatarWithBadge>

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{org.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {org.categoryLabel}
                    {org.locationLabel ? ` · ${org.locationLabel}` : ""}
                  </span>
                </span>

                <span
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-full border transition-colors",
                    isOn ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground",
                  )}
                  aria-hidden
                >
                  {isOn ? <Check className="size-4" /> : <Plus className="size-4" />}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {/* Sticky action bar */}
      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-border/60 bg-background/85 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl sm:px-6">
        <div className="mx-auto flex w-full max-w-2xl items-center gap-3">
          <button
            type="button"
            onClick={finish}
            disabled={finishing}
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Skip for now
          </button>
          <Button
            type="button"
            onClick={finish}
            disabled={finishing}
            className="ml-auto h-11 flex-1 rounded-full text-sm font-semibold sm:flex-none sm:px-8"
          >
            {finishing
              ? "Setting up..."
              : count > 0
                ? `Continue with ${count} ${count === 1 ? "subscription" : "subscriptions"}`
                : "Continue"}
          </Button>
        </div>
      </div>
    </div>
  )
}
