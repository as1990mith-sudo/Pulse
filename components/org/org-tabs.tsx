"use client"

import { useState } from "react"
import Link from "next/link"
import {
  Calendar,
  Globe,
  Heart,
  Info,
  Mail,
  MessageSquareText,
  Mic,
  Newspaper,
  PenLine,
  Phone,
  Repeat2,
} from "lucide-react"
import type { ArticleCard as ArticleCardType } from "@/lib/article-types"
import type { OrganizationView } from "@/lib/org-types"
import { AvatarWithBadge } from "@/components/org/verified-badge"
import type { OrgPostView } from "@/app/actions/organizations"
import type { EventView, CatalogueItemView } from "@/app/actions/org-content"
import { OrgEventsTab } from "@/components/org/org-events-tab"
import { OrgCatalogueTab } from "@/components/org/org-catalogue-tab"
import { ArticleRow } from "@/components/articles/article-card"
import { FeedVideo } from "@/components/feed-video"
import { ImageLightbox } from "@/components/image-lightbox"
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
    { key: "about", label: "About", icon: <Info className="size-4" /> },
    { key: "events", label: "Events", icon: <Calendar className="size-4" />, count: eventCount },
    { key: "articles", label: "Articles", icon: <Newspaper className="size-4" />, count: articles.length },
    { key: "catalogue", label: "Catalogue", icon: <Mic className="size-4" />, count: catalogue.length },
  ]

  const [tab, setTab] = useState<TabKey>("posts")
  const activeIndex = Math.max(
    0,
    tabs.findIndex((t) => t.key === tab),
  )

  return (
    <section className="mt-2">
      <div
        className="relative -mx-4 grid border-t border-border/60 sm:-mx-6"
        style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
      >
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            aria-pressed={tab === t.key}
            title={t.label}
            className={cn(
              "flex items-center justify-center gap-2 py-3 text-xs font-semibold uppercase tracking-wider transition-colors",
              tab === t.key ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.icon}
            <span className={cn("whitespace-nowrap", tab !== t.key && "sr-only")}>
              {t.label}
              {t.count ? ` ${t.count}` : ""}
            </span>
          </button>
        ))}
        <span
          className="absolute -top-px left-0 h-0.5 bg-foreground transition-transform duration-300 ease-out"
          style={{ width: `${100 / tabs.length}%`, transform: `translateX(${activeIndex * 100}%)` }}
          aria-hidden
        />
      </div>

      <div key={tab} className="animate-in fade-in slide-in-from-bottom-1 pt-4 duration-300">
        {tab === "posts" ? (
          <PostsTab org={org} posts={posts} />
        ) : tab === "about" ? (
          <AboutTab org={org} />
        ) : tab === "events" ? (
          <OrgEventsTab org={org} events={events} />
        ) : tab === "articles" ? (
          <ArticlesTab org={org} articles={articles} />
        ) : (
          <OrgCatalogueTab org={org} items={catalogue} />
        )}
      </div>
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
// and an engagement row — instead of a boxed card.
function OrgPostThread({ org, post }: { org: OrganizationView; post: OrgPostView }) {
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
            {post.text}
          </p>
        )}

        {post.media.length > 0 && <OrgPostMedia media={post.media} />}

        <div className="mt-2 flex items-center gap-6 text-muted-foreground">
          <span className="flex items-center gap-1.5 text-sm">
            <Heart className="size-5" />
            {post.likes > 0 && <span className="tabular-nums">{post.likes}</span>}
          </span>
          <span className="flex items-center gap-1.5 text-sm">
            <Repeat2 className="size-5" />
            {post.reposts > 0 && <span className="tabular-nums">{post.reposts}</span>}
          </span>
        </div>
      </div>
    </article>
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

  return (
    <div className="flex flex-col gap-4">
      {org.description && (
        <p className="text-pretty text-sm leading-relaxed text-muted-foreground">{org.description}</p>
      )}

      {sections.map((s) => (
        <div key={s.label} className="rounded-2xl border border-border/60 bg-card p-4">
          <h3 className="text-sm font-semibold">{s.label}</h3>
          <p className="mt-1.5 whitespace-pre-wrap text-pretty text-sm leading-relaxed text-muted-foreground">
            {s.value}
          </p>
        </div>
      ))}

      {(hasContact || socials.length > 0) && (
        <div className="rounded-2xl border border-border/60 bg-card p-4">
          <h3 className="text-sm font-semibold">Contact & links</h3>
          <div className="mt-3 flex flex-col gap-2.5 text-sm">
            {org.website && (
              <a
                href={org.website}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-primary hover:underline"
              >
                <Globe className="size-4 shrink-0" />
                <span className="truncate">{org.website.replace(/^https?:\/\//, "")}</span>
              </a>
            )}
            {org.contactEmail && (
              <a href={`mailto:${org.contactEmail}`} className="inline-flex items-center gap-2 hover:underline">
                <Mail className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{org.contactEmail}</span>
              </a>
            )}
            {org.contactPhone && (
              <a href={`tel:${org.contactPhone}`} className="inline-flex items-center gap-2 hover:underline">
                <Phone className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{org.contactPhone}</span>
              </a>
            )}
            {socials.map(([key, url]) => {
              const brandIcon = SOCIAL_BRAND_ICON[key]
              return (
                <a
                  key={key}
                  href={/^https?:\/\//.test(url) ? url : `https://${url}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-primary hover:underline"
                >
                  {brandIcon ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={brandIcon || "/placeholder.svg"} alt="" aria-hidden className="size-4 shrink-0" />
                  ) : (
                    <Globe className="size-4 shrink-0" />
                  )}
                  <span className="truncate">{SOCIAL_LABELS[key] ?? key}</span>
                </a>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function ArticlesTab({ org, articles }: { org: OrganizationView; articles: ArticleCardType[] }) {
  if (articles.length === 0) {
    return (
      <EmptyState
        icon={<Newspaper className="size-6" />}
        title="No articles yet"
        message={
          org.isOwner
            ? "Publish written resources and teachings for your community."
            : `${org.name} hasn't published any articles yet.`
        }
        action={
          org.isOwner ? (
            <Link
              href="/articles/write"
              className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
            >
              <PenLine className="size-4" /> Write an article
            </Link>
          ) : null
        }
      />
    )
  }
  return (
    <div className="flex flex-col gap-3">
      {articles.map((a) => (
        <ArticleRow key={a.id} article={a} />
      ))}
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
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-muted/30 px-6 py-16 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-secondary text-muted-foreground">
        {icon}
      </span>
      <p className="font-medium">{title}</p>
      <p className="max-w-sm text-pretty text-sm text-muted-foreground">{message}</p>
      {action}
    </div>
  )
}
