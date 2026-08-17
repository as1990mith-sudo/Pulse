"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Mic, Radio, Users2, type LucideIcon } from "lucide-react"
import { beginHomeGoLive } from "@/app/actions/home-surfaces"
import { haptic } from "@/lib/haptics"
import { cn } from "@/lib/utils"

type StartOption = { label: string; kind: "room" | "audio" | "video"; icon: LucideIcon }

/**
 * Entry into the existing global go-live composer, but scoped to THIS Home. Each
 * option asks the server to validate membership + drop the Home cookie, then
 * routes to the studio — where `startBroadcast` stamps the new session with this
 * Home so it stays private to the community.
 */
export function HomeGoLiveButton({
  handle,
  options,
}: {
  handle: string
  options: StartOption[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function start(kind: StartOption["kind"]) {
    haptic("medium")
    setError(null)
    startTransition(async () => {
      const res = await beginHomeGoLive({ handle, kind })
      if (res.ok) router.push(res.url)
      else setError(res.error)
    })
  }

  const primary = options[0]
  const rest = options.slice(1)

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-2">
        {rest.map((opt) => {
          const Icon = opt.icon
          return (
            <button
              key={opt.kind}
              type="button"
              disabled={pending}
              onClick={() => start(opt.kind)}
              className="flex items-center gap-1.5 rounded-full border border-border/70 bg-background px-3.5 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-secondary/60 disabled:opacity-60"
            >
              <Icon className="size-4" />
              {opt.label}
            </button>
          )
        })}
        <button
          type="button"
          disabled={pending}
          onClick={() => start(primary.kind)}
          className={cn(
            "flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-60",
          )}
          style={{ backgroundColor: "var(--home-accent)" }}
        >
          <primary.icon className="size-4" />
          {pending ? "Starting…" : primary.label}
        </button>
      </div>
      {error && <p className="text-xs font-medium text-destructive">{error}</p>}
    </div>
  )
}

export const ROOM_START: StartOption[] = [{ label: "Start a room", kind: "room", icon: Users2 }]
export const LIVE_START: StartOption[] = [
  { label: "Go live", kind: "video", icon: Radio },
  { label: "Audio", kind: "audio", icon: Mic },
]
