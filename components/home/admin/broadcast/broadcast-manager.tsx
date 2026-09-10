"use client"

import { useState } from "react"
import useSWR from "swr"
import { Megaphone, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { getBroadcasts } from "@/app/actions/home-broadcast"
import type { BroadcastView } from "@/lib/home/broadcast"
import { BroadcastComposeDialog } from "@/components/home/admin/broadcast/compose-dialog"

/** "9 Sep, 18:42" — compact, locale-aware, computed on the client. */
function formatSentAt(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function BroadcastManager({
  handle,
  initialBroadcasts,
}: {
  handle: string
  initialBroadcasts: BroadcastView[]
}) {
  const { data, mutate } = useSWR(["home-broadcasts", handle], () => getBroadcasts(handle), {
    fallbackData: initialBroadcasts,
    revalidateOnFocus: true,
  })
  const [composing, setComposing] = useState(false)

  const list = data ?? initialBroadcasts

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-pretty text-sm text-muted-foreground">Send important messages directly to members.</p>
        <button
          type="button"
          onClick={() => setComposing(true)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground transition-transform tap-scale hover:bg-primary/90"
        >
          <Plus className="size-4" />
          New Broadcast
        </button>
      </div>

      {list.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border/60 bg-card/40 px-6 py-16 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-secondary text-muted-foreground">
            <Megaphone className="size-6" />
          </span>
          <p className="font-display text-base font-semibold tracking-tight">No broadcasts yet</p>
          <p className="max-w-xs text-pretty text-sm text-muted-foreground">
            Send an important message directly to your Home members.
          </p>
          <button
            type="button"
            onClick={() => setComposing(true)}
            className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground transition-transform tap-scale hover:bg-primary/90"
          >
            <Plus className="size-4" />
            New Broadcast
          </button>
        </div>
      ) : (
        <ul className="overflow-hidden rounded-2xl border border-border/50 bg-card/50 backdrop-blur-xl [&>li:not(:last-child)]:border-b [&>li:not(:last-child)]:border-border/40">
          {list.map((b) => (
            <li key={b.id} className="px-4 py-3.5">
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{b.message}</p>
                <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
                  {formatSentAt(b.sentAt)}
                </span>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 font-medium text-foreground/80">
                  {b.recipientLabel}
                </span>
                <span className="tabular-nums">{b.recipientCount} recipients</span>
                <span aria-hidden>·</span>
                <span className="tabular-nums">{b.openedCount} opened</span>
                {b.unopenedCount > 0 && (
                  <>
                    <span aria-hidden>·</span>
                    <span className={cn("tabular-nums")}>{b.unopenedCount} unopened</span>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <BroadcastComposeDialog
        handle={handle}
        open={composing}
        onOpenChange={setComposing}
        onSent={() => void mutate()}
      />
    </div>
  )
}
