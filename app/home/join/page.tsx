import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { getViewerId } from "@/lib/home/access"
import { JoinHomeForm } from "@/components/home/join-home-form"
import { PoweredByFrequency } from "@/components/home/powered-by-frequency"
import { KeyRound } from "lucide-react"

export const metadata: Metadata = {
  title: "Join a Home",
  description: "Enter your organisation's authorisation key to join its Frequency Home.",
}

export default async function JoinHomePage({
  searchParams,
}: {
  searchParams: Promise<{ to?: string; key?: string }>
}) {
  const viewerId = await getViewerId()
  const sp = await searchParams
  if (!viewerId) {
    const params = new URLSearchParams({ next: "/home/join" })
    redirect(`/sign-in?${params.toString()}`)
  }

  return (
    <main className="flex min-h-svh flex-col items-center justify-center px-5 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <KeyRound className="size-6" />
          </span>
          <h1 className="mt-5 text-2xl font-bold tracking-tight text-balance">Join your organisation's Home</h1>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground text-pretty">
            Enter the authorisation key shared by your church, ministry or organisation to enter its private Home.
          </p>
        </div>

        <JoinHomeForm initialKey={sp.key ?? ""} />

        <div className="mt-8 flex justify-center">
          <PoweredByFrequency />
        </div>
      </div>
    </main>
  )
}
