import type { Metadata } from "next"
import { getViewerId } from "@/lib/home/access"
import { JoinHomeForm } from "@/components/home/join-home-form"
import { PoweredByFrequency } from "@/components/home/powered-by-frequency"
import { KeyRound } from "lucide-react"

export const metadata: Metadata = {
  title: "Join a Home",
  description: "Enter your organisation's Home key to join its Frequency Home.",
}

// Public on purpose: a prospective member can validate their Home key and see
// the organisation's identity BEFORE creating an account (spec §5). Only the
// final "join" step requires a signed-in Frequency identity — the form routes
// unauthenticated users to sign-up at that point, preserving the key.
export default async function JoinHomePage({
  searchParams,
}: {
  searchParams: Promise<{ to?: string; key?: string }>
}) {
  const viewerId = await getViewerId()
  const sp = await searchParams

  return (
    <main className="flex min-h-svh flex-col items-center justify-center px-5 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <KeyRound className="size-6" />
          </span>
          <h1 className="mt-5 text-2xl font-bold tracking-tight text-balance">Join your organisation&apos;s Home</h1>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground text-pretty">
            Enter the Home key shared by your organisation to enter its private Home.
          </p>
        </div>

        <JoinHomeForm initialKey={sp.key ?? ""} signedIn={!!viewerId} />

        <div className="mt-8 flex justify-center">
          <PoweredByFrequency />
        </div>
      </div>
    </main>
  )
}
