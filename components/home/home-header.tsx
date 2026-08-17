import Link from "next/link"
import { Building2, Users } from "lucide-react"
import type { HomeView } from "@/lib/home/types"
import { homeAccentStyle } from "@/lib/home/accent"
import { PoweredByFrequency } from "./powered-by-frequency"

// The primary visual identity of a Home. The organisation's cover and logo
// lead; the accent colour tints the surface. Frequency appears only as a small
// "Powered by Frequency" mark — this is the organisation's home, not Frequency
// wearing the organisation's logo.
export function HomeHeader({
  home,
  action,
}: {
  home: HomeView
  action?: React.ReactNode
}) {
  return (
    <header className="relative overflow-hidden rounded-b-3xl border-b border-border/60" style={homeAccentStyle(home)}>
      {/* Cover */}
      <div className="relative h-32 w-full sm:h-44">
        {home.orgCover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={home.orgCover || "/placeholder.svg"} alt="" className="size-full object-cover" />
        ) : (
          <div
            className="size-full"
            style={{
              background: `linear-gradient(135deg, var(--home-accent) 0%, color-mix(in oklab, var(--home-accent) 55%, #000) 100%)`,
            }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background/95 via-background/30 to-transparent" />
        <div className="absolute right-4 top-4">
          <PoweredByFrequency className="rounded-full bg-background/70 px-2.5 py-1 backdrop-blur-sm" />
        </div>
      </div>

      {/* Identity row */}
      <div className="relative -mt-10 px-5 pb-5 sm:px-8">
        <div className="flex items-end gap-4">
          <div
            className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl text-2xl font-bold text-white shadow-lg ring-4 ring-background sm:size-24"
            style={{ backgroundColor: "var(--home-accent)" }}
          >
            {home.orgLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={home.orgLogo || "/placeholder.svg"} alt={home.orgName} className="size-full object-cover" />
            ) : (
              home.orgInitials
            )}
          </div>
          {action && <div className="mb-1 ml-auto">{action}</div>}
        </div>

        <div className="mt-4">
          <h1 className="text-2xl font-bold tracking-tight text-balance sm:text-3xl">{home.name}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Building2 className="size-3.5" /> {home.orgCategoryLabel}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Users className="size-3.5" /> {home.memberCount} {home.memberCount === 1 ? "member" : "members"}
            </span>
            <Link href={`/org/${home.handle}`} className="text-primary hover:underline">
              View public profile
            </Link>
          </div>
          {home.orgDescription && (
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-foreground/80 text-pretty">
              {home.orgDescription}
            </p>
          )}
        </div>
      </div>
    </header>
  )
}
