import { cn } from "@/lib/utils"

/**
 * Shimmering placeholder used while content loads — preferred over spinners.
 * Uses the shared `.skeleton` utility (shimmer sweep + reduced-motion aware)
 * defined in globals.css, so timing/easing stay consistent app-wide.
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="skeleton" className={cn("skeleton", className)} {...props} />
}

export { Skeleton }
