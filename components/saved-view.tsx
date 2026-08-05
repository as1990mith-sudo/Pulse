"use client"

import { useState } from "react"
import Link from "next/link"
import { Bookmark, BookOpen, ChevronLeft, Clapperboard, MessageSquare, Mic, Newspaper } from "lucide-react"
import type { SavedItemView } from "@/app/actions/share"
import { cn } from "@/lib/utils"

/**
 * The user's Saved collection — folders of bookmarked content grouped by type.
 * This is the same experience that used to live on the profile "Saved" tab; it
 * now has its own page reached from the side menu. Only the owner ever sees it.
 */
export function SavedView({ items }: { items: SavedItemView[] }) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-6 sm:px-6">
      <header className="mb-6 flex items-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
          <Bookmark className="size-6" />
        </span>
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Saved</h1>
          <p className="text-sm text-muted-foreground">
            {items.length > 0
              ? `${items.length} saved item${items.length === 1 ? "" : "s"} — only you can see these`
              : "Your bookmarked posts, episodes and more live here"}
          </p>
        </div>
      </header>

      {items.length === 0 ? (
        <EmptyState
          icon={<Bookmark className="size-6" />}
          title="Nothing saved yet"
          message="Tap the bookmark on any post, episode, or devotional to save it here. Only you can see your saved items."
        />
      ) : (
        <SavedFolders items={items} />
      )}
    </div>
  )
}

// "on Frequency" belongs only to an outgoing share, not to the saved card.
// Stored titles still carry it (e.g. "Kingdom Academy on Frequency"), so we
// strip the trailing suffix at display time — covers existing saved rows too.
function stripOnFrequency(title: string | null): string | null {
  if (!title) return title
  return title.replace(/\s+on Frequency$/i, "")
}

// Saved items are organised into folders by their content type. Feed and
// Catalogue always show (per the spec); Devotionals/Moments appear only when
// they hold something, so nothing the user saved ever becomes unreachable.
const SAVED_FOLDERS: {
  key: string
  label: string
  icon: React.ReactNode
  types: string[]
  always?: boolean
}[] = [
  { key: "feed", label: "Feed", icon: <MessageSquare className="size-5" />, types: ["post"], always: true },
  { key: "catalogue", label: "Catalogue", icon: <Mic className="size-5" />, types: ["episode"], always: true },
  { key: "articles", label: "Articles", icon: <Newspaper className="size-5" />, types: ["article"], always: true },
  { key: "devotionals", label: "Devotionals", icon: <BookOpen className="size-5" />, types: ["devotional"] },
  { key: "moments", label: "Moments", icon: <Clapperboard className="size-5" />, types: ["status"] },
]

/** Folder browser for the Saved page: a grid of folders that open to their items. */
function SavedFolders({ items }: { items: SavedItemView[] }) {
  const [openKey, setOpenKey] = useState<string | null>(null)

  const folders = SAVED_FOLDERS.map((f) => ({
    ...f,
    items: items.filter((it) => f.types.includes(it.type)),
  })).filter((f) => f.always || f.items.length > 0)

  const current = folders.find((f) => f.key === openKey)

  if (current) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setOpenKey(null)}
            className="flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronLeft className="size-4" /> Folders
          </button>
          <span className="text-sm text-muted-foreground">/</span>
          <h3 className="text-sm font-semibold">{current.label}</h3>
        </div>
        {current.items.length === 0 ? (
          <EmptyState
            icon={current.icon}
            title={`Nothing in ${current.label} yet`}
            message={
              current.key === "feed"
                ? "Save a post from the feed and it will land in this folder."
                : current.key === "catalogue"
                  ? "Save a video or audio episode from a creator's catalogue and it will appear here."
                  : current.key === "articles"
                    ? "Bookmark an article while reading and it will be collected here."
                    : `Items you save will appear in ${current.label}.`
            }
          />
        ) : (
          <SavedGrid items={current.items} />
        )}
      </div>
    )
  }

  return (
    <ul className="grid grid-cols-2 gap-3">
      {folders.map((f) => (
        <li key={f.key}>
          <button
            onClick={() => setOpenKey(f.key)}
            className="flex w-full items-center gap-3 rounded-xl border border-border/60 bg-card p-4 text-left transition-colors hover:bg-secondary/50"
          >
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
              {f.icon}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{f.label}</span>
              <span className="block text-xs text-muted-foreground">
                {f.items.length} {f.items.length === 1 ? "item" : "items"}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

/** Grid of saved bookmarks linking back to each item's page. */
function SavedGrid({ items }: { items: SavedItemView[] }) {
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {items.map((item) => (
        <li key={item.id}>
          <Link
            href={item.url}
            className="flex items-center gap-3 rounded-xl border border-border/60 bg-card p-3 transition-colors hover:bg-secondary/50"
          >
            <div className="relative shrink-0">
              <div className="flex size-14 items-center justify-center overflow-hidden rounded-lg bg-secondary text-muted-foreground">
                {item.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.image || "/placeholder.svg"} alt="" className="size-full object-cover" />
                ) : (
                  <Bookmark className="size-5" />
                )}
              </div>
              {/* Avatar of the user whose content this is, overlapping the corner. */}
              {item.ownerName && (
                <SavedOwnerAvatar
                  name={item.ownerName}
                  image={item.ownerImage}
                  initials={item.ownerInitials}
                  color={item.ownerColor}
                />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{stripOnFrequency(item.title) ?? "Saved item"}</p>
              {item.subtitle && <p className="truncate text-xs text-muted-foreground">{item.subtitle}</p>}
              <span className="mt-1 inline-block rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {item.type}
              </span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  )
}

/**
 * Owner avatar overlapping a saved item's thumbnail. Falls back to initials if
 * the remote image fails to load.
 */
function SavedOwnerAvatar({
  name,
  image,
  initials,
  color,
}: {
  name: string
  image: string | null
  initials: string | null
  color: string | null
}) {
  const [failed, setFailed] = useState(false)
  const showImage = Boolean(image) && !failed
  return (
    <span
      className={cn(
        "absolute -bottom-1 -right-1 flex size-6 items-center justify-center overflow-hidden rounded-full text-[10px] font-bold ring-2 ring-card",
        color ?? "bg-secondary text-muted-foreground",
      )}
      title={name}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image || "/placeholder.svg"}
          alt={name}
          className="size-full object-cover"
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        initials
      )}
    </span>
  )
}

function EmptyState({ icon, title, message }: { icon: React.ReactNode; title: string; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-muted/30 px-6 py-16 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-secondary text-muted-foreground">
        {icon}
      </span>
      <p className="font-medium">{title}</p>
      <p className="max-w-sm text-pretty text-sm text-muted-foreground">{message}</p>
    </div>
  )
}
