import { cn } from "@/lib/utils"

export function LiveBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full bg-live px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-live-foreground",
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-live-foreground animate-live-pulse" />
      Live
    </span>
  )
}

export function ListenerCount({ count, className }: { count: number; className?: string }) {
  return (
    <span className={cn("text-xs font-medium text-muted-foreground tabular-nums", className)}>
      {count.toLocaleString()} listening
    </span>
  )
}
