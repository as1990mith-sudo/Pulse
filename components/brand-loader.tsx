import { Radio } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Premium, on-brand loading state. The orange brand tile breathes while two
 * broadcast rings pulse around it and a slim track shimmers below — used as the
 * route-level `loading.tsx` fallback so any interface that suspends still feels
 * polished and intentional rather than blank.
 */
export function BrandLoader({
  label = "Loading",
  fullScreen = true,
  className,
}: {
  label?: string
  fullScreen?: boolean
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-6",
        fullScreen ? "min-h-[100dvh] w-full" : "py-20",
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <div className="relative flex items-center justify-center">
        <span className="brand-loader__ring absolute inset-0 m-auto size-16 rounded-2xl border-[1.5px] border-primary/60" />
        <span
          className="brand-loader__ring absolute inset-0 m-auto size-16 rounded-2xl border-[1.5px] border-primary/60"
          style={{ animationDelay: "0.7s" }}
        />
        <span className="brand-loader__tile flex size-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-xl shadow-primary/30">
          <Radio className="size-7" />
        </span>
      </div>

      <div className="flex flex-col items-center gap-3">
        <span className="font-display text-lg font-semibold tracking-tight">Frequency</span>
        <span className="brand-loader__bar h-1 w-32 rounded-full bg-secondary" aria-hidden="true" />
      </div>

      <span className="sr-only">{label}</span>
    </div>
  )
}
