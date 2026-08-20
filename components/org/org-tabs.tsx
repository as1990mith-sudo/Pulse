"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import {
  ArrowLeft,
  ArrowUpRight,
  Bookmark,
  Building2,
  Calendar,
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
  Share2,
} from "lucide-react"
import type { ArticleCard as ArticleCardType } from "@/lib/article-types"
import type { OrganizationView } from "@/lib/org-types"
import { AvatarWithBadge } from "@/components/org/verified-badge"
import type { OrgPostView } from "@/app/actions/organizations"
import type { EventView, CatalogueItemView, CatalogueKind } from "@/app/actions/org-content"
import type { ShareTarget } from "@/lib/share-types"
import { OrgEventsTab } from "@/components/org/org-events-tab"
import { OrgEpisodeCatalog, NewCatalogueDialog } from "@/components/org/org-catalogue-tab"
import { ArticleRow } from "@/components/articles/article-card"
import { FeedVideo } from "@/components/feed-video"
import { ImageLightbox } from "@/components/image-lightbox"
import { ShareSheet } from "@/components/share-sheet"
import { renderMessageBody } from "@/lib/rich-text"
import { cn } from "@/lib/utils"

type TabKey = "posts" | "about" | "events" | "articles" | "catalogue"

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
  articles,
  events,
  catalogue,
}: {
  org: OrganizationView
  posts: OrgPostView[]
  articles: ArticleCardType[]
  events: { upcoming: EventView[]; past: EventView[] }
  catalogue: CatalogueItemView[]
}) {
  const eventCount = events.upcoming.length + events.past.length
  const tabs: { key: TabKey; label: string; icon: React.ReactNode; count?: number }[] = [
    { key: "posts", label: "Posts", icon: <MessageSquareText className="size-4" />, count: posts.length },
    { key: "about", label: "About", icon: <Building2 className="size-4" /> },
    { key: "events", label: "Events", icon: <Calendar className="size-4" />, count: eventCount },
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

  // Horizontal tab scroller: the labels no longer squeeze to fit, so trailing
  // tabs (e.g. Catalogue) live off-screen until scrolled to. Whenever the active
  // tab changes we glide it toward the centre so the selection is always in view
  // — the momentum/smooth easing gives it a premium, native-app feel.
  const tabScrollerRef = useRef<HTMLDivElement>(null)
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  useEffect(() => {
    const el = tabRefs.current[tab]
    const scroller = tabScrollerRef.current
    if (!el || !scroller) return
    const target = el.offsetLeft - (scroller.clientWidth - el.clientWidth) / 2
    scroller.scrollTo({ left: Math.max(0, target), behavior: "smooth" })
  }, [tab])

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
      {/* Edge-faded, horizontally scrollable tab bar. The mask softly dissolves
          tabs at both edges so off-screen tabs (e.g. Catalogue) read as "there's
          more" rather than being hard-cropped. */}
      <div
        className="relative -mx-4 border-b border-border/50 sm:-mx-6"
        style={{
          maskImage:
            "linear-gradient(to right, transparent, black 20px, black calc(100% - 20px), transparent)",
          WebkitMaskImage:
            "linear-gradient(to right, transparent, black 20px, black calc(100% - 20px), transparent)",
        }}
      >
        <div
          ref={tabScrollerRef}
          role="tablist"
          className="flex overflow-x-auto scroll-smooth pl-1.5 pr-4 sm:pl-3 sm:pr-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {tabs.map((t) => (
            <button
              key={t.key}
              ref={(el) => {
                tabRefs.current[t.key] = el
              }}
              role="tab"
              onClick={() => selectTab(t.key)}
              aria-selected={tab === t.key}
              title={t.label}
              className={cn(
                "relative flex shrink-0 items-center gap-2 whitespace-nowrap px-4 py-3.5 text-[13px] font-medium uppercase tracking-wide transition-colors duration-200",
                tab === t.key ? "text-foreground" : "text-muted-foreground/70 hover:text-foreground",
              )}
            >
              <span className={cn("transition-transform duration-200", tab === t.key && "scale-105")}>{t.icon}</span>
              <span>
                {t.label}
                {t.count ? ` ${t.count}` : ""}
              </span>
              {/* Per-tab underline that fades/scales in under the active tab. */}
              <span
                className={cn(
                  "absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-primary shadow-[0_0_12px_var(--primary)] transition-all duration-300 ease-out",
                  tab === t.key ? "scale-x-100 opacity-100" : "scale-x-0 opacity-0",
                )}
                aria-hidden
              />
            </button>
          ))}
        </div>
      </div>

      {/* Catalogue renders as a full-screen overlay below; other tabs render inline. */}
      <div key={tab} className="animate-in fade-in slide-in-from-bottom-1 pt-4 duration-300">
        {tab === "posts" ? (
          <PostsTab org={org} posts={posts} />
        ) : tab === "about" ? (
          <AboutTab org={org} />
        ) : tab === "events" ? (
          <OrgEventsTab org={org} events={events} />
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
              {catalogue.length === 0 ? (
                <EmptyState
                  icon={<Mic className="size-6" />}
                  title="No resources yet"
                  message={
                    org.isOwner
                      ? "Publish sermons, worship sets, teachings and documents. Use the + button above to add your first resource."
                      : `${org.name} hasn't published any resources yet.`
                  }
                />
              ) : (
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
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

function PostsTab({ org, posts }: { org: OrganizationView; posts: OrgPostView[] }) {
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
  return (
    <ul className="-mx-4 divide-y divide-border/60 sm:-mx-6">
      {posts.map((p) => (
        <li key={p.id}>
          <OrgPostThread org={org} post={p} />
        </li>
      ))}
    </ul>
  )
}

// X (Twitter)-style thread row, matching the Community Help / individual-profile
// post timeline: edge-to-edge, avatar + inline name/time header, body, media
// and an engagement row — instead of a boxed card. Exported so the Home Feed
// (org voice) reuses the exact same premium thread architecture.
export function OrgPostThread({ org, post }: { org: OrganizationView; post: OrgPostView }) {
  return (
    <article className="flex gap-3 px-4 py-4 transition-colors hover:bg-secondary/30 sm:px-6">
      <OrgAvatar org={org} className="size-11" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-[15px]">
          <span className="truncate font-bold tracking-tight text-foreground">{org.name}</span>
          <span className="text-muted-foreground">·</span>
          <span className="shrink-0 text-sm text-muted-foreground">{post.postedAt}</span>
          {post.edited && <span className="shrink-0 text-sm text-muted-foreground">· edited</span>}
        </div>

        {post.text && (
          <p className="mt-1 whitespace-pre-wrap text-pretty text-[15px] leading-relaxed text-foreground">
            {renderMessageBody(post.text, { link: true, mention: true })}
          </p>
        )}

        {post.media.length > 0 && <OrgPostMedia media={post.media} />}

        <OrgPostActions org={org} post={post} />
      </div>
    </article>
  )
}

// Engagement row matching the Community Help timeline: Like · Reply · Save ·
// Share, evenly spaced within a bounded width. Like/Save keep local optimistic
// state (org posts have no per-post backend for these yet); Share opens the
// shared ShareSheet with a link back to the organisation.
function OrgPostActions({ org, post }: { org: OrganizationView; post: OrgPostView }) {
  const [liked, setLiked] = useState(false)
  const [saved, setSaved] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)

  const likeCount = post.likes + (liked ? 1 : 0)

  const shareTarget: ShareTarget = {
    type: "post",
    key: `org-post-${post.id}`,
    title: org.name,
    subtitle: post.text ? post.text.slice(0, 80) : null,
    url: `/org/${org.handle}`,
    image: post.media[0]?.url ?? org.logo ?? null,
    downloadUrl: post.media[0]?.type === "image" ? post.media[0]?.url : null,
    downloadKind: post.media[0]?.type === "image" ? "image" : null,
  }

  const actionClass =
    "flex items-center gap-1.5 rounded-full px-2 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"

  return (
    <>
      <div className="mt-3 flex max-w-[16rem] items-center justify-between">
        <button
          type="button"
          onClick={() => setLiked((v) => !v)}
          aria-label={liked ? "Unlike" : "Like"}
          aria-pressed={liked}
          className={cn(actionClass, liked && "text-rose-500 hover:text-rose-500")}
        >
          <Heart className={cn("size-5", liked && "fill-current")} />
          {likeCount > 0 && <span className="tabular-nums">{likeCount}</span>}
        </button>
        <button type="button" aria-label="Reply" className={actionClass}>
          <MessageCircle className="size-5" />
        </button>
        <button
          type="button"
          onClick={() => setSaved((v) => !v)}
          aria-label={saved ? "Remove from saved" : "Save"}
          aria-pressed={saved}
          className={cn(actionClass, saved && "text-foreground")}
        >
          <Bookmark className={cn("size-5", saved && "fill-current")} />
        </button>
        <button type="button" onClick={() => setShareOpen(true)} aria-label="Share" className={actionClass}>
          <Share2 className="size-5" />
        </button>
      </div>

      <ShareSheet target={shareTarget} open={shareOpen} onClose={() => setShareOpen(false)} />
    </>
  )
}

function OrgPostMedia({ media }: { media: OrgPostView["media"] }) {
  // Which image (if any) is expanded in the lightbox. Videos keep their own
  // inline player and are never lightbox targets.
  const [active, setActive] = useState<string | null>(null)

  const lightbox = active ? <ImageLightbox src={active} onClose={() => setActive(null)} /> : null

  // Single item: keep the image's own aspect ratio (capped) like the Community
  // Help timeline, rather than forcing a 16:9 crop. Images open in a lightbox.
  if (media.length === 1) {
    const m = media[0]
    if (m.type === "video") {
      return (
        <div className="relative mt-3 aspect-video w-full overflow-hidden rounded-2xl border border-border/60 bg-black">
          <FeedVideo src={m.url} className="h-full w-full object-cover" />
        </div>
      )
    }
    return (
      <>
        <button
          type="button"
          onClick={() => setActive(m.url)}
          aria-label="Open image"
          className="mt-3 block w-full overflow-hidden rounded-2xl border border-border/60"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={m.url || "/placeholder.svg"} alt="" loading="lazy" className="max-h-96 w-full object-cover" />
        </button>
        {lightbox}
      </>
    )
  }

  // Multiple items: compact square grid; each image opens in the lightbox.
  return (
    <>
      <div className="mt-3 grid grid-cols-2 gap-1.5">
        {media.slice(0, 4).map((m, i) => (
          <div key={i} className="relative aspect-square overflow-hidden rounded-xl border border-border/60 bg-black">
            {m.type === "video" ? (
              <FeedVideo src={m.url} className="h-full w-full object-cover" />
            ) : (
              <button
                type="button"
                onClick={() => setActive(m.url)}
                aria-label="Open image"
                className="block h-full w-full"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={m.url || "/placeholder.svg"} alt="" loading="lazy" className="h-full w-full object-cover" />
              </button>
            )}
          </div>
        ))}
      </div>
      {lightbox}
    </>
  )
}

function AboutTab({ org }: { org: OrganizationView }) {
  const sections = [
    { label: "Mission", value: org.mission },
    { label: "Vision", value: org.vision },
    { label: "Our story", value: org.history },
    { label: "What we believe", value: org.beliefs },
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
            ? "Add your mission, vision and beliefs so people understand your ministry."
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
