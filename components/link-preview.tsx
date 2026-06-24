"use client"

import useSWR from "swr"
import { ExternalLink, LinkIcon } from "lucide-react"
import { cn } from "@/lib/utils"

type Preview = {
  url: string
  title: string | null
  description: string | null
  image: string | null
  siteName: string | null
}

const fetcher = async (key: string): Promise<Preview | null> => {
  const res = await fetch(key)
  if (!res.ok) return null
  const data = await res.json()
  if (!data || data.error || (!data.title && !data.image && !data.description)) return null
  return data as Preview
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return url
  }
}

/**
 * Renders a rich Open Graph preview card for a URL, with the raw link shown
 * just beneath it. Falls back to a simple link chip while loading or when the
 * target has no usable metadata, so a shared link always renders gracefully.
 *
 * `compact` renders a small, horizontal WhatsApp-style card (thumbnail beside
 * the text) suited to chat bubbles. The default renders the larger stacked card
 * used in the feed.
 */
export function LinkPreview({
  url,
  className,
  compact = false,
}: {
  url: string
  className?: string
  compact?: boolean
}) {
  const { data, isLoading } = useSWR(`/api/link-preview?url=${encodeURIComponent(url)}`, fetcher, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  })

  const host = hostOf(url)

  // The bare link, always shown below the card.
  const linkRow = (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground underline-offset-2 [overflow-wrap:anywhere] hover:text-foreground hover:underline"
    >
      <LinkIcon className="size-3 shrink-0" />
      <span className="truncate">{url}</span>
    </a>
  )

  // ---- Compact (chat) variant ------------------------------------------------
  if (compact) {
    if (isLoading) {
      return (
        <div className={cn("w-full max-w-[15rem]", className)}>
          <div className="flex items-center gap-3 overflow-hidden rounded-xl border border-border/60 bg-card/40 p-2">
            <div className="size-12 shrink-0 animate-pulse rounded-lg bg-muted" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
              <div className="h-2.5 w-1/2 animate-pulse rounded bg-muted" />
            </div>
          </div>
        </div>
      )
    }

    if (!data) {
      return (
        <div className={cn("w-full max-w-[15rem]", className)}>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-2.5 rounded-xl border border-border/60 bg-card/40 px-2.5 py-2 transition-colors hover:bg-card/70"
          >
            <ExternalLink className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0">
              <span className="block truncate text-xs font-semibold text-foreground">{host}</span>
              <span className="block truncate text-[11px] text-muted-foreground">{url}</span>
            </span>
          </a>
        </div>
      )
    }

    return (
      <div className={cn("w-full max-w-[15rem]", className)}>
        <a
          href={data.url || url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="flex items-stretch gap-2.5 overflow-hidden rounded-xl border border-border/60 bg-card/40 p-2 transition-colors hover:bg-card/70"
        >
          {data.image && (
            <div className="size-12 shrink-0 overflow-hidden rounded-lg bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={data.image || "/placeholder.svg"} alt="" className="size-full object-cover" loading="lazy" />
            </div>
          )}
          <div className="flex min-w-0 flex-1 flex-col justify-center">
            <p className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {data.siteName || host}
            </p>
            {data.title && (
              <p className="line-clamp-2 text-xs font-semibold leading-snug text-foreground">{data.title}</p>
            )}
          </div>
        </a>
      </div>
    )
  }

  // ---- Full (feed) variant ---------------------------------------------------
  if (isLoading) {
    return (
      <div className={cn("w-full", className)}>
        <div className="overflow-hidden rounded-xl border border-border/60 bg-card/40">
          <div className="h-32 w-full animate-pulse bg-muted" />
          <div className="space-y-2 p-3">
            <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
            <div className="h-3.5 w-3/4 animate-pulse rounded bg-muted" />
            <div className="h-3 w-full animate-pulse rounded bg-muted" />
          </div>
        </div>
        {linkRow}
      </div>
    )
  }

  // No metadata: still show the link, just without a rich card.
  if (!data) {
    return (
      <div className={cn("w-full", className)}>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-card/40 px-3 py-2.5 transition-colors hover:bg-card/70"
        >
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-foreground">{host}</span>
            <span className="block truncate text-xs text-muted-foreground [overflow-wrap:anywhere]">{url}</span>
          </span>
          <ExternalLink className="size-4 shrink-0 text-muted-foreground" />
        </a>
      </div>
    )
  }

  return (
    <div className={cn("w-full", className)}>
      <a
        href={data.url || url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="group block overflow-hidden rounded-xl border border-border/60 bg-card/40 transition-colors hover:bg-card/70"
      >
        {data.image && (
          <div className="aspect-[1.91/1] w-full overflow-hidden bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={data.image || "/placeholder.svg"}
              alt=""
              className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
              loading="lazy"
            />
          </div>
        )}
        <div className="space-y-1 p-3">
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <span className="truncate">{data.siteName || host}</span>
          </p>
          {data.title && (
            <p className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">{data.title}</p>
          )}
          {data.description && (
            <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">{data.description}</p>
          )}
        </div>
      </a>
      {linkRow}
    </div>
  )
}
