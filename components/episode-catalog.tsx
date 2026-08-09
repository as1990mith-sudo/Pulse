"use client"

import { useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Headphones, Radio, Search, Video } from "lucide-react"
import type { Show } from "@/lib/data"
import { EpisodeRow } from "@/components/profile/episode-row"
import { VideoCard } from "@/components/profile/video-card"
import { isPlayable } from "@/components/episode-player-provider"
import { cn } from "@/lib/utils"

type MediaTab = "audio" | "video" | "live"
type LiveKind = "video" | "audio"

/** Media kind of an episode: video when it has a video recording, else audio. */
function mediaKind(e: Show): "audio" | "video" {
  return e.mediaType ?? (e.videoUrl ? "video" : "audio")
}

/** True for recordings auto-published from a finished live session. */
function isLive(e: Show): boolean {
  return e.source === "live"
}

/**
 * The episode list shown on a profile. Three top-level toggles:
 *  - Audio / Video: manually uploaded episodes (never mixed with live).
 *  - Live: recordings auto-published from finished live sessions, split into
 *    Video and Audio subtabs so the two kinds stay separate.
 * A search box filters the active view by title.
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

  // Persist the active top-level tab (?cat=) and the Live subtab (?kind=) in the
  // URL so the selection survives navigation. Opening a live video replay routes
  // to /live/[id]; the back button restores /u/[id]?tab=catalogue&cat=live&kind=video,
  // so the user returns to the live *video* Catalogue rather than resetting to Audio.
  const searchParams = useSearchParams()
  const catParam = searchParams.get("cat")
  const kindParam = searchParams.get("kind")
  const [tab, setTab] = useState<MediaTab>(
    catParam === "live" || catParam === "video" || catParam === "audio" ? catParam : "audio",
  )
  // Video / Audio subtab within the Live tab.
  const [liveKind, setLiveKind] = useState<LiveKind>(kindParam === "audio" ? "audio" : "video")

  // Reflect a tab/subtab change in the URL without navigating, preserving any
  // other params already present (e.g. ?tab=catalogue). Next.js keeps
  // useSearchParams in sync with replaceState.
  function syncUrl(nextTab: MediaTab, nextKind: LiveKind) {
    if (typeof window === "undefined") return
    const params = new URLSearchParams(window.location.search)
    params.set("cat", nextTab)
    if (nextTab === "live") params.set("kind", nextKind)
    else params.delete("kind")
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`)
  }

  function selectTab(next: MediaTab) {
    setTab(next)
    syncUrl(next, liveKind)
  }

  function selectLiveKind(next: LiveKind) {
    setLiveKind(next)
    syncUrl(tab, next)
  }
  // Selected playlist filter for the (upload) video tab ("all" = every playlist).
  const [playlist, setPlaylist] = useState<string>("all")

  // Uploaded video episodes only (live recordings are excluded from this tab).
  const videoPlaylists = useMemo(() => {
    const seen: string[] = []
    for (const e of episodes) {
      if (!isLive(e) && mediaKind(e) === "video" && e.playlist && !seen.includes(e.playlist)) seen.push(e.playlist)
    }
    return seen
  }, [episodes])

  // Counts per top-level tab: uploads split by kind, plus a single Live total.
  const counts = useMemo(() => {
    let audio = 0
    let video = 0
    let live = 0
    for (const e of episodes) {
      if (isLive(e)) live++
      else if (mediaKind(e) === "video") video++
      else audio++
    }
    return { audio, video, live }
  }, [episodes])

  // Live recordings split by media kind, for the Live subtab counters.
  const liveCounts = useMemo(() => {
    let video = 0
    let audio = 0
    for (const e of episodes) {
      if (!isLive(e)) continue
      if (mediaKind(e) === "video") video++
      else audio++
    }
    return { video, audio }
  }, [episodes])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return episodes.filter((e) => {
      if (q && !e.title.toLowerCase().includes(q)) return false
      if (tab === "live") {
        // Live tab: only live recordings, split by the chosen subtab kind.
        if (!isLive(e)) return false
        return mediaKind(e) === liveKind
      }
      // Audio / Video upload tabs: never show live recordings here.
      if (isLive(e)) return false
      if (mediaKind(e) !== tab) return false
      // Playlist chip only applies on the (upload) video tab.
      if (tab === "video" && playlist !== "all") {
        if (playlist === "__none") {
          if (e.playlist) return false
        } else if (e.playlist !== playlist) {
          return false
        }
      }
      return true
    })
  }, [episodes, query, tab, liveKind, playlist])

  // Uploaded video episodes grouped into playlist sections for the "All" view.
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

  // Whether the active view renders as a YouTube-style video grid. Only the
  // (uploads) Video tab uses the grid; Live recordings — video AND audio — use
  // the same compact cover-art row list so both kinds list identically.
  const showsVideoGrid = tab === "video"
  // Search placeholder noun for the active view.
  const searchNoun = tab === "live" ? `live ${liveKind}` : tab

  return (
    <div className="space-y-4">
      {/* Audio / Live section nav — editorial underline style matching the
          Articles hub. The top-level "Video" (uploads) tab is hidden for now;
          restore its entry below to re-enable it. Live recordings still expose
          their own Video subtab. */}
      <div role="tablist" aria-label="Filter episodes by type" className="-mx-4 border-b border-border/50 px-4 sm:-mx-6 sm:px-6">
        <div className="flex items-center">
          {(
            [
              { key: "audio", label: "Audio", icon: Headphones, count: counts.audio },
              // { key: "video", label: "Video", icon: Video, count: counts.video },
              { key: "live", label: "Live", icon: Radio, count: counts.live },
            ] as const
          ).map(({ key, label, icon: Icon, count }) => {
            const active = tab === key
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => selectTab(key)}
                className={cn(
                  "-mb-px flex flex-1 items-center justify-center gap-2 border-b-2 py-3 text-sm font-medium transition-colors",
                  active
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className={cn("size-4", active && "text-primary")} />
                {label}
                <span className={cn("text-xs tabular-nums", active ? "text-primary" : "text-muted-foreground/60")}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Live subtoggle: Video / Audio — quieter secondary underline row. */}
      {tab === "live" && (
        <div role="tablist" aria-label="Filter live recordings by media type" className="flex items-center">
          {(
            [
              { key: "video", label: "Video", icon: Video, count: liveCounts.video },
              { key: "audio", label: "Audio", icon: Headphones, count: liveCounts.audio },
            ] as const
          ).map(({ key, label, icon: Icon, count }) => {
            const active = liveKind === key
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => selectLiveKind(key)}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 text-[13px] font-medium transition-colors",
                  active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className={cn("size-3.5", active && "text-primary")} />
                {label}
                <span className={cn("text-xs tabular-nums", active ? "text-primary" : "text-muted-foreground/60")}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      )}

      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${searchNoun} episodes by title…`}
          aria-label="Search episodes by title"
          className="w-full rounded-xl border border-border/50 bg-card/40 py-2.5 pl-10 pr-4 text-sm outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-primary/60 focus:bg-card"
        />
      </div>

      {/* Playlist filter chips (upload video tab only), YouTube-style. */}
      {tab === "video" && videoPlaylists.length > 0 && (
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
          {query ? `No ${searchNoun} episodes match “${query}”.` : `No ${searchNoun} episodes yet.`}
        </p>
      ) : showsVideoGrid ? (
        // YouTube-style grid of large 16:9 thumbnail cards. VideoCard routes
        // playback through the immersive video player — the same interface used
        // for the main live view. Upload Video groups by playlist in "All";
        // Live Video is always a single grid.
        tab === "video" && playlist === "all" && videoSections.length > 1 ? (
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
