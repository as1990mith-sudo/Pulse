import Link from "next/link"
import { ChevronLeft, ChevronRight, type LucideIcon } from "lucide-react"
import { SiteHeader } from "@/components/site-header"
import { cn } from "@/lib/utils"

/**
 * Shared chrome for every Account screen: the global header, a quiet back link
 * to the parent, and a large display title. Keeps the section visually uniform
 * and the copy minimal — a title, no explanatory paragraph unless a page adds
 * one deliberately.
 */
export function AccountPageShell({
  title,
  backHref = "/account",
  backLabel = "Account",
  children,
}: {
  title: string
  backHref?: string
  backLabel?: string
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl px-4 pb-28 pt-5 sm:px-6">
        <Link
          href={backHref}
          className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          {backLabel}
        </Link>
        <h1 className="mb-6 font-display text-3xl font-semibold tracking-tight text-balance">{title}</h1>
        {children}
      </main>
    </div>
  )
}

/** A titled group of rows, rendered as one seamless divided card. */
export function AccountGroup({
  label,
  children,
}: {
  label?: string
  children: React.ReactNode
}) {
  return (
    <section className="mb-6">
      {label && (
        <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</h2>
      )}
      <div className="overflow-hidden rounded-2xl bg-card ring-1 ring-foreground/10">
        <div className="flex flex-col divide-y divide-border/60">{children}</div>
      </div>
    </section>
  )
}

const rowBase =
  "group flex min-h-[60px] w-full items-center gap-4 px-4 text-left transition-colors hover:bg-secondary/50 active:bg-secondary/70"

/** A navigational Account row: icon bubble, label, chevron. */
export function AccountRow({
  href,
  icon: Icon,
  label,
  value,
  external,
  destructive,
}: {
  href: string
  icon: LucideIcon
  label: string
  value?: string
  external?: boolean
  destructive?: boolean
}) {
  const inner = (
    <>
      <IconBubble icon={Icon} destructive={destructive} />
      <span
        className={cn(
          "flex-1 text-[15px] font-medium",
          destructive ? "text-destructive" : "text-foreground",
        )}
      >
        {label}
      </span>
      {value && <span className="max-w-[45%] truncate text-sm text-muted-foreground">{value}</span>}
      <ChevronRight className="size-5 shrink-0 text-muted-foreground/50" aria-hidden />
    </>
  )
  if (external) {
    return (
      <a href={href} className={rowBase}>
        {inner}
      </a>
    )
  }
  return (
    <Link href={href} prefetch className={rowBase}>
      {inner}
    </Link>
  )
}

/** A read-only Account row: label on the left, value on the right. */
export function AccountInfoRow({
  icon: Icon,
  label,
  value,
  valueSlot,
}: {
  icon: LucideIcon
  label: string
  value?: string
  valueSlot?: React.ReactNode
}) {
  return (
    <div className="flex min-h-[60px] w-full items-center gap-4 px-4">
      <IconBubble icon={Icon} />
      <span className="flex-1 text-[15px] font-medium text-foreground">{label}</span>
      {valueSlot ?? <span className="max-w-[50%] truncate text-sm text-muted-foreground">{value}</span>}
    </div>
  )
}

function IconBubble({ icon: Icon, destructive }: { icon: LucideIcon; destructive?: boolean }) {
  return (
    <span
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-xl transition-transform duration-150 group-active:scale-105",
        destructive ? "bg-destructive/15 text-destructive" : "bg-secondary/70 text-foreground",
      )}
    >
      <Icon className="size-[21px]" />
    </span>
  )
}
