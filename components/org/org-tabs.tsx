"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  ArrowLeft,
  ArrowUpRight,
  Building2,
  Globe,
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
import type { FeedPostView } from "@/app/actions/feed"
import type { CommunityPostView } from "@/app/actions/community"
import type { CurrentUser } from "@/lib/session"
import { PostCard } from "@/components/mind-feed"
import { ProfileThreads } from "@/components/profile/profile-threads"
import { OrgEpisodeCatalog, NewCatalogueDialog } from "@/components/org/org-catalogue-tab"
import { ArticleRow } from "@/components/articles/article-card"
import { cn } from "@/lib/utils"

type TabKey = "posts" | "thread" | "about" | "articles" | "catalogue"

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
}) {
  const tabs: { key: TabKey; label: string; icon: React.ReactNode; count?: number }[] = [
    { key: "posts", label: "Posts", icon: <MessageSquareText className="size-4" />, count: posts.length },
    { key: "thread", label: "Thread", icon: <MessageCircle className="size-4" />, count: threads.length },
    { key: "about", label: "About", icon: <Building2 className="size-4" /> },
    { key: "articles", label: "Articles", icon: <Newspaper className="size-4" />, count: articles.length },
    { key: "catalogue", label: "Catalogue", icon: <Mic className="size-4" />, count: catalogue.length },
  ]

  const [tab, setTab] = useState<TabKey>("posts")
  // The tab the user was on before opening Catalogue, so the back arrow returns
  // them exactly where they were (mirrors the individual-profile Catalogue).
  const [prevTab, setPrevTab] = useState<TabKey>("posts")
  // Active Catalogue kind (Audio / Live / Documents), lifted here so the header's
  // upload dialog can tailor itself to the current tab — and hide on Live, which
  // can't be manually uploaded. Defaults to the first kind that has items.
  const [catalogueKind, setCatalogueKind] = useState<CatalogueKind>(() => {
    const counts = { audio: 0, video: 0, document: 0 }
    for (const it of catalogue) counts[it.kind]++
    return (["audio", "video", "document"] as CatalogueKind[]).find((k) => counts[k] > 0) ?? "audio"
  })
  const catalogueOpen = tab === "catalogue"

  // Position of the sliding top indicator.
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
    if (key === "catalogue" && tab !== "catalogue") setPrevTab(tab)
    setTab(key)
  }

  return (
    <section className="mt-2">
      {/* Same tab language as the personal profile: a full-width grid where every
          tab gets an equal share, only the active tab reveals its label, and a
          single indicator slides along the top border. No horizontal scrolling —
          the icon-only inactive tabs mean all five always fit. */}
      <div
        role="tablist"
        className="relative -mx-4 grid border-t border-border/60 sm:-mx-6"
        style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
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
            {t.icon}
            {/* Keep the label on one line so the icon stays vertically aligned
                with the icon-only tabs instead of centring against wrapped text. */}
            <span className={cn("whitespace-nowrap", tab !== t.key && "sr-only")}>
              {t.label}
              {t.count ? ` ${t.count}` : ""}
            </span>
          </button>
        ))}
        {/* Sliding active indicator */}
        <span
          className="absolute -top-px left-0 h-0.5 bg-foreground transition-transform duration-300 ease-out"
          style={{ width: `${100 / tabs.length}%`, transform: `translateX(${activeIndex * 100}%)` }}
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
              onClick={() => selectTab(prevTab)}
              aria-label="Back"
              className="tap-scale -ml-1 flex size-9 items-center justify-center rounded-full text-foreground transition-colors hover:bg-secondary/60"
            >
              <ArrowLeft className="size-5" />
            </button>
            <h2 className="flex-1 text-base font-semibold">Catalogue</h2>
            {/* Live recordings publish automatically, so hide the upload tool
                on the Live tab — only Audio & Documents can be added manually. */}
            {org.isOwner && catalogueKind !== "video" && (
              <NewCatalogueDialog organizationId={org.id} activeKind={catalogueKind} />
            )}
          </header>

          <div data-scroll className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">
            <div className="mx-auto w-full max-w-4xl">
              {/* Always render the catalogue so the Uploads / Live / Documents
                  tabs stay available even when a tab (or the whole catalogue)
                  is empty — it shows its own per-tab empty message. */}
              <OrgEpisodeCatalog
                items={catalogue}
                isOwner={org.isOwner}
                orgId={org.id}
                orgName={org.name}
                orgLogo={org.logo}
                orgHandle={org.handle}
                tab={catalogueKind}
                onTabChange={setCatalogueKind}
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
 * The organisation's Community Help threads. Reuses <ProfileThreads mode="thread">
 * — the same component the individual profile's Thread tab uses — so the room's
 * interface is shared rather than reimplemented: identifiable threads show the
 * org's name and logo, and anonymous ones keep the universal anonymous
 * treatment. Only org owners/administrators are ever sent anonymous rows.
 */
function ThreadTab({ org, threads }: { org: OrganizationView; threads: CommunityPostView[] }) {
  if (threads.length === 0) {
    return (
      <EmptyState
        icon={<MessageCircle className="size-6" />}
        title="No threads yet"
        message={
          org.isOwner
            ? "Ask a question or share guidance in Community Help as this organisation. Threads posted in the organisation's voice appear here."
            : `${org.name} hasn't started any threads yet.`
        }
        action={
          org.isOwner ? (
            <Link
              href="/chatrooms/community"
              className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
            >
              <MessageCircle className="size-4" /> Open Community Help
            </Link>
          ) : null
        }
      />
    )
  }
  return <ProfileThreads posts={threads} mode="thread" />
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
      {/* Editorial section intro sets the tone before the list/empty state. */}
      <div className="mb-5">
        <h2 className="font-display text-lg font-semibold tracking-tight text-foreground">Articles</h2>
        <p className="mt-1 text-pretty text-sm leading-relaxed text-muted-foreground">
          Teaching, insights and resources from {org.name}.
        </p>
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
