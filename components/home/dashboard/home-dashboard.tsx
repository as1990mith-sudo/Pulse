"use client"

import Link from "next/link"
import Image from "next/image"
import { ArrowUpRight, CalendarDays, MessageCircleQuestion, Radio, Sparkles, Users } from "lucide-react"
import type { HomeDashboardData } from "@/app/actions/home-surfaces"
import { cn } from "@/lib/utils"

type HomeSummary = {
  handle: string
  name: string
  logo: string | null
}

/**
 * The Home landing experience. Hierarchy is deliberate: a live session (rare,
 * urgent) takes the top slot when present; otherwise the organisation's latest
 * post leads. Everything below is a quiet, scannable row of entry points — no
 * dashboard clutter, no decorative filler.
 */
export function HomeDashboard({ data, home }: { data: HomeDashboardData; home: HomeSummary }) {
  const { latestPost, nextEvent, liveNow, recentCommunity } = data
  const base = `/home/${home.handle}`

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-28 pt-5 md:pb-10 md:pt-8">
      <Welcome name={home.name} />

      {liveNow && (
        <Link
          href={`${base}/live`}
          className="group mt-5 flex items-center gap-3 overflow-hidden rounded-2xl border border-[var(--home-accent)]/40 bg-[var(--home-accent)]/10 p-4 transition-colors hover:bg-[var(--home-accent)]/15"
        >
          <span className="relative flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--home-accent)]/20">
            <Radio className="size-5 text-[var(--home-accent)]" />
            <span className="absolute right-0 top-0 size-2.5 animate-pulse rounded-full bg-[var(--home-accent)] ring-2 ring-background" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--home-accent)]">
              Live now
            </span>
            <span className="mt-0.5 block truncate text-sm font-medium text-foreground">{liveNow.title}</span>
          </span>
          <ArrowUpRight className="size-4 shrink-0 text-[var(--home-accent)] transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </Link>
      )}

      {/* Lead slot — the organisation's most recent post. */}
      <section className="mt-5">
        <SectionLabel icon={<Sparkles className="size-3.5" />}>Latest from {home.name}</SectionLabel>
        {latestPost ? (
          <Link
            href={`${base}/feed`}
            className="group mt-2 block overflow-hidden rounded-2xl border border-border/60 bg-card transition-colors hover:border-border"
          >
            {latestPost.media[0]?.type === "image" && (
              <div className="relative aspect-[16/9] w-full overflow-hidden bg-muted">
                <Image
                  src={latestPost.media[0].url || "/placeholder.svg"}
                  alt=""
                  fill
                  className="object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                  sizes="(max-width: 768px) 100vw, 640px"
                />
              </div>
            )}
            <div className="p-4">
              <p className="line-clamp-4 whitespace-pre-wrap text-[15px] leading-relaxed text-foreground">
                {latestPost.text || "View the latest update"}
              </p>
              <p className="mt-3 text-xs text-muted-foreground">{latestPost.postedAt}</p>
            </div>
          </Link>
        ) : (
          <EmptyState
            className="mt-2"
            icon={<Sparkles className="size-5" />}
            title="No posts yet"
            body={`When ${home.name} shares an update, it appears here first.`}
          />
        )}
      </section>

      {/* Secondary entry points. */}
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <TileCard
          href={`${base}/events`}
          icon={<CalendarDays className="size-4" />}
          label="Next event"
          className="sm:col-span-2"
        >
          {nextEvent ? (
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate font-medium text-foreground">{nextEvent.title}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{nextEvent.dateLabel}</span>
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">Nothing scheduled yet</span>
          )}
        </TileCard>

        <TileCard href={`${base}/community`} icon={<MessageCircleQuestion className="size-4" />} label="Community Help">
          {recentCommunity ? (
            <span className="line-clamp-2 text-sm text-foreground/90">{recentCommunity.body || "Join the conversation"}</span>
          ) : (
            <span className="text-sm text-muted-foreground">Start the first conversation</span>
          )}
        </TileCard>

        <TileCard href={`${base}/rooms`} icon={<Users className="size-4" />} label="Rooms">
          <span className="text-sm text-muted-foreground">Gather with your community</span>
        </TileCard>
      </div>
    </div>
  )
}

function Welcome({ name }: { name: string }) {
  return (
    <header>
      <p className="text-sm text-muted-foreground">Welcome back to</p>
      <h1 className="mt-0.5 text-pretty text-2xl font-semibold tracking-tight text-foreground">{name}</h1>
    </header>
  )
}

function SectionLabel({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      <span className="text-[var(--home-accent)]">{icon}</span>
      {children}
    </div>
  )
}

function TileCard({
  href,
  icon,
  label,
  children,
  className,
}: {
  href: string
  icon: React.ReactNode
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group flex flex-col gap-2 rounded-2xl border border-border/60 bg-card p-4 transition-colors hover:border-border",
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <span className="text-[var(--home-accent)]">{icon}</span>
          {label}
        </span>
        <ArrowUpRight className="size-4 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-foreground" />
      </div>
      {children}
    </Link>
  )
}

function EmptyState({
  icon,
  title,
  body,
  className,
}: {
  icon: React.ReactNode
  title: string
  body: string
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-card/40 px-6 py-10 text-center",
        className,
      )}
    >
      <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
        {icon}
      </span>
      <p className="mt-3 text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 max-w-xs text-pretty text-sm text-muted-foreground">{body}</p>
    </div>
  )
}
