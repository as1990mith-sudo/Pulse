"use client"

import { useMemo, useState } from "react"
import { Headphones, Search, Video } from "lucide-react"
import type { Show } from "@/lib/data"
import { EpisodeRow } from "@/components/profile/episode-row"
import { VideoCard } from "@/components/profile/video-card"
import { isPlayable } from "@/components/episode-player-provider"
import { cn } from "@/lib/utils"

type MediaTab = "audio" | "video"

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
  const [tab, setTab] = useState<MediaTab>("audio")
  // Selected playlist filter for the video tab ("all" = show every playlist).
  const [playlist, setPlaylist] = useState<string>("all")

  // Distinct playlist names across this profile's video episodes, in first-seen
  // order, used to render the YouTube-style playlist filter chips.
  const videoPlaylists = useMemo(() => {
    const seen: string[] = []
    for (const e of episodes) {
      const kind = e.mediaType ?? (e.videoUrl ? "video" : "audio")
      if (kind === "video" && e.playlist && !seen.includes(e.playlist)) seen.push(e.playlist)
    }
    return seen
  }, [episodes])

  // Episode media kind: video when it has a video recording, otherwise audio.
  const mediaCounts = useMemo(() => {
    let audio = 0
    let video = 0
    for (const e of episodes) {
      if ((e.mediaType ?? (e.videoUrl ? "video" : "audio")) === "video") video++
      else audio++
    }
    return { audio, video }
  }, [episodes])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return episodes.filter((e) => {
      const kind = e.mediaType ?? (e.videoUrl ? "video" : "audio")
      if (kind !== tab) return false
      if (q && !e.title.toLowerCase().includes(q)) return false
      // Playlist chip only applies on the video tab.
      if (tab === "video" && playlist !== "all") {
        if (playlist === "__none") {
          if (e.playlist) return false
        } else if (e.playlist !== playlist) {
          return false
        }
      }
      return true
    })
  }, [episodes, query, tab, playlist])

  // Video episodes grouped into playlist sections (named playlists first, then
  // an "Other videos" bucket for ungrouped clips) for the YouTube-style "All" view.
  const videoSections = useMemo(() => {
    if (tab !== "video") return []
    const groups = new Map<string, Show[]>()
    for (const e of filtered) {
      const key = e.playlist || "__none"
      const arr = groups.get(key) ?? []
      arr.push(e)
      groups.set(key, arr)
    }
    const sections: { key: string; label: string; items: Show[] }[] = []
    for (const name of videoPlaylists) {
      const items = groups.get(name)
      if (items?.length) sections.push({ key: name, label: name, items })
    }
    const none = groups.get("__none")
    if (none?.length) sections.push({ key: "__none", label: "Other videos", items: none })
    return sections
  }, [tab, filtered, videoPlaylists])

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
      {/* Audio / Video segmented toggle. */}
      <div
        role="tablist"
        aria-label="Filter episodes by media type"
        className="flex items-center gap-1 rounded-full border border-border/60 bg-card p-1"
      >
        {(
          [
            { key: "audio", label: "Audio", icon: Headphones, count: mediaCounts.audio },
            { key: "video", label: "Video", icon: Video, count: mediaCounts.video },
          ] as const
        ).map(({ key, label, icon: Icon, count }) => {
          const active = tab === key
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(key)}
              className={`flex flex-1 items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="size-4" />
              {label}
              <span
                className={`rounded-full px-1.5 text-xs ${
                  active ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}
              >
                {count}
              </span>
            </button>
          )
        })}
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${tab} episodes by title…`}
          aria-label="Search episodes by title"
          className="w-full rounded-full border border-border/60 bg-card py-2 pl-9 pr-4 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
        />
      </div>

      {/* Playlist filter chips (video tab only), YouTube-style. */}
      {tab === "video" && (videoPlaylists.length > 0) && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {[{ key: "all", label: "All" }, ...videoPlaylists.map((p) => ({ key: p, label: p })), { key: "__none", label: "Unsorted" }].map(
            (chip) => {
              const active = playlist === chip.key
              return (
                <button
                  key={chip.key}
                  type="button"
                  onClick={() => setPlaylist(chip.key)}
                  className={cn(
                    "shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors",
                    active
                      ? "bg-foreground text-background"
                      : "bg-secondary text-muted-foreground hover:text-foreground",
                  )}
                >
                  {chip.label}
                </button>
              )
            },
          )}
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="px-1 py-8 text-center text-sm text-muted-foreground">
          {query
            ? `No ${tab} episodes match “${query}”.`
            : `No ${tab} episodes published yet.`}
        </p>
      ) : tab === "video" ? (
        // YouTube-style grid of large 16:9 thumbnail cards. When viewing "All"
        // with multiple playlists, group into labeled sections; otherwise a
        // single grid.
        playlist === "all" && videoSections.length > 1 ? (
          <div className="space-y-7">
            {videoSections.map((section) => (
              <section key={section.key} className="space-y-3">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="font-display text-base font-semibold tracking-tight">{section.label}</h2>
                  {section.key !== "__none" && (
                    <button
                      type="button"
                      onClick={() => setPlaylist(section.key)}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      View playlist
                    </button>
                  )}
                </div>
                <div className="-mx-4 grid grid-cols-1 gap-y-3 sm:mx-0 sm:grid-cols-2 sm:gap-x-2 lg:grid-cols-3">
                  {section.items.map((show) => (
                    <VideoCard key={show.id} show={show} owned={owned} queue={queue} flush />
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="-mx-4 grid grid-cols-1 gap-y-3 sm:mx-0 sm:grid-cols-2 sm:gap-x-2 lg:grid-cols-3">
            {filtered.map((show) => (
              <VideoCard key={show.id} show={show} owned={owned} queue={queue} flush />
            ))}
          </div>
        )
      ) : (
        // Audio keeps the compact edge-to-edge divided list.
        <div className="-mx-4 divide-y divide-border/60 border-y border-border/60 sm:-mx-6">
          {filtered.map((show) => (
            <EpisodeRow key={show.id} show={show} owned={owned} queue={queue} />
          ))}
        </div>
      )}
    </div>
  )
}
