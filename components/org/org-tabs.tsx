"use client"

import { useEffect, useState } from "react"

import { useUrlState } from "@/lib/navigation/use-url-state"
import { useOverlayHistory } from "@/lib/navigation/use-overlay-history"
import { useAutoHideChatChrome } from "@/lib/chat-chrome"
import { useBodyScrollLock } from "@/lib/use-body-scroll-lock"
import Link from "next/link"
import {
  ArrowLeft,
  ArrowUpRight,
  Building2,
  Globe,
  Heart,
  Info,
  Mail,
  MessageCircle,
  MessageSquareText,
  Mic,
  Newspaper,
  PenLine,
  Phone,
} from "lucide-react"
import type { ArticleCard as ArticleCardType } from "@/lib/article-types"
import type { OrganizationView } from "@/lib/org-types"
import { AvatarWithBadge } from "@/components/org/verified-badge"
import type { CatalogueItemView, CatalogueKind } from "@/app/actions/org-content"
import type { FeedPostView, EngagementItem } from "@/app/actions/feed"
import type { CommunityPostView } from "@/app/actions/community"
import type { CurrentUser } from "@/lib/session"
import { PostCard } from "@/components/mind-feed"
import { EngagementFeed } from "@/components/profile/engagement-feed"
import { CommunityThreadFeed } from "@/components/community-help"
import { OrgEpisodeCatalog, NewCatalogueDialog } from "@/components/org/org-catalogue-tab"
import { UploadSection } from "@/components/org/upload/upload-section"
import type { MaterialView } from "@/lib/materials"
import type { PlaylistView } from "@/app/actions/materials"
import { ArticleRow } from "@/components/articles/article-card"
import { cn } from "@/lib/utils"

const TAB_KEYS = ["posts", "thread", "about", "articles", "catalogue", "engagement"] as const
type TabKey = (typeof TAB_KEYS)[number]

// Catalogue overlay inner location, mirrored to the URL so a live-replay page
// (which fully navigates away) can restore the exact spot on Back/close.
const UPLOAD_SEGMENTS = ["materials", "playlists", "live"] as const
type UploadSegment = (typeof UPLOAD_SEGMENTS)[number]
const LIVE_TABS = ["video", "audio"] as const
type LiveTab = (typeof LIVE_TABS)[number]

const SOCIAL_LABELS: Record<string, string> = {
  instagram: "Instagram",
  youtube: "YouTube",
  facebook: "Facebook",
  twitter: "X / Twitter",
  other: "Website",
}

// Maps a social key to its brand logo asset in /public/brands. Keys without an
// entry (e.g. "other") fall back to the generic Globe icon.
const SOCIAL_BRAND_ICON: Record<string, string> = {
  instagram: "/brands/instagram.svg",
  youtube: "/brands/youtube.svg",
  facebook: "/brands/facebook.svg",
  twitter: "/brands/x.svg",
}

export function OrgTabs({
  org,
  posts,
  threads,
  currentUser,
  articles,
  catalogue,
  materials,
  playlists,
  engagement,
}: {
  org: OrganizationView
  // Main-feed posts published in the org's voice, in the same FeedPostView shape
  // the feed uses so the Posts tab can render <PostCard> unchanged.
  posts: FeedPostView[]
  // Community Help threads published in the org's voice.
  threads: CommunityPostView[]
  // The viewer, needed by <PostCard> for engagement/ownership controls.
  currentUser: CurrentUser | null
  articles: ArticleCardType[]
  catalogue: CatalogueItemView[]
  // Externally-hosted resources (Upload redesign) + their curated playlists.
  materials: MaterialView[]
  playlists: PlaylistView[]
  // Posts this organisation has commented on (in its own voice). Comments-only —
  // organisations can't like — so every item carries at least one comment.
  engagement: EngagementItem[]
}) {
  const tabs: { key: TabKey; label: string; icon: React.ReactNode; count?: number }[] = [
    { key: "posts", label: "Posts", icon: <MessageSquareText className="size-4" />, count: posts.length },
    { key: "thread", label: "Thread", icon: <MessageCircle className="size-4" />, count: threads.length },
    { key: "about", label: "About", icon: <Building2 className="size-4" /> },
    { key: "articles", label: "Articles", icon: <Newspaper className="size-4" />, count: articles.length },
    { key: "engagement", label: "Engagement", icon: <Heart className="size-4" />, count: engagement.length },
    { key: "catalogue", label: "Catalogue", icon: <Mic className="size-4" />, count: catalogue.length },
  ]

  // Held in the URL rather than useState so a reload — or coming Back to this
  // profile — lands on the tab the user was actually reading, instead of snapping
  // to Posts. Switching tabs replaces the history entry, so Back leaves the
  // profile rather than stepping through every tab that was opened.
  const [tab, setTab] = useUrlState<TabKey>("tab", "posts", { valid: TAB_KEYS })
  // Catalogue opens as a full-screen overlay ON TOP of whatever tab is showing,
  // so it is NOT one of the inline tabs — it's a dedicated boolean. Keeping it
  // out of `tab` is what makes Back a single tap: useOverlayHistory pushes an
  // entry for the overlay, while the tab entry beneath keeps its own `?tab=…`.
  // Previously "catalogue" was a `tab` value, so opening rewrote the underlying
  // entry to `?tab=catalogue`; closing popped back to it and the URL-follow
  // effect instantly re-opened the overlay — hence the double tap.
  //
  // Seeded from a legacy `?tab=catalogue` deep link (the `/catalogue` shortcut
  // still redirects there) so those links keep working; the effect below then
  // normalises that URL back to the underlying tab.
  const [catalogueOpen, setCatalogueOpen] = useState(false)
  // Active Catalogue kind (Audio / Live / Documents), lifted here so the header's
  // upload dialog can tailor itself to the current tab — and hide on Live, which
  // can't be manually uploaded. Defaults to the first kind that has items.
  const [catalogueKind, setCatalogueKind] = useState<CatalogueKind>(() => {
    const counts = { audio: 0, video: 0, document: 0 }
    for (const it of catalogue) counts[it.kind]++
    return (["audio", "video", "document"] as CatalogueKind[]).find((k) => counts[k] > 0) ?? "audio"
  })

  // The Catalogue overlay's inner location (which segment, and the Live
  // Video/Audio sub-tab) is mirrored into the URL so that opening a full-page
  // live replay (`/live/[id]`) and then pressing Back/close returns to the EXACT
  // spot the user was browsing — the overlay reopens on Live › <sub-tab> instead
  // of snapping shut. These are `replace`-style params (no extra history entry)
  // that ride on the org-profile entry sitting beneath the replay page.
  const [catSegment, setCatSegment] = useUrlState<UploadSegment>("csec", "materials", {
    valid: UPLOAD_SEGMENTS,
  })
  const [liveTab, setLiveTab] = useUrlState<LiveTab>("clive", "video", { valid: LIVE_TABS })
  // Deep-link / return support: `?catalogue=open` reopens the overlay on mount
  // (the replay page appends it when navigating away, so Back lands here with it
  // set). Read once, then the overlay owns its open state and clears the flag.
  const [catalogueFlag, setCatalogueFlag] = useUrlState<"open" | "">("catalogue", "", {
    valid: ["open", ""],
  })
  useEffect(() => {
    if (catalogueFlag === "open") setCatalogueOpen(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogueFlag])

  // Position of the sliding top indicator.
  const activeIndex = Math.max(
    0,
    tabs.findIndex((t) => t.key === tab),
  )
  // The active tab's column expands so a long label ("Engagement", "Catalogue")
  // gets room, while the icon-only inactive tabs shrink and glide aside. Every
  // track stays `fr`, so grid-template-columns interpolates and the shift is
  // smooth rather than snapping.
  const ACTIVE_FR = 2.4
  const totalFr = tabs.length - 1 + ACTIVE_FR
  const columns = tabs.map((_, i) => (i === activeIndex ? `${ACTIVE_FR}fr` : "1fr")).join(" ")
  const indicatorLeft = (activeIndex / totalFr) * 100
  const indicatorWidth = (ACTIVE_FR / totalFr) * 100

  // Legacy deep link: `?tab=catalogue` (and the `/catalogue` shortcut that
  // redirects to it) used to select a "catalogue" tab. It now opens the overlay
  // and the tab underneath falls back to Posts, so normalise the URL once.
  useEffect(() => {
    if (tab === "catalogue") {
      setCatalogueOpen(true)
      setTab("posts")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  // Catalogue opens as an immersive full-screen view, so lock background scroll
  // while it's open. Uses the iOS-safe position:fixed lock — plain
  // `overflow:hidden` on <body> lets iOS keep scrolling the page behind, which
  // made this overlay feel stuck and scrolled the screen behind instead.
  useBodyScrollLock(catalogueOpen)

  function selectTab(key: TabKey) {
    // Catalogue isn't an inline tab — it opens the full-screen overlay and
    // leaves the underlying tab (and its URL) exactly where it was.
    if (key === "catalogue") {
      setCatalogueOpen(true)
      return
    }
    setTab(key)
  }

  // Closing simply clears the dedicated `catalogue` flag; the overlay-history
  // entry retires itself with a single synthetic pop, and because the flag lives
  // in its OWN pushed entry (not smeared across the tab entry beneath), one tap
  // now closes it. See the `catalogueOpen` state note for the full history.
  function closeCatalogue() {
    setCatalogueOpen(false)
    // Drop the return params so the closed profile URL stays clean and a later
    // reload doesn't silently reopen the overlay.
    if (catalogueFlag) setCatalogueFlag("")
  }

  // Catalogue is a full-screen overlay, so it gets its own history entry: the
  // device Back button and iOS swipe-back close it and reveal the tab underneath,
  // instead of navigating away from the profile entirely.
  useOverlayHistory(catalogueOpen, closeCatalogue, "org-catalogue")

  // The Catalogue overlay scrolls its own inner container, not the window, so
  // the global BottomNav's window-scroll listener never fires here and the bar
  // stayed pinned. Feeding the same shared chat-chrome store that the chat
  // surfaces use lets the footer tuck away on scroll-down and return on
  // scroll-up, matching every other page.
  const onCatalogueScroll = useAutoHideChatChrome()

  return (
    <section className="mt-2">
      {/* Same tab language as the personal profile: a full-width grid, only the
          active tab reveals its label, and a single indicator slides along the
          top border. The active column is weighted wider (and the icon-only
          inactive tabs shrink aside) so a long label never crowds the edge. */}
      <div
        role="tablist"
        className="relative -mx-4 grid border-t border-border/60 transition-[grid-template-columns] duration-300 ease-out sm:-mx-6"
        style={{ gridTemplateColumns: columns }}
      >
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            onClick={() => selectTab(t.key)}
            aria-selected={tab === t.key}
            title={t.label}
            className={cn(
              "flex items-center justify-center gap-2 py-3 text-xs font-semibold uppercase tracking-wider transition-colors",
              tab === t.key ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {/* Icon and label are mutually exclusive: an inactive tab is its icon
                alone, and the active tab swaps that icon out for its name. Showing
                both on the active tab made it read as a different kind of control
                than its neighbours and cost the label horizontal room it needs at
                this width. The label carries `title` + the icon's own meaning, so
                nothing is lost by dropping the glyph once a tab is selected. */}
            {tab === t.key ? (
              // `whitespace-nowrap` keeps the label on one line so a long name
              // ("Catalogue") can't wrap and make this tab taller than the rest.
              <span className="whitespace-nowrap">
                {t.label}
                {t.count ? ` ${t.count}` : ""}
              </span>
            ) : (
              <>
                {t.icon}
                {/* The name still reaches assistive tech on inactive tabs, which
                    would otherwise announce as unlabelled icon buttons. */}
                <span className="sr-only">
                  {t.label}
                  {t.count ? ` ${t.count}` : ""}
                </span>
              </>
            )}
          </button>
        ))}
        {/* Sliding active indicator — tracks the weighted column's position/size. */}
        <span
          className="absolute -top-px h-0.5 bg-foreground transition-all duration-300 ease-out"
          style={{ left: `${indicatorLeft}%`, width: `${indicatorWidth}%` }}
          aria-hidden
        />
      </div>

      {/* Catalogue renders as a full-screen overlay below; other tabs render inline. */}
      <div key={tab} className="animate-in fade-in slide-in-from-bottom-1 pt-4 duration-300">
        {tab === "posts" ? (
          <PostsTab org={org} posts={posts} currentUser={currentUser} />
        ) : tab === "thread" ? (
          <ThreadTab org={org} threads={threads} />
        ) : tab === "about" ? (
          <AboutTab org={org} />
        ) : tab === "articles" ? (
          <ArticlesTab org={org} articles={articles} />
        ) : tab === "engagement" ? (
          engagement.length === 0 ? (
            <EmptyState
              icon={<Heart className="size-6" />}
              title={`${org.name} hasn't engaged yet`}
              message={`Comments ${org.name} leaves on posts will appear here.`}
            />
          ) : (
            // Always the visitor experience on a Home profile: comments-only,
            // read + reply + add-your-own, never management controls — even for
            // the Home's own admins. Managing a Home's own comments doesn't live
            // on the public profile, so isSelf is hard-coded false here.
            <EngagementFeed items={engagement} isSelf={false} currentUser={currentUser} />
          )
        ) : null}
      </div>

      {/* Immersive Catalogue overlay — same layout as the individual-profile
          Catalogue: a back arrow + title header (owner add tool top-right) and
          a scrollable body with the toggle/search/rows. */}
      {catalogueOpen && (
        <div className="fixed left-0 top-0 z-50 flex h-[100dvh] w-screen flex-col bg-background animate-in fade-in slide-in-from-bottom-2 duration-300">
          <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border/60 bg-background/80 px-4 py-3 backdrop-blur-xl">
            <button
              type="button"
              onClick={closeCatalogue}
              aria-label="Back"
              className="tap-scale -ml-1 flex size-9 items-center justify-center rounded-full text-foreground transition-colors hover:bg-secondary/60"
            >
              <ArrowLeft className="size-5" />
            </button>
            <h2 className="flex-1 text-base font-semibold">Catalogue</h2>
            {/* Management actions now live inside the Upload section itself
                (per active segment), so the header stays clean. */}
          </header>

          <div
            data-scroll
            onScroll={onCatalogueScroll}
            // `min-h-0` is essential: a `flex-1` child in this `flex-col` fixed
            // overlay defaults to `min-height:auto`, so it refuses to shrink below
            // its content height — the list then overflows the fixed container
            // instead of scrolling inside it, and the touch gesture falls through
            // to the page behind (the "stuck / scrolls the screen behind" bug on
            // both iOS and Android). Bounding it here makes overflow-y-auto scroll
            // internally, matching the other working overlays.
            //
            // iOS fix: without an explicit momentum + compositing hint this
            // fixed-overlay scroller would wedge on iOS (Safari drops the
            // scrollable layer and the list becomes stuck/unscrollable).
            // `transform-gpu [contain:paint] [-webkit-overflow-scrolling:touch]`
            // is the same toolkit that unstuck the community feed.
            className="min-h-0 flex-1 transform-gpu overflow-y-auto overscroll-contain px-4 py-4 [contain:paint] [-webkit-overflow-scrolling:touch] sm:px-6"
          >
            <div className="mx-auto w-full max-w-4xl">
              {/* Redesigned Upload: Materials + Playlists (externally-hosted
                  resources) with the existing Live listing preserved as a third
                  segment. Owns its own admin action cluster and detail views. */}
              <UploadSection
                organizationId={org.id}
                orgName={org.name}
                orgHandle={org.handle}
                orgLogo={org.logo}
                isOwner={org.isOwner}
                materials={materials}
                playlists={playlists}
                liveItems={catalogue}
                // Controlled + URL-backed so a live replay can return here on
                // the exact segment and Live sub-tab.
                segment={catSegment}
                onSegmentChange={setCatSegment}
                liveTab={liveTab}
                onLiveTabChange={setLiveTab}
              />
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

function PostsTab({
  org,
  posts,
  currentUser,
}: {
  org: OrganizationView
  posts: FeedPostView[]
  currentUser: CurrentUser | null
}) {
  if (posts.length === 0) {
    return (
      <EmptyState
        icon={<MessageSquareText className="size-6" />}
        title="No posts yet"
        message={
          org.isOwner
            ? "Share devotionals, announcements, teachings and ministry updates from the main feed. They'll appear here."
            : `${org.name} hasn't shared any posts yet. Subscribe to be notified when they do.`
        }
        action={
          org.isOwner ? (
            <Link
              href="/feed"
              className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
            >
              <PenLine className="size-4" /> Share an update
            </Link>
          ) : null
        }
      />
    )
  }
  // Rendered with the main feed's own <PostCard variant="feed">, so this tab is
  // the feed rather than a look-alike: real like/comment/save/repost/share
  // wiring, the same media handling and the same clamp rules, and any future
  // feed change lands here automatically. The individual profile's Posts tab
  // does exactly this too, so person and organisation now match.
  return (
    <ul className="-mx-4 divide-y divide-border/60 sm:-mx-6">
      {posts.map((p) => (
        <li key={p.id}>
          <PostCard post={p} currentUser={currentUser} variant="feed" videoFeedPosts={posts} />
        </li>
      ))}
    </ul>
  )
}

/**
 * The organisation's Community threads, rendered with <CommunityThreadFeed> —
 * the room's own `PostItem` and conversation overlay. This replaced
 * <ProfileThreads>, which looked like a Community post but navigated away to
 * `/chatrooms/community?q=<id>` on tap, so the reader lost their place on the
 * profile and got none of the in-place behaviour. Sharing the room's components
 * means tap-to-expand, the comment sheet, media full screen and swiping between
 * clips all behave here exactly as they do in Community.
 */
function ThreadTab({ org, threads }: { org: OrganizationView; threads: CommunityPostView[] }) {
  if (threads.length === 0) {
    return (
      <EmptyState
        icon={<MessageCircle className="size-6" />}
        title="No threads yet"
        message={
          org.isOwner
            ? "Ask a question or share guidance in Community as this organisation. Threads posted in the organisation's voice appear here."
            : `${org.name} hasn't started any threads yet.`
        }
        action={
          org.isOwner ? (
            <Link
              href="/chatrooms?room=community"
              className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
            >
              <MessageCircle className="size-4" /> Open Community
            </Link>
          ) : null
        }
      />
    )
  }
  return <CommunityThreadFeed posts={threads} />
}


function AboutTab({ org }: { org: OrganizationView }) {
  const sections = [
    { label: "Mission", value: org.mission },
    { label: "Vision", value: org.vision },
  ].filter((s) => s.value?.trim())

  const socials = org.socials
    ? (Object.entries(org.socials).filter(([, v]) => v?.trim()) as [string, string][])
    : []

  const hasContact = org.contactEmail || org.contactPhone || org.website
  const isEmpty = sections.length === 0 && !hasContact && socials.length === 0 && !org.description

  if (isEmpty) {
    return (
      <EmptyState
        icon={<Info className="size-6" />}
        title="Nothing here yet"
        message={
          org.isOwner
            ? "Add your mission and vision so people understand your ministry."
            : `${org.name} hasn't added details yet.`
        }
      />
    )
  }

  const contactRows: {
    key: string
    href: string
    external: boolean
    label: string
    value: string
    icon: React.ReactNode
  }[] = []

  if (org.website) {
    contactRows.push({
      key: "website",
      href: org.website,
      external: true,
      label: "Website",
      value: org.website.replace(/^https?:\/\//, "").replace(/\/$/, ""),
      icon: <Globe className="size-4" />,
    })
  }
  if (org.contactEmail) {
    contactRows.push({
      key: "email",
      href: `mailto:${org.contactEmail}`,
      external: false,
      label: "Email",
      value: org.contactEmail,
      icon: <Mail className="size-4" />,
    })
  }
  if (org.contactPhone) {
    contactRows.push({
      key: "phone",
      href: `tel:${org.contactPhone}`,
      external: false,
      label: "Phone",
      value: org.contactPhone,
      icon: <Phone className="size-4" />,
    })
  }
  for (const [key, url] of socials) {
    const brandIcon = SOCIAL_BRAND_ICON[key]
    contactRows.push({
      key,
      href: /^https?:\/\//.test(url) ? url : `https://${url}`,
      external: true,
      label: SOCIAL_LABELS[key] ?? key,
      value: url.replace(/^https?:\/\//, "").replace(/\/$/, ""),
      icon: brandIcon ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={brandIcon || "/placeholder.svg"} alt="" aria-hidden className="size-4" />
      ) : (
        <Globe className="size-4" />
      ),
    })
  }

  return (
    // One flat stack so every section — intro, Mission, Vision, and Contact —
    // is parted by the same clearly-visible thick rule. `divide-y-2` only draws
    // between children (never above the first / below the last), and the
    // generous vertical padding gives each rule room to breathe for a premium,
    // editorial rhythm that reads easily on the near-black background.
    <div className="flex flex-col divide-y-2 divide-border">
      {org.description && (
        <p className="text-pretty pb-8 text-[15px] leading-relaxed text-foreground/90">{org.description}</p>
      )}

      {sections.map((s) => (
        <section key={s.label} className="flex flex-col gap-2 py-8 first:pt-0">
          <h3 className="font-display text-lg font-semibold tracking-tight text-foreground">{s.label}</h3>
          <p className="whitespace-pre-wrap text-pretty text-[15px] leading-relaxed text-foreground/90">
            {s.value}
          </p>
        </section>
      ))}

      {contactRows.length > 0 && (
        <section className="flex flex-col gap-4 py-8 first:pt-0 last:pb-0">
          <h3 className="font-display text-lg font-semibold tracking-tight text-foreground">Contact &amp; links</h3>
          {/* Solid 2px border + strong row dividers so the block reads as a
              distinct, tactile card rather than fading into the background. */}
          <div className="overflow-hidden rounded-2xl border-2 border-border bg-card/60 shadow-sm">
            <div className="divide-y-2 divide-border/70">
              {contactRows.map((row) => (
                <a
                  key={row.key}
                  href={row.href}
                  {...(row.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                  className="group flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-secondary/50"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border-2 border-border bg-background/70 text-muted-foreground transition-colors group-hover:text-foreground">
                    {row.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium text-foreground">{row.label}</span>
                    <span className="block truncate text-xs text-muted-foreground">{row.value}</span>
                  </span>
                  <ArrowUpRight className="size-4 shrink-0 text-muted-foreground/50 transition-colors group-hover:text-primary" />
                </a>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  )
}

function ArticlesTab({ org, articles }: { org: OrganizationView; articles: ArticleCardType[] }) {
  return (
    <div className="animate-in fade-in duration-300">
      {/* Heading only — the strapline was redundant with the active tab label
          and the empty state's own message directly below it. */}
      <div className="mb-5">
        <h2 className="font-display text-lg font-semibold tracking-tight text-foreground">Articles</h2>
      </div>

      {articles.length === 0 ? (
        <EmptyState
          icon={<Newspaper className="size-6" />}
          title="No articles published yet"
          message={
            org.isOwner
              ? "New teaching and resources you publish will appear here."
              : "New teaching and resources will appear here when published."
          }
          action={
            org.isOwner ? (
              <Link
                href="/articles/write"
                className="tap-scale mt-1 inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
              >
                <PenLine className="size-4" /> Write an article
              </Link>
            ) : null
          }
        />
      ) : (
        <div className="flex flex-col divide-y divide-border/40">
          {articles.map((a) => (
            <ArticleRow key={a.id} article={a} />
          ))}
        </div>
      )}
    </div>
  )
}

function OrgAvatar({ org, className }: { org: OrganizationView; className?: string }) {
  return (
    // `self-start` keeps the badge pinned to the avatar's own bottom-right;
    // without it the wrapper stretches to the flex row's full height and the
    // absolutely-positioned badge drops to the bottom of the post.
    <AvatarWithBadge verified={org.verified} badgeSize="sm" className="self-start">
      <Avatar initials={org.initials} color={org.color} image={org.logo} name={org.name} className={className} />
    </AvatarWithBadge>
  )
}

function Avatar({
  initials,
  color,
  image,
  name,
  className,
}: {
  initials: string
  color: string
  image: string | null
  name: string
  className?: string
}) {
  return (
    <span
      className={cn(
        "flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold",
        !image && color,
        className,
      )}
    >
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image || "/placeholder.svg"} alt={name} className="size-full object-cover" />
      ) : (
        initials
      )}
    </span>
  )
}

function EmptyState({
  icon,
  title,
  message,
  action,
}: {
  icon: React.ReactNode
  title: string
  message: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 px-6 py-20 text-center animate-in fade-in duration-500">
      {/* Quiet, haloed glyph rather than a boxed CMS-style empty card. */}
      <span className="relative flex size-14 items-center justify-center">
        <span aria-hidden className="absolute inset-0 rounded-full bg-primary/5 blur-md" />
        <span className="relative flex size-14 items-center justify-center rounded-full bg-secondary/60 text-muted-foreground/80 ring-1 ring-border/40">
          {icon}
        </span>
      </span>
      <div className="space-y-1.5">
        <p className="font-display text-base font-semibold tracking-tight text-foreground">{title}</p>
        <p className="mx-auto max-w-xs text-pretty text-sm leading-relaxed text-muted-foreground">{message}</p>
      </div>
      {action}
    </div>
  )
}
