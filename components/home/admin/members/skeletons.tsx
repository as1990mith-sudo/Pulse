"use client"

// Premium skeletons that preserve the command-centre layout while data loads —
// snapshot strip, leaderboard and directory rows — so nothing ever flashes blank.
function Shimmer({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-foreground/[0.06] ${className ?? ""}`} />
}

export function MembersSkeleton() {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-2">
          <Shimmer className="h-6 w-28" />
          <Shimmer className="h-3 w-20" />
        </div>
        <Shimmer className="h-8 w-24 rounded-full" />
      </div>

      <div className="flex gap-3 rounded-2xl border border-border/50 bg-card/50 p-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex min-w-[5rem] flex-col gap-2">
            <Shimmer className="h-2.5 w-14" />
            <Shimmer className="h-6 w-12" />
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-border/50 bg-card/50 p-4">
        <Shimmer className="mb-3 h-3 w-24" />
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Shimmer className="size-9 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Shimmer className="h-3.5 w-32" />
                <Shimmer className="h-2.5 w-40" />
              </div>
              <Shimmer className="h-6 w-8" />
            </div>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border/50 bg-card/40">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 border-b border-border/40 px-4 py-3 last:border-0">
            <Shimmer className="size-10 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Shimmer className="h-3.5 w-40" />
              <Shimmer className="h-2.5 w-28" />
            </div>
            <Shimmer className="h-3 w-24" />
          </div>
        ))}
      </div>
    </div>
  )
}
