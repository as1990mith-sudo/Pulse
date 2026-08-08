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
  Users,
} from "lucide-react"
import type { Show } from "@/lib/data"
import type { ArticleCard as ArticleCardType } from "@/lib/article-types"
import type { OrganizationView } from "@/lib/org-types"
import type { OrgPostView, OrgSubscriberView } from "@/app/actions/organizations"
import { EpisodeCatalog } from "@/components/episode-catalog"
import { ArticleRow } from "@/components/articles/article-card"
import { FeedVideo } from "@/components/feed-video"
import { cn } from "@/lib/utils"

type TabKey = "posts" | "about" | "events" | "articles" | "catalogue" | "subscribers"

const SOCIAL_LABELS: Record<string, string> = {
  instagram: "Instagram",
  youtube: "YouTube",
  facebook: "Facebook",
  twitter: "X / Twitter",
  other: "Website",
}

export function OrgTabs({
  org,
  posts,
  articles,
  episodes,
  subscribers,
}: {
  org: OrganizationView
  posts: OrgPostView[]
  articles: ArticleCardType[]
  episodes: Show[]
  subscribers: OrgSubscriberView[]
}) {
  const tabs: { key: TabKey; label: string; icon: React.ReactNode; count?: number }[] = [
    { key: "posts", label: "Posts", icon: <MessageSquareText className="size-4" />, count: posts.length },
    { key: "about", label: "About", icon: <Info className="size-4" /> },
    { key: "events", label: "Events", icon: <Calendar className="size-4" /> },
    { key: "articles", label: "Articles", icon: <Newspaper className="size-4" />, count: articles.length },
    { key: "catalogue", label: "Catalogue", icon: <Mic className="size-4" />, count: episodes.length },
    { key: "subscribers", label: "Subscribers", icon: <Users className="size-4" />, count: org.subscriberCount },
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
          <EventsTab name={org.name} />
        ) : tab === "articles" ? (
          <ArticlesTab org={org} articles={articles} />
        ) : tab === "catalogue" ? (
          episodes.length === 0 ? (
            <EmptyState
              icon={<Mic className="size-6" />}
              title="No episodes yet"
              message={
                org.isOwner
                  ? "Audio and video resources you publish will appear here."
                  : `${org.name} hasn't published any resources yet.`
              }
            />
          ) : (
            <EpisodeCatalog episodes={episodes} owned={org.isOwner} />
          )
        ) : (
          <SubscribersTab org={org} subscribers={subscribers} />
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
    <div className="flex flex-col gap-4">
      {posts.map((p) => (
        <OrgPostCard key={p.id} org={org} post={p} />
      ))}
    </div>
  )
}

function OrgPostCard({ org, post }: { org: OrganizationView; post: OrgPostView }) {
  return (
    <article className="rounded-2xl border border-border/60 bg-card p-4">
      <header className="flex items-center gap-3">
        <OrgAvatar org={org} className="size-9 text-sm" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{org.name}</p>
          <p className="text-xs text-muted-foreground">
            {post.postedAt}
            {post.edited ? " · edited" : ""}
          </p>
        </div>
      </header>

      {post.text && <p className="mt-3 whitespace-pre-wrap text-pretty text-sm leading-relaxed">{post.text}</p>}

      {post.media.length > 0 && <OrgPostMedia media={post.media} />}

      <footer className="mt-3 flex items-center gap-5 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <Heart className="size-4" /> {post.likes}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Repeat2 className="size-4" /> {post.reposts}
        </span>
      </footer>
    </article>
  )
}

function OrgPostMedia({ media }: { media: OrgPostView["media"] }) {
  // Single item takes a framed 16:9 box; multiple items form a compact grid.
  if (media.length === 1) {
    const m = media[0]
    return (
      <div className="relative mt-3 aspect-video w-full overflow-hidden rounded-xl border border-border/60 bg-black">
        {m.type === "video" ? (
          <FeedVideo src={m.url} className="h-full w-full object-cover" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={m.url || "/placeholder.svg"} alt="" loading="lazy" className="h-full w-full object-cover" />
        )}
      </div>
    )
  }
  return (
    <div className="mt-3 grid grid-cols-2 gap-1.5">
      {media.slice(0, 4).map((m, i) => (
        <div key={i} className="relative aspect-square overflow-hidden rounded-lg border border-border/60 bg-black">
          {m.type === "video" ? (
            <FeedVideo src={m.url} className="h-full w-full object-cover" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={m.url || "/placeholder.svg"} alt="" loading="lazy" className="h-full w-full object-cover" />
          )}
        </div>
      ))}
    </div>
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
            {socials.map(([key, url]) => (
              <a
                key={key}
                href={/^https?:\/\//.test(url) ? url : `https://${url}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-primary hover:underline"
              >
                <Globe className="size-4 shrink-0" />
                <span className="truncate">{SOCIAL_LABELS[key] ?? key}</span>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function EventsTab({ name }: { name: string }) {
  return (
    <EmptyState
      icon={<Calendar className="size-6" />}
      title="Events coming soon"
      message={`Conferences, gatherings, prayer meetings and ministry activities from ${name} will appear here once events launch on Frequency.`}
    />
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

function SubscribersTab({ org, subscribers }: { org: OrganizationView; subscribers: OrgSubscriberView[] }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Subscribers" value={org.subscriberCount} />
        <StatCard label="Reach" value={org.reachLabel} />
      </div>

      {subscribers.length === 0 ? (
        <EmptyState
          icon={<Users className="size-6" />}
          title="No subscribers yet"
          message={
            org.isOwner
              ? "As people subscribe to your ministry, they'll appear here."
              : `Be the first to subscribe to ${org.name}.`
          }
        />
      ) : (
        <div className="flex flex-col divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/60 bg-card">
          {subscribers.map((s) => (
            <Link key={s.id} href={`/u/${s.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40">
              <Avatar initials={s.initials} color={s.color} image={s.image} name={s.name} />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{s.name}</p>
                <p className="truncate text-xs text-muted-foreground">{s.handle}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4">
      <p className="text-2xl font-bold tracking-tight">{value}</p>
      <p className="mt-0.5 text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
  )
}

function OrgAvatar({ org, className }: { org: OrganizationView; className?: string }) {
  return <Avatar initials={org.initials} color={org.color} image={org.logo} name={org.name} className={className} />
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
