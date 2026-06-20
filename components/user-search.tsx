"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import useSWR from "swr"
import { Search, X } from "lucide-react"
import { authClient } from "@/lib/auth-client"
import { searchUsersAction } from "@/app/actions/users"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"

export function UserSearch() {
  const router = useRouter()
  const { data: session } = authClient.useSession()
  const signedIn = !!session?.user

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [debounced, setDebounced] = useState("")
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Debounce the query so we don't hit the server on every keystroke.
  useEffect(() => {
    const id = setTimeout(() => setDebounced(query.trim()), 250)
    return () => clearTimeout(id)
  }, [query])

  const { data: results, isLoading } = useSWR(
    open && debounced.length >= 1 ? ["user-search", debounced] : null,
    () => searchUsersAction(debounced),
    { keepPreviousData: true },
  )

  // Focus the input when the search panel opens.
  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  // Close on outside click and on Escape.
  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", onClick)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onClick)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  if (!signedIn) return null

  function visit(id: string) {
    setOpen(false)
    setQuery("")
    setDebounced("")
    router.push(`/u/${id}`)
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Search users"
        aria-expanded={open}
        className={cn(
          "relative flex size-9 items-center justify-center rounded-full outline-none transition-colors hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring",
          open ? "text-primary" : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Search className="size-[18px]" />
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-50 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-border bg-popover shadow-lg">
          <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2.5">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search people by name"
              className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {debounced.length < 1 ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">Start typing to find people.</p>
            ) : isLoading && !results ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">Searching…</p>
            ) : results && results.length > 0 ? (
              <ul className="py-1">
                {results.map((u) => (
                  <li key={u.id}>
                    <button
                      type="button"
                      onClick={() => visit(u.id)}
                      className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-secondary"
                    >
                      <Avatar className="size-9 shrink-0">
                        {u.image && <AvatarImage src={u.image || "/placeholder.svg"} alt={u.name} />}
                        <AvatarFallback className={cn("text-xs", u.color)}>{u.initials}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{u.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{u.handle}</p>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">No people found.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
