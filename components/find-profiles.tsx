"use client"

import { useState } from "react"
import Link from "next/link"
import useSWR from "swr"
import { Loader2, Search, UserCheck, UserPlus, Users, X } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { discoverProfiles, toggleFollow, type DiscoverProfile } from "@/app/actions/follow"
import { cn } from "@/lib/utils"

export function FindProfiles() {
  const [query, setQuery] = useState("")
  const q = query.trim()

  // Search when there's a query, otherwise browse all profiles. SWR keys on the
  // trimmed query so typing transitions smoothly between browse and search.
  const { data, isLoading } = useSWR(["discover", q], () => discoverProfiles(q), {
    keepPreviousData: true,
    revalidateOnFocus: false,
  })

  const profiles = data ?? []

  return (
    <div>
      {/* Search field */}
      <div className="border-b border-border/60 px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2 rounded-full border border-border/70 bg-secondary/40 px-4 py-3 focus-within:border-primary/60">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search people by name…"
            className="w-full bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
            aria-label="Search people by name"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      </div>

      {/* Section label */}
      <div className="flex items-center gap-2 px-4 pt-4 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:px-5">
        <Users className="size-3.5" />
        {q ? "Search results" : "Browse profiles"}
      </div>

      {isLoading && profiles.length === 0 ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : profiles.length === 0 ? (
        <p className="px-4 py-16 text-center text-sm leading-relaxed text-muted-foreground sm:px-5">
          {q ? (
            <>
              No one matches <span className="font-medium text-foreground">{q}</span>. Try a different name.
            </>
          ) : (
            "No profiles to show yet."
          )}
        </p>
      ) : (
        <ul className="divide-y divide-border/60">
          {profiles.map((p) => (
            <li key={p.id}>
              <FindRow profile={p} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function FindRow({ profile }: { profile: DiscoverProfile }) {
  const [following, setFollowing] = useState(profile.isFollowing)
  const [hovering, setHovering] = useState(false)
  const [pending, setPending] = useState(false)

  async function onToggle() {
    const next = !following
    setFollowing(next)
    setPending(true)
    try {
      await toggleFollow({ targetUserId: profile.id, follow: next })
    } catch {
      setFollowing(!next)
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-secondary/30 sm:px-5">
      <Link href={`/u/${profile.id}`} className="flex min-w-0 flex-1 items-center gap-3">
        <Avatar className="size-12 shrink-0">
          {profile.image && <AvatarImage src={profile.image || "/placeholder.svg"} alt={profile.name} />}
          <AvatarFallback className={cn("text-sm", profile.color)}>{profile.initials}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold leading-tight">{profile.name}</p>
          <p className="truncate text-sm text-muted-foreground">{profile.handle}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {profile.followers === 1 ? "1 follower" : `${profile.followers} followers`}
          </p>
        </div>
      </Link>

      {profile.isSelf ? (
        <span className="shrink-0 rounded-full border border-border/70 px-3 py-1.5 text-xs font-medium text-muted-foreground">
          You
        </span>
      ) : (
        <button
          type="button"
          onClick={onToggle}
          onMouseEnter={() => setHovering(true)}
          onMouseLeave={() => setHovering(false)}
          disabled={pending}
          className={cn(
            "flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-60",
            following
              ? "border border-border/70 text-foreground hover:border-destructive/40 hover:text-destructive"
              : "bg-primary text-primary-foreground hover:opacity-90",
          )}
          aria-label={following ? `Unfollow ${profile.name}` : `Follow ${profile.name}`}
        >
          {following ? (
            <>
              <UserCheck className="size-4" />
              {hovering ? "Unfollow" : "Following"}
            </>
          ) : (
            <>
              <UserPlus className="size-4" />
              Follow
            </>
          )}
        </button>
      )}
    </div>
  )
}
