import { Radio } from "lucide-react"
import { cn } from "@/lib/utils"

// Subtle platform attribution. Present but never dominant — the organisation's
// own identity leads inside a Home; Frequency stays quietly in the background.
export function PoweredByFrequency({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs text-muted-foreground/70", className)}>
      <Radio className="size-3" />
      Powered by Frequency
    </span>
  )
}
