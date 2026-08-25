import { Pin } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Marks a post that an admin has pinned to the top of a feed.
 *
 * Shown to EVERY viewer, not just admins: without it a pinned post looks like it
 * is simply the newest, which is confusing when it is in fact days old. The label
 * spells out why the post is first rather than relying on the icon alone.
 */
export function PinnedBadge({ className }: { className?: string }) {
  return (
    <p className={cn("flex items-center gap-1.5 text-xs font-medium text-muted-foreground", className)}>
      {/* Decorative: the adjacent "Pinned" text already carries the meaning. */}
      <Pin className="size-3.5 shrink-0 fill-current" aria-hidden="true" />
      Pinned
    </p>
  )
}
