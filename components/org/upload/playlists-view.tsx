"use client"

import { useMemo, useState } from "react"
import { ListMusic, Plus, Search } from "lucide-react"
import type { PlaylistView } from "@/app/actions/materials"
import { PlaylistCard } from "./playlist-card"

/**
 * Playlists discovery + management grid. Members browse curated collections;
 * admins get a Create Playlist affordance and per-card management. Search is
 * client-side over the already-loaded set — playlist counts are small.
 */
export function PlaylistsView({
  playlists,
  isAdmin,
  loading,
  onOpen,
  onCreate,
  onEdit,
  onShare,
  onDuplicate,
  onDelete,
}: {
  playlists: PlaylistView[]
  isAdmin: boolean
  loading?: boolean
  onOpen: (p: PlaylistView) => void
  onCreate: () => void
  onEdit: (p: PlaylistView) => void
  onShare: (p: PlaylistView) => void
  onDuplicate: (p: PlaylistView) => void
  onDelete: (p: PlaylistView) => void
}) {
  const [query, setQuery] = useState("")

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return playlists
    return playlists.filter(
      (p) => p.name.toLowerCase().includes(q) || (p.description ?? "").toLowerCase().includes(q),
    )
  }, [playlists, query])

  if (loading) {
    return (
      <div className="divide-y divide-border/60">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 py-3">
            <div className="size-16 shrink-0 animate-pulse rounded-xl bg-secondary" />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 w-3/4 animate-pulse rounded bg-secondary" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-secondary" />
            </div>
            <div className="size-11 shrink-0 animate-pulse rounded-full bg-secondary" />
          </div>
        ))}
      </div>
    )
  }

  if (playlists.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border px-6 py-16 text-center">
        <div className="grid size-14 place-items-center rounded-2xl bg-secondary text-muted-foreground">
          <ListMusic className="size-7" />
        </div>
        <h3 className="mt-4 text-base font-semibold">No playlists yet</h3>
        <p className="mt-1 max-w-xs text-sm text-muted-foreground text-pretty">
          Curated collections from this organisation will appear here.
        </p>
        {isAdmin && (
          <button
            type="button"
            onClick={onCreate}
            className="mt-5 inline-flex h-10 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground transition-all hover:brightness-110 active:scale-[0.98]"
          >
            <Plus className="size-4" />
            Create Playlist
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {playlists.length > 4 && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search playlists..."
            className="h-11 w-full rounded-full border border-border bg-secondary/40 pl-10 pr-4 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/50"
          />
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">No playlists match &ldquo;{query}&rdquo;.</p>
      ) : (
        <div className="divide-y divide-border/60">
          {filtered.map((p) => (
            <PlaylistCard
              key={p.id}
              playlist={p}
              isAdmin={isAdmin}
              onOpen={() => onOpen(p)}
              onEdit={() => onEdit(p)}
              onShare={() => onShare(p)}
              onDuplicate={() => onDuplicate(p)}
              onDelete={() => onDelete(p)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
