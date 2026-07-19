"use client"

import { useEffect, useRef, useState } from "react"
import useSWR from "swr"
import { Loader2, MessageCircleMore, Search, Users, X } from "lucide-react"
import { discoverProfiles } from "@/app/actions/follow"
import { searchPosts } from "@/app/actions/feed"
import { FindRow } from "@/components/find-profiles"
import { PostCard } from "@/components/mind-feed"
import type { CurrentUser } from "@/lib/session"

export function SearchView({ currentUser }: { currentUser: CurrentUser | null }) {
  const [query, setQuery] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)
  const q = query.trim()

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // People: search by name when there's a query, otherwise browse everyone.
  const { data: people, isLoading: peopleLoading } = useSWR(["search-people", q], () => discoverProfiles(q), {
    keepPreviousData: true,
    revalidateOnFocus: false,
  })

  // Posts: only searched once the user types (matches text, #hashtags, author).
  const { data: posts, isLoading: postsLoading } = useSWR(q ? ["search-posts", q] : null, () => searchPosts(q), {
    keepPreviousData: true,
    revalidateOnFocus: false,
  })

  const profiles = people ?? []
  const postResults = posts ?? []
  const searching = q.length > 0
  const loading = peopleLoading || (searching && postsLoading)
  const noResults = searching && !loading && profiles.length === 0 && postResults.length === 0

  return (
    <div className="mx-auto w-full max-w-2xl pb-16">
      {/* Search field */}
      <div className="sticky top-0 z-10 bg-background/80 px-4 py-3 backdrop-blur-md sm:px-5">
        <div className="flex items-center gap-2 rounded-full border border-border/70 bg-secondary/40 px-4 py-3 focus-within:border-primary/60">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search people, #hashtags, or posts…"
            className="w-full bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
            aria-label="Search people, hashtags, or posts"
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

      {loading && profiles.length === 0 && postResults.length === 0 ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : noResults ? (
        <p className="px-4 py-16 text-center text-sm leading-relaxed text-muted-foreground sm:px-5">
          No people or posts match <span className="font-medium text-foreground">{q}</span>. Try another name,
          hashtag, or keyword.
        </p>
      ) : (
        <div className="space-y-6">
          {/* People */}
          {profiles.length > 0 && (
            <section>
              <div className="flex items-center gap-2 px-4 pt-4 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:px-5">
                <Users className="size-3.5" />
                {searching ? "People" : "Discover people"}
              </div>
              <ul className="divide-y divide-border/60">
                {profiles.map((p) => (
                  <li key={p.id}>
                    <FindRow profile={p} />
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Posts (only once searching) */}
          {searching && postResults.length > 0 && (
            <section>
              <div className="flex items-center gap-2 px-4 pt-2 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:px-5">
                <MessageCircleMore className="size-3.5" />
                Posts
              </div>
              <div className="space-y-3 px-4 sm:px-5">
                {postResults.map((post) => (
                  <PostCard key={post.id} post={post} currentUser={currentUser} variant="card" />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
