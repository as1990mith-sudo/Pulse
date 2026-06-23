"use client"

import { useMemo, useState } from "react"
import { Search } from "lucide-react"
import type { Show } from "@/lib/data"
import { EpisodeRow } from "@/components/profile/episode-row"
import { isPlayable } from "@/components/episode-player-provider"

/**
 * The episode list shown on a profile. All episodes show by default; a search
 * box filters by title. Rows are edge-to-edge and separated by divider lines.
 */
export function EpisodeCatalog({
  episodes,
  owned = false,
}: {
  episodes: Show[]
  // When true, each row's menu also offers Delete (own profile only).
  owned?: boolean
}) {
  const [query, setQuery] = useState("")

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return episodes
    return episodes.filter((e) => e.title.toLowerCase().includes(q))
  }, [episodes, query])

  // The ordered queue handed to the player: every on-demand episode currently
  // shown, in list order. The player derives "up next" as the items after the
  // one that's playing.
  const queue = useMemo(() => filtered.filter(isPlayable), [filtered])

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
    <div className="space-y-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search episodes by title…"
          aria-label="Search episodes by title"
          className="w-full rounded-full border border-border/60 bg-card py-2 pl-9 pr-4 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="px-1 py-8 text-center text-sm text-muted-foreground">
          No episodes match &ldquo;{query}&rdquo;.
        </p>
      ) : (
        // Edge-to-edge immersive list: break out of the page padding and use
        // full-bleed divided rows instead of a boxed card.
        <div className="-mx-4 divide-y divide-border/60 border-y border-border/60 sm:-mx-6">
          {filtered.map((show) => (
            <EpisodeRow key={show.id} show={show} owned={owned} queue={queue} />
          ))}
        </div>
      )}
    </div>
  )
}
