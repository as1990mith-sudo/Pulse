"use client"

import { useMemo, useState } from "react"
import { LayoutGrid, MonitorPlay } from "lucide-react"
import type { Show } from "@/lib/data"
import { ShowCard } from "@/components/show-card"
import { YouTubeCard } from "@/components/youtube-card"
import { cn } from "@/lib/utils"

type View = "grid" | "youtube"

export function EpisodeCatalog({ episodes }: { episodes: Show[] }) {
  const categories = useMemo(() => ["All", ...Array.from(new Set(episodes.map((e) => e.category)))], [episodes])
  const [active, setActive] = useState("All")
  const [view, setView] = useState<View>("grid")

  const filtered = active === "All" ? episodes : episodes.filter((e) => e.category === active)

  const tabs: { id: View; label: string; icon: typeof LayoutGrid }[] = [
    { id: "grid", label: "Grid", icon: LayoutGrid },
    { id: "youtube", label: "YouTube", icon: MonitorPlay },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActive(cat)}
              className={cn(
                "rounded-full border px-4 py-1.5 text-sm font-medium transition-colors",
                active === cat
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground",
              )}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="flex shrink-0 items-center gap-1 rounded-lg border border-border bg-card p-1">
          {tabs.map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => setView(tab.id)}
                aria-pressed={view === tab.id}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  view === tab.id
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-4" />
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      {view === "grid" ? (
        <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3">
          {filtered.map((show) => (
            <ShowCard key={show.id} show={show} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:gap-x-4 sm:gap-y-8 lg:grid-cols-3">
          {filtered.map((show) => (
            <YouTubeCard key={show.id} show={show} />
          ))}
        </div>
      )}
    </div>
  )
}
