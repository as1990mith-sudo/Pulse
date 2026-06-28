"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Mic, MessageSquare, Repeat2, Bookmark, BookOpen, Clapperboard, ChevronLeft, ArrowLeft } from "lucide-react"
import type { Show } from "@/lib/data"
import type { FeedPostView } from "@/app/actions/feed"
import type { SavedItemView } from "@/app/actions/share"
import type { CurrentUser } from "@/lib/session"
import { EpisodeCatalog } from "@/components/episode-catalog"
import { UploadEpisode } from "@/components/upload-episode"
import { ProfilePostsGrid } from "@/components/profile/profile-posts-grid"
import { cn } from "@/lib/utils"

type TabKey = "posts" | "reposts" | "catalogue" | "saved"

export function ProfileTabs({
  name,
  isSelf,
  episodes,
  posts,
  reposts,
  saved,
  currentUser,
}: {
  name: string
  isSelf: boolean
  episodes: Show[]
  posts: FeedPostView[]
  reposts: FeedPostView[]
  saved: SavedItemView[]
  currentUser: CurrentUser | null
}) {
  // Tab order: Posts, Reposts, Catalogue, Saved. "Saved" is private — only the
  // profile owner sees it.
  const tabs: { key: TabKey; label: string; icon: React.ReactNode; count: number }[] = [
    { key: "posts", label: "Posts", icon: <MessageSquare className="size-4" />, count: posts.length },
    { key: "reposts", label: "Reposts", icon: <Repeat2 className="size-4" />, count: reposts.length },
    { key: "catalogue", label: "Catalogue", icon: <Mic className="size-4" />, count: episodes.length },
    ...(isSelf
      ? [{ key: "saved" as const, label: "Saved", icon: <Bookmark className="size-4" />, count: saved.length }]
      : []),
  ]

  const [tab, setTab] = useState<TabKey>("posts")
  // The tab the user was on before opening Catalogue, so the back arrow can
  // return them exactly where they were.
  const [prevTab, setPrevTab] = useState<TabKey>("posts")
  const catalogueOpen = tab === "catalogue"
  const activeIndex = Math.max(
    0,
    tabs.findIndex((t) => t.key === tab),
  )

  // Catalogue opens as an immersive full-screen view, so lock background scroll
  // while it's open and restore it on close.
  useEffect(() => {
    if (!catalogueOpen) return
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previous
    }
  }, [catalogueOpen])

  function selectTab(key: TabKey) {
    // Remember where we came from when entering Catalogue.
    if (key === "catalogue" && tab !== "catalogue") setPrevTab(tab)
    setTab(key)
  }

  return (
    <section className="mt-2">
      {/* Instagram-style tab bar: full-width, uppercase labels, sliding top
          indicator on the active tab. Sits on a top border like IG. */}
      <div
        className="relative -mx-4 grid border-t border-border/60 sm:-mx-6"
        style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
      >
        {tabs.map((t) => (
          <TabButton
            key={t.key}
            active={tab === t.key}
            onClick={() => selectTab(t.key)}
            icon={t.icon}
            label={t.label}
            count={t.count}
          />
        ))}
        {/* Sliding active indicator */}
        <span
          className="absolute -top-px left-0 h-0.5 bg-foreground transition-transform duration-300 ease-out"
          style={{ width: `${100 / tabs.length}%`, transform: `translateX(${activeIndex * 100}%)` }}
          aria-hidden
        />
      </div>

      {/* Content with a smooth fade/slide transition between tabs. Catalogue is
          rendered separately as a full-screen overlay below. */}
      <div key={tab} className="animate-in fade-in slide-in-from-bottom-1 duration-300 pt-4">
        {tab === "catalogue" ? null : tab === "reposts" ? (
          reposts.length === 0 ? (
            <EmptyState
              icon={<Repeat2 className="size-6" />}
              title="No reposts yet"
              message={
                isSelf
                  ? "Reposts you make from the feed will show up here for your followers to discover."
                  : `${name} hasn't reposted anything yet.`
              }
            />
          ) : (
            <ProfilePostsGrid posts={reposts} currentUser={currentUser} />
          )
        ) : tab === "saved" ? (
          saved.length === 0 ? (
            <EmptyState
              icon={<Bookmark className="size-6" />}
              title="Nothing saved yet"
              message="Tap the bookmark on any post, episode, or devotional to save it here. Only you can see your saved items."
            />
          ) : (
            <SavedFolders items={saved} />
          )
        ) : posts.length === 0 ? (
          <EmptyState
            icon={<MessageSquare className="size-6" />}
            title="No posts yet"
            message={
              isSelf
                ? "Share what's on your mind from the Post tab and your posts will show up here."
                : `${name} hasn't posted anything yet.`
            }
          />
        ) : (
          <ProfilePostsGrid posts={posts} currentUser={currentUser} />
        )}
      </div>

      {/* Catalogue opens full-screen, hiding the app/profile header. Only a back
          arrow remains, returning the user to the tab they came from. */}
      {catalogueOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-background animate-in fade-in slide-in-from-bottom-2 duration-300">
          <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border/60 bg-background/80 px-4 py-3 backdrop-blur-xl">
            <button
              type="button"
              onClick={() => setTab(prevTab)}
              aria-label="Back"
              className="tap-scale -ml-1 flex size-9 items-center justify-center rounded-full text-foreground transition-colors hover:bg-secondary/60"
            >
              <ArrowLeft className="size-5" />
            </button>
            <h2 className="text-base font-semibold">Catalogue</h2>
          </header>

          <div data-scroll className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">
            <div className="mx-auto w-full max-w-4xl space-y-4">
              {/* Owners can upload their own audio/video episodes here. */}
              {isSelf && <UploadEpisode />}
              {episodes.length === 0 ? (
                <EmptyState
                  icon={<Mic className="size-6" />}
                  title="No published episodes yet"
                  message={
                    isSelf
                      ? "Upload an audio or video episode above, or finish a live session in the studio to publish one automatically."
                      : `${name} hasn't published any episodes yet. Follow them to know when they go live.`
                  }
                />
              ) : (
                <EpisodeCatalog episodes={episodes} owned={isSelf} />
              )}
            </div>
          </div>
        </div>
      )}
    </section>
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
  { key: "devotionals", label: "Devotionals", icon: <BookOpen className="size-5" />, types: ["devotional"] },
  { key: "moments", label: "Moments", icon: <Clapperboard className="size-5" />, types: ["status"] },
]

/** Folder browser for the Saved tab: a grid of folders that open to their items. */
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
 * the remote image fails to load — previously a failed load (CORS/cache/network
 * quirks on some devices) left the badge blank instead of showing initials.
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

function TabButton({
  active,
  onClick,
  icon,
  label,
  count,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  count: number
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      title={label}
      className={cn(
        "flex items-center justify-center gap-2 py-3 text-xs font-semibold uppercase tracking-wider transition-colors",
        active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      {/* Only the active tab reveals its label (+ count); the rest stay icon-only.
          Keep the label on a single line so the icon stays vertically aligned
          with the icon-only tabs instead of centering against wrapped text. */}
      <span className={cn("whitespace-nowrap", !active && "sr-only")}>
        {label}
        {count > 0 ? ` ${count}` : ""}
      </span>
    </button>
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
