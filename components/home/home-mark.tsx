import { cn } from "@/lib/utils"

/**
 * A Home's avatar mark — its logo, or its initials on the org accent colour.
 *
 * Extracted so every surface that identifies a Home (the My Homes switcher, a
 * profile's active-Home context line, Live Notes meeting groups) renders the
 * same mark with the same fallback. Previously each surface hand-rolled the
 * `orgLogo ?? orgInitials` branch, which is how a Home ends up looking like a
 * different organisation depending on where you see it.
 *
 * Square-with-soft-corners (not a circle) is deliberate: it is the shape the My
 * Homes cards already use for organisations, which keeps organisations visually
 * distinct from people, who are always circular.
 */
export function HomeMark({
  name,
  logo,
  initials,
  color,
  className,
  rounded = "rounded-lg",
  labelled = false,
}: {
  name: string
  logo: string | null
  initials: string
  /** The org accent colour, used only when there's no logo. */
  color: string
  className?: string
  /** Corner rounding, so callers can scale it with the mark's size. */
  rounded?: string
  /**
   * Set when the mark stands alone without the Home's name beside it, so screen
   * readers still get the Home. Left off by default because the common case is
   * mark-next-to-name, where announcing the name twice is just noise.
   */
  labelled?: boolean
}) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden text-[10px] font-bold uppercase leading-none text-white",
        rounded,
        className ?? "size-5",
      )}
      style={{ backgroundColor: logo ? undefined : color }}
    >
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo || "/placeholder.svg"} alt="" className="size-full object-cover" aria-hidden />
      ) : (
        initials
      )}
      {labelled && <span className="sr-only">{name}</span>}
    </span>
  )
}
