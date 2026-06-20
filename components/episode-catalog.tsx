"use client"

import { useMemo, useState } from "react"
import type { Show } from "@/lib/data"
import { ShowCard, ShowRow } from "@/components/show-card"
import { cn } from "@/lib/utils"

export function EpisodeCatalog({ episodes, layout = "grid" }: { episodes: Show[]; layout?: "grid" | "list" }) {
  const categories = useMemo(() => ["All", ...Array.from(new Set(episodes.map((e) => e.category)))], [episodes])
  const [active, setActive] = useState("All")

  const filtered = active === "All" ? episodes : episodes.filter((e) => e.category === active)

  if (episodes.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border/60 p-10 text-center">
        <p className="text-sm text-muted-foreground">
          No episodes published yet. Recorded live sessions will appear here once hosts publish them.
        </p>
      </div>
    )
  }

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

      {layout === "list" ? (
        <div className="flex flex-col gap-3">
          {filtered.map((show) => (
            <ShowRow key={show.id} show={show} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3">
          {filtered.map((show) => (
            <ShowCard key={show.id} show={show} />
          ))}
        </div>
      )}
    </div>
  )
}
