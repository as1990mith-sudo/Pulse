import Link from "next/link"
import { ArrowRight, KeyRound, Radio, Sparkles } from "lucide-react"
import { PoweredByFrequency } from "@/components/home/powered-by-frequency"

/**
 * The Frequency Home front door (spec §3). Before a member has created or joined
 * a Home there is no generic public feed — only two clear paths: set up a new
 * Home for an organisation, or join an existing one with its Home key. Signed-in
 * members without a Home see this; so do first-time visitors (with a sign-in
 * link), because Home is only useful once you're inside one.
 */
export function HomeEntry({ signedIn }: { signedIn: boolean }) {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-xl flex-col justify-center px-5 py-12 sm:px-8">
      <header className="mb-10 flex flex-col items-center text-center">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-soft">
          <Radio className="size-7" />
        </span>
        <h1 className="mt-5 text-3xl font-bold tracking-tight text-balance sm:text-4xl">Welcome to Frequency Home</h1>
        <p className="mt-3 max-w-md text-pretty leading-relaxed text-muted-foreground">
          Your organisation&apos;s own private Frequency — its feed, articles, live sessions, events and members, all in
          one place.
        </p>
      </header>

      <div className="flex flex-col gap-4">
        <EntryCard
          href="/sign-up/home"
          icon={<Sparkles className="size-6" />}
          title="Set Up Your Home"
          desc="Create a new Home for your church, charity, coaching practice, school or organisation."
          primary
        />
        <EntryCard
          href="/home/join"
          icon={<KeyRound className="size-6" />}
          title="Join A Home"
          desc="Enter your organisation's unique Home key to join an existing Home."
        />
      </div>

      {!signedIn && (
        <p className="mt-8 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/sign-in" className="font-semibold text-primary underline-offset-4 hover:underline">
            Sign in
          </Link>
        </p>
      )}

      <div className="mt-12 flex justify-center">
        <PoweredByFrequency />
      </div>
    </main>
  )
}

function EntryCard({
  href,
  icon,
  title,
  desc,
  primary,
}: {
  href: string
  icon: React.ReactNode
  title: string
  desc: string
  primary?: boolean
}) {
  return (
    <Link
      href={href}
      className={
        primary
          ? "group flex items-start gap-4 rounded-2xl border border-primary/40 bg-primary/[0.06] p-5 transition-colors hover:bg-primary/[0.1] active:scale-[0.99]"
          : "group flex items-start gap-4 rounded-2xl border border-border/60 bg-card p-5 transition-colors hover:bg-accent active:scale-[0.99]"
      }
    >
      <span
        className={
          primary
            ? "flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground"
            : "flex size-12 shrink-0 items-center justify-center rounded-xl bg-secondary text-foreground"
        }
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className="text-lg font-bold tracking-tight">{title}</span>
          <ArrowRight className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </span>
        <span className="mt-1 block text-pretty text-sm leading-relaxed text-muted-foreground">{desc}</span>
      </span>
    </Link>
  )
}
