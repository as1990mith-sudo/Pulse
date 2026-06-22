"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { Mic } from "lucide-react"
import type { PodcastHost } from "@/lib/data"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export function PodcastLibrary({ hosts }: { hosts: PodcastHost[] }) {
  const categories = useMemo(
    () => ["All", ...Array.from(new Set(hosts.flatMap((h) => h.categories)))],
    [hosts],
  )
  const [active, setActive] = useState("All")

  const filtered = active === "All" ? hosts : hosts.filter((h) => h.categories.includes(active))

  if (hosts.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border/60 p-10 text-center">
        <p className="text-sm text-muted-foreground">
          No podcast hosts yet. When members publish their recorded live sessions, their accounts will appear here.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {categories.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActive(cat)}
              className={cn(
                "rounded-full border px-4 py-1.5 text-sm font-medium transition-colors",
                active === cat
                  ? "border-live bg-live text-live-foreground"
                  : "border-border bg-card text-muted-foreground hover:border-live/50 hover:text-foreground",
              )}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((host) => (
          <Link key={host.id} href={`/u/${host.id}`} className="group">
            <Card className="flex h-full flex-row items-center gap-4 p-4 transition-colors group-hover:border-live/50">
              <Avatar className="size-14 shrink-0">
                <AvatarImage src={host.image ?? undefined} alt={host.name} />
                <AvatarFallback className={cn("text-base", host.color)}>{host.initials}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold leading-tight">{host.name}</p>
                <p className="truncate text-xs text-muted-foreground">{host.handle}</p>
                <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1 font-medium text-foreground">
                    <Mic className="size-3 text-live" />
                    {host.episodeCount} {host.episodeCount === 1 ? "episode" : "episodes"}
                  </span>
                  {host.categories[0] && (
                    <Badge variant="secondary" className="capitalize">
                      {host.categories[0]}
                    </Badge>
                  )}
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
