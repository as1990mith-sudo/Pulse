"use client"

import { useMemo, useState } from "react"
import { ArrowDownUp, LibraryBig, Search, Upload } from "lucide-react"
import {
  type MaterialContentType,
  type MaterialView,
  CONTENT_TYPE_LABELS,
  durationToSeconds,
} from "@/lib/materials"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { MaterialCard } from "./material-card"

type SortKey = "newest" | "oldest" | "az" | "duration"

const SORT_LABELS: Record<SortKey, string> = {
  newest: "Newest first",
  oldest: "Oldest first",
  az: "Title A–Z",
  duration: "Longest first",
}

export function MaterialsView({
  materials,
  isOwner,
  onOpen,
  onEdit,
  onAddToPlaylist,
  onUpload,
}: {
  materials: MaterialView[]
  isOwner: boolean
  onOpen: (m: MaterialView) => void
  onEdit: (m: MaterialView) => void
  onAddToPlaylist: (m: MaterialView) => void
  onUpload: () => void
}) {
  const [query, setQuery] = useState("")
  const [type, setType] = useState<MaterialContentType | "all">("all")
  const [sort, setSort] = useState<SortKey>("newest")

  // Content-type filter chips only show types that actually exist, so members
  // never face an empty filter. "All" is always first.
  const availableTypes = useMemo(() => {
    const present = new Set<MaterialContentType>()
    for (const m of materials) present.add(m.contentType)
    return (Object.keys(CONTENT_TYPE_LABELS) as MaterialContentType[]).filter((t) => present.has(t))
  }, [materials])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = materials.filter((m) => {
      if (type !== "all" && m.contentType !== type) return false
      if (!q) return true
      return (
        m.title.toLowerCase().includes(q) ||
        (m.creator?.toLowerCase().includes(q) ?? false) ||
        (m.category?.toLowerCase().includes(q) ?? false) ||
        m.tags.some((t) => t.includes(q))
      )
    })
    const sorted = [...list]
    switch (sort) {
      case "newest":
        sorted.sort((a, b) => (b.resourceDateMs ?? b.createdAtMs) - (a.resourceDateMs ?? a.createdAtMs))
        break
      case "oldest":
        sorted.sort((a, b) => (a.resourceDateMs ?? a.createdAtMs) - (b.resourceDateMs ?? b.createdAtMs))
        break
      case "az":
        sorted.sort((a, b) => a.title.localeCompare(b.title))
        break
      case "duration":
        sorted.sort((a, b) => durationToSeconds(b.duration) - durationToSeconds(a.duration))
        break
    }
    return sorted
  }, [materials, query, type, sort])

  if (materials.length === 0) {
    return (
      <EmptyMaterials isOwner={isOwner} onUpload={onUpload} />
    )
  }

  return (
    <div className="space-y-4">
      {/* Search + sort */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search materials, speakers, tags…"
            aria-label="Search materials"
            className="w-full rounded-xl border border-border/50 bg-card/40 py-2.5 pl-10 pr-4 text-sm outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-primary/60 focus:bg-card"
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="Sort materials"
            className="flex size-[42px] shrink-0 items-center justify-center rounded-xl border border-border/50 bg-card/40 text-muted-foreground transition-colors hover:text-foreground data-[state=open]:border-primary/60"
          >
            <ArrowDownUp className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
              <DropdownMenuItem key={k} onClick={() => setSort(k)} className={cn(sort === k && "text-primary")}>
                {SORT_LABELS[k]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Content-type chips */}
      {availableTypes.length > 1 && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <Chip active={type === "all"} onClick={() => setType("all")}>
            All
          </Chip>
          {availableTypes.map((t) => (
            <Chip key={t} active={type === t} onClick={() => setType(t)}>
              {CONTENT_TYPE_LABELS[t]}
            </Chip>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="px-1 py-10 text-center text-sm text-muted-foreground">
          {query ? `No materials match “${query}”.` : "No materials in this filter yet."}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-3">
          {filtered.map((m, i) => (
            <div
              key={m.id}
              className="animate-in fade-in slide-in-from-bottom-1 duration-500"
              style={{ animationDelay: `${Math.min(i, 8) * 40}ms`, animationFillMode: "both" }}
            >
              <MaterialCard
                material={m}
                isOwner={isOwner}
                onOpen={onOpen}
                onEdit={onEdit}
                onAddToPlaylist={onAddToPlaylist}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors",
        active
          ? "border-primary bg-primary/10 text-foreground"
          : "border-border/60 bg-card/40 text-muted-foreground hover:border-border hover:text-foreground",
      )}
    >
      {children}
    </button>
  )
}

function EmptyMaterials({ isOwner, onUpload }: { isOwner: boolean; onUpload: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-3xl border border-dashed border-border/60 bg-card/30 px-6 py-14 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <LibraryBig className="size-7" />
      </span>
      <div className="space-y-1">
        <h3 className="font-display text-lg font-semibold text-foreground">No materials yet</h3>
        <p className="mx-auto max-w-xs text-pretty text-sm text-muted-foreground">
          {isOwner
            ? "Add your first teaching, sermon or resource by pasting a link from YouTube, Spotify, Vimeo, Drive and more."
            : "Teachings, sermons and resources will appear here once they're published."}
        </p>
      </div>
      {isOwner && (
        <button
          type="button"
          onClick={onUpload}
          className="tap-scale inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
        >
          <Upload className="size-4" /> Upload material
        </button>
      )}
    </div>
  )
}
