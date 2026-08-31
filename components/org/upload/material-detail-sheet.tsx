"use client"

import { useState } from "react"
import { Check, ExternalLink, ListPlus, Share2 } from "lucide-react"
import {
  type MaterialView,
  SOURCE_LABELS,
  buildEmbedUrl,
  formatMaterialDate,
  isEmbeddable,
} from "@/lib/materials"
import { cn } from "@/lib/utils"
import { SourceBadge, Thumbnail } from "./upload-primitives"
import { UploadSheet } from "./upload-primitives"

export function MaterialDetailSheet({
  material,
  isOwner,
  onOpenChange,
  onAddToPlaylist,
}: {
  material: MaterialView | null
  isOwner: boolean
  onOpenChange: (open: boolean) => void
  onAddToPlaylist: (m: MaterialView) => void
}) {
  const [copied, setCopied] = useState(false)
  const open = material !== null
  if (!material) {
    return <UploadSheet open={false} onOpenChange={onOpenChange} title="" children={null} />
  }

  const embed = isEmbeddable(material.source) ? buildEmbedUrl(material.source, material.url) : null

  async function share() {
    if (!material) return
    const shareData = { title: material.title, text: material.creator ?? "", url: material.url }
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share(shareData)
        return
      }
    } catch {
      // user cancelled or unsupported — fall through to clipboard
    }
    try {
      await navigator.clipboard.writeText(material.url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // ignore
    }
  }

  return (
    <UploadSheet
      open={open}
      onOpenChange={onOpenChange}
      title={material.title}
      description={material.creator ?? undefined}
    >
      <div className="space-y-5">
        {/* Player / poster */}
        <div className="overflow-hidden rounded-2xl border border-border/60 bg-black">
          {embed ? (
            <div className="aspect-video w-full">
              <iframe
                src={embed}
                title={material.title}
                loading="lazy"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                className="size-full"
              />
            </div>
          ) : (
            <a
              href={material.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group relative block aspect-video w-full"
            >
              <Thumbnail
                cover={material.cover}
                title={material.title}
                contentType={material.contentType}
                rounded="rounded-none"
                className="size-full"
              />
              <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/45 text-center transition-colors group-hover:bg-background/60">
                <span className="flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg">
                  <ExternalLink className="size-5" />
                </span>
                <span className="text-sm font-semibold text-foreground">Open on {SOURCE_LABELS[material.source]}</span>
              </span>
            </a>
          )}
        </div>

        {/* Meta line */}
        <div className="flex flex-wrap items-center gap-2">
          <SourceBadge source={material.source} contentType={material.contentType} className="bg-secondary" />
          {material.resourceDateMs && (
            <span className="text-xs text-muted-foreground">{formatMaterialDate(material.resourceDateMs)}</span>
          )}
          {material.duration && (
            <span className="text-xs tabular-nums text-muted-foreground">· {material.duration}</span>
          )}
          {material.category && (
            <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              {material.category}
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          <a
            href={material.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card/40 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-border"
          >
            <ExternalLink className="size-4" /> Open original
          </a>
          <button
            type="button"
            onClick={share}
            className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card/40 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-border"
          >
            {copied ? <Check className="size-4 text-primary" /> : <Share2 className="size-4" />}
            {copied ? "Link copied" : "Share"}
          </button>
          {isOwner && (
            <button
              type="button"
              onClick={() => onAddToPlaylist(material)}
              className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card/40 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-border"
            >
              <ListPlus className="size-4" /> Add to playlist
            </button>
          )}
        </div>

        {material.description && (
          <p className="whitespace-pre-wrap text-pretty text-sm leading-relaxed text-foreground/90">
            {material.description}
          </p>
        )}

        {material.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {material.tags.map((t) => (
              <span
                key={t}
                className={cn("rounded-full bg-secondary px-2.5 py-1 text-xs text-muted-foreground")}
              >
                #{t}
              </span>
            ))}
          </div>
        )}
      </div>
    </UploadSheet>
  )
}
