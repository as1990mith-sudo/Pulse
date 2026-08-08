import { BadgeCheck } from "lucide-react"
import { cn } from "@/lib/utils"

const SIZES = {
  sm: "size-3.5",
  md: "size-[18px]",
  lg: "size-6",
} as const

/**
 * The official verification badge for a verified organisation. A filled
 * primary badge with a light check — the same mark used everywhere an
 * organisation appears (profile header, feed posts, discovery, etc.).
 */
export function VerifiedBadge({
  size = "md",
  className,
  label = "Verified organisation",
}: {
  size?: keyof typeof SIZES
  className?: string
  label?: string
}) {
  return (
    <BadgeCheck
      role="img"
      aria-label={label}
      className={cn("shrink-0 fill-primary text-primary-foreground", SIZES[size], className)}
    />
  )
}

/**
 * Wraps an avatar and overlays the verification badge on its bottom-right when
 * `verified` is true. Keep the avatar itself as the single child.
 */
export function AvatarWithBadge({
  verified,
  badgeSize = "sm",
  className,
  children,
}: {
  verified: boolean
  badgeSize?: keyof typeof SIZES
  className?: string
  children: React.ReactNode
}) {
  return (
    <span className={cn("relative inline-flex shrink-0", className)}>
      {children}
      {verified && (
        <VerifiedBadge
          size={badgeSize}
          className="absolute -bottom-0.5 -right-0.5 rounded-full bg-background ring-2 ring-background"
        />
      )}
    </span>
  )
}
