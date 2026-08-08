import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { discoverOrganizations, needsOnboarding } from "@/app/actions/organizations"
import { WelcomeOnboarding } from "@/components/org/welcome-onboarding"

export const metadata: Metadata = {
  title: "Welcome to Frequency",
  description: "Subscribe to ministries to personalise your feed.",
}

export default async function WelcomePage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect("/sign-in")

  // Organisation owners and already-onboarded users skip straight to the feed.
  const needs = await needsOnboarding()
  if (!needs) redirect("/feed")

  const orgs = await discoverOrganizations({})

  return (
    <main className="flex min-h-svh flex-col">
      <WelcomeOnboarding orgs={orgs} name={session.user.name?.split(/\s+/)[0] ?? ""} />
    </main>
  )
}
