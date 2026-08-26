"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { ExternalLink } from "lucide-react"
import { setActiveHome } from "@/app/actions/home"

// "View your Home" from the admin console: switches the active context to this
// Home and lands on the main Frequency interface (what members see), rather
// than the removed /home/[handle] shell.
export function EnterHomeLink({ handle }: { handle: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await setActiveHome(handle)
          // The feed, not "/" — the root route renders the Daily Devotional, so
          // "see what members see" used to land on one article, not the Home.
          router.push("/feed")
          router.refresh()
        })
      }
      className="flex w-full items-center justify-between rounded-2xl border border-border bg-card p-5 text-left transition-colors hover:bg-muted/40 disabled:opacity-70"
    >
      <div>
        <p className="text-lg font-semibold">View your Home</p>
        <p className="text-sm text-muted-foreground">See what members see.</p>
      </div>
      <ExternalLink className="size-5 text-muted-foreground" />
    </button>
  )
}
