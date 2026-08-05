import type { LucideIcon } from "lucide-react"
import { Sparkles } from "lucide-react"
import { Badge } from "@/components/ui/badge"

/**
 * Premium placeholder for reserved future modules. Keeps the console feeling
 * architecturally complete while signalling the feature is on the roadmap.
 */
export function ComingSoon({
  icon: Icon = Sparkles,
  title,
  description,
  bullets,
}: {
  icon?: LucideIcon
  title: string
  description: string
  bullets?: string[]
}) {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-border/70 bg-card/60 p-8 shadow-elevated backdrop-blur-xl sm:p-12">
      {/* Soft ambient glow */}
      <div className="pointer-events-none absolute -right-16 -top-16 size-64 rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 -left-10 size-64 rounded-full bg-primary/5 blur-3xl" />

      <div className="relative max-w-2xl space-y-6">
        <div className="flex items-center gap-4">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground ring-1 ring-inset ring-primary/20">
            <Icon className="size-7" />
          </div>
          <Badge variant="secondary" className="gap-1.5 rounded-full px-3 py-1">
            <Sparkles className="size-3.5" />
            Coming soon
          </Badge>
        </div>

        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-balance">{title}</h1>
          <p className="text-pretty text-base text-muted-foreground">{description}</p>
        </div>

        {bullets && bullets.length > 0 && (
          <ul className="grid gap-2 sm:grid-cols-2">
            {bullets.map((b) => (
              <li
                key={b}
                className="flex items-center gap-2.5 rounded-xl border border-border/60 bg-background/40 px-3 py-2.5 text-sm"
              >
                <span className="size-1.5 shrink-0 rounded-full bg-primary" />
                <span className="text-muted-foreground">{b}</span>
              </li>
            ))}
          </ul>
        )}

        <p className="text-xs text-muted-foreground">
          This module is reserved in the architecture and will activate in a future release.
        </p>
      </div>
    </div>
  )
}
