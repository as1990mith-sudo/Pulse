import Link from "next/link"
import { ArrowRight, Building2, Radio, UserRound } from "lucide-react"

// The global signup entry. Presents the two Frequency experiences as distinct
// paths — Home (organisations) and Universal (individuals) — so an org never
// accidentally creates an individual account, or vice versa. Organisation is
// the premium, foregrounded product (orange); Individual is the complementary
// path (blue). The blue accent is defined inline because the theme's only brand
// hue is the orange primary — a single well-placed second accent, used sparingly.
const BLUE = {
  tile: "bg-[oklch(0.62_0.19_255_/_0.14)] text-[oklch(0.78_0.13_250)] ring-1 ring-inset ring-[oklch(0.62_0.19_255_/_0.30)]",
  border: "border-[oklch(0.62_0.19_255_/_0.45)]",
  borderHover: "hover:border-[oklch(0.62_0.19_255_/_0.65)]",
  glow: "bg-[oklch(0.62_0.19_255_/_0.16)]",
  cta: "text-[oklch(0.78_0.13_250)]",
} as const

export function SignupChooser() {
  return (
    <main className="flex min-h-svh flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-6 sm:px-6">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Radio className="size-4" />
          </span>
          <span className="text-lg font-semibold tracking-tight">Frequency</span>
        </Link>
        <Link
          href="/sign-in"
          className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          Sign in
        </Link>
      </header>

      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center px-4 pb-16 pt-4 sm:px-6">
        <div className="mb-8 sm:mb-10">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-primary">Get started</p>
          <h1 className="text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl">
            Choose how you
            <br />
            connect
          </h1>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:gap-5">
          <PathCard
            href="/sign-up/home"
            featured
            icon={<Building2 className="size-6" strokeWidth={2} />}
            title="Organisation"
            description="Create a private home for your organisation"
            cta="Create"
          />
          <PathCard
            href="/home/join"
            icon={<UserRound className="size-6" strokeWidth={2} />}
            title="Individual"
            description="Join as a member of an organisation. Have your organisation key ready."
            cta="Enter key"
          />
        </div>
      </div>
    </main>
  )
}

function PathCard({
  href,
  icon,
  title,
  description,
  cta,
  featured = false,
}: {
  href: string
  icon: React.ReactNode
  title: string
  description: string
  cta: string
  featured?: boolean
}) {
  return (
    <Link
      href={href}
      className={[
        "group relative flex flex-col justify-between overflow-hidden rounded-3xl border p-4 transition-all duration-300 sm:p-7",
        "hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        featured
          ? "border-primary/50 bg-card shadow-elevated hover:border-primary/70 hover:shadow-floating"
          : `${BLUE.border} bg-card/70 shadow-soft ${BLUE.borderHover} hover:bg-card hover:shadow-elevated`,
      ].join(" ")}
    >
      {/* Soft accent glow bleeding down from the top corner — orange for the
          premium org card, blue for the individual card. Purely atmospheric. */}
      <div
        aria-hidden
        className={[
          "pointer-events-none absolute -right-10 -top-16 size-40 rounded-full blur-3xl transition-opacity duration-300",
          featured ? "bg-primary/20" : BLUE.glow,
          "opacity-70 group-hover:opacity-100",
        ].join(" ")}
      />

      <div className="relative">
        <div className="flex items-start justify-between">
          <span
            className={[
              "flex size-12 items-center justify-center rounded-2xl transition-transform duration-300 group-hover:scale-[1.04] sm:size-14",
              featured ? "bg-primary text-primary-foreground shadow-elevated" : BLUE.tile,
            ].join(" ")}
          >
            {icon}
          </span>
          {featured && (
            <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary-foreground sm:px-2.5 sm:py-1 sm:text-[11px]">
              Premium
            </span>
          )}
        </div>

        <h2 className="mt-4 text-xl font-bold leading-tight tracking-tight sm:mt-6 sm:text-2xl">{title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground text-pretty sm:text-[15px]">{description}</p>
      </div>

      <span
        className={[
          "relative mt-6 inline-flex items-center gap-1.5 text-sm font-semibold transition-colors sm:mt-8 sm:text-[15px]",
          featured ? "text-primary" : BLUE.cta,
        ].join(" ")}
      >
        {cta}
        <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
      </span>
    </Link>
  )
}
