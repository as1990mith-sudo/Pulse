import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { ArrowRight, KeyRound, Plus, Radio } from "lucide-react"
import { getMyHomes, getViewerId } from "@/lib/home/access"
import { HomeCard } from "@/components/home/home-card"
import { PoweredByFrequency } from "@/components/home/powered-by-frequency"

export const metadata: Metadata = {
  title: "Frequency Home",
  description: "Your organisation's private digital home.",
}

export default async function HomeHubPage() {
  const viewerId = await getViewerId()
  if (!viewerId) redirect("/sign-in?next=/home")

  const homes = await getMyHomes()

  return (
    <main className="mx-auto min-h-svh w-full max-w-3xl px-5 py-10 sm:px-8">
      <header className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Radio className="size-4.5" />
          </span>
          <div>
            <h1 className="text-lg font-bold leading-none tracking-tight">Frequency Home</h1>
            <p className="mt-1 text-xs text-muted-foreground">Your private community spaces</p>
          </div>
        </div>
      </header>

      {homes.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-6">
          <section className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Your Homes</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {homes.map((h) => (
                <HomeCard key={h.id} home={h} />
              ))}
            </div>
          </section>

          <div className="grid gap-3 sm:grid-cols-2">
            <ActionTile
              href="/home/join"
              icon={<KeyRound className="size-5" />}
              title="Join another Home"
              desc="Enter an authorisation key"
            />
            <ActionTile
              href="/sign-up/home"
              icon={<Plus className="size-5" />}
              title="Create a Home"
              desc="For your church or ministry"
            />
          </div>
        </div>
      )}

      <div className="mt-12 flex justify-center">
        <PoweredByFrequency />
      </div>
    </main>
  )
}

function EmptyState() {
  return (
    <div className="rounded-3xl border border-border/60 bg-card p-8 text-center sm:p-12">
      <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <KeyRound className="size-6" />
      </span>
      <h2 className="mt-5 text-xl font-bold tracking-tight text-balance">You're not part of a Home yet</h2>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground text-pretty">
        Join your organisation's private Home with an authorisation key, or create a new Home for your church or
        ministry.
      </p>
      <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Link
          href="/home/join"
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-transform active:scale-[0.99] sm:w-auto"
        >
          <KeyRound className="size-4" /> Enter an authorisation key
        </Link>
        <Link
          href="/sign-up/home"
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border px-5 py-3 text-sm font-semibold transition-colors hover:bg-accent sm:w-auto"
        >
          Create a Home <ArrowRight className="size-4" />
        </Link>
      </div>
    </div>
  )
}

function ActionTile({
  href,
  icon,
  title,
  desc,
}: {
  href: string
  icon: React.ReactNode
  title: string
  desc: string
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-2xl border border-border/60 bg-card p-4 transition-colors hover:border-primary/40 hover:bg-accent/40"
    >
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{title}</p>
        <p className="truncate text-xs text-muted-foreground">{desc}</p>
      </div>
      <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </Link>
  )
}
