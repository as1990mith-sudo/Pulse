"use client"

import { useMemo, useState } from "react"
import type { Show } from "@/lib/data"
import { ShowCard } from "@/components/show-card"
import { cn } from "@/lib/utils"

export function EpisodeCatalog({ episodes }: { episodes: Show[] }) {
  const categories = useMemo(() => ["All", ...Array.from(new Set(episodes.map((e) => e.category)))], [episodes])
  const [active, setActive] = useState("All")

  const filtered = active === "All" ? episodes : episodes.filter((e) => e.category === active)

  return (
    <div className="space-y-6">
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

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((show) => (
          <ShowCard key={show.id} show={show} />
        ))}
      </div>
    </div>
  )
}
