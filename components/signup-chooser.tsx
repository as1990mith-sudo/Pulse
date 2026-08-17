import Link from "next/link"
import { ArrowRight, Church, Globe, Radio } from "lucide-react"

// The global signup entry. Presents the two Frequency experiences as distinct
// paths — Home (organisations) and Universal (individuals) — so an org never
// accidentally creates an individual account, or vice versa. Home is presented
// first as the premium, foregrounded product.
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

      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-4 pb-16 pt-4 sm:px-6">
        <div className="mb-10 max-w-2xl sm:mb-14">
          <p className="mb-3 text-sm font-medium text-primary">Get started</p>
          <h1 className="text-3xl font-semibold leading-tight tracking-tight text-balance sm:text-4xl md:text-5xl">
            Choose how you want to experience Frequency.
          </h1>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground text-pretty sm:text-lg">
            Two ways in — a private digital home for your organisation, or a place among the wider Christian community.
          </p>
        </div>

        <div className="grid gap-4 sm:gap-5 lg:grid-cols-2">
          <PathCard
            href="/sign-up/home"
            featured
            icon={<Church className="size-6" />}
            cue="For churches, ministries & organisations"
            title="Your organisation. Your community. Your Home."
            description="Create a private digital home for your church, ministry or organisation."
            cta="Create a Frequency Home"
          />
          <PathCard
            href="/sign-up/universal"
            icon={<Globe className="size-6" />}
            cue="For individuals"
            title="Connect with the wider Christian community."
            description="Discover, connect and engage with people and organisations across Frequency."
            cta="Join Frequency Universal"
          />
        </div>
      </div>
    </main>
  )
}

function PathCard({
  href,
  icon,
  cue,
  title,
  description,
  cta,
  featured = false,
}: {
  href: string
  icon: React.ReactNode
  cue: string
  title: string
  description: string
  cta: string
  featured?: boolean
}) {
  return (
    <Link
      href={href}
      className={[
        "group relative flex flex-col justify-between overflow-hidden rounded-3xl border p-7 transition-all duration-300 sm:p-8",
        "hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        featured
          ? "border-primary/40 bg-card shadow-elevated hover:border-primary/60 hover:shadow-floating"
          : "border-border/60 bg-card/60 shadow-soft hover:border-border hover:bg-card hover:shadow-elevated",
      ].join(" ")}
    >
      <div>
        <div className="flex items-center justify-between">
          <span
            className={[
              "flex size-12 items-center justify-center rounded-2xl transition-colors",
              featured
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-foreground group-hover:bg-secondary",
            ].join(" ")}
          >
            {icon}
          </span>
          {featured && (
            <span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              Premium
            </span>
          )}
        </div>

        <p className="mt-6 text-xs font-medium uppercase tracking-wide text-muted-foreground">{cue}</p>
        <h2 className="mt-2 text-xl font-semibold leading-snug tracking-tight text-balance sm:text-2xl">{title}</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground text-pretty">{description}</p>
      </div>

      <span
        className={[
          "mt-8 inline-flex items-center gap-2 text-sm font-semibold transition-colors",
          featured ? "text-primary" : "text-foreground",
        ].join(" ")}
      >
        {cta}
        <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
      </span>
    </Link>
  )
}
