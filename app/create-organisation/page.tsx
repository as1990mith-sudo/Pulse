import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { SiteHeader } from "@/components/site-header"
import { CreateOrganisationForm } from "@/components/org/create-organisation-form"
import { getMyOrganization } from "@/app/actions/organizations"
import { getCurrentUser } from "@/lib/session"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

export const metadata: Metadata = {
  title: "Create your organisation · Frequency",
  description: "Turn your account into a ministry, church, or organisation page.",
}

export default async function CreateOrganisationPage() {
  const currentUser = await getCurrentUser()

  if (!currentUser) {
    return (
      <div className="min-h-screen">
        <SiteHeader />
        <main className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6">
          <Card className="flex flex-col items-center gap-3 p-10 text-center">
            <p className="text-lg font-semibold">Sign in to create an organisation</p>
            <p className="max-w-sm text-pretty text-sm leading-relaxed text-muted-foreground">
              You need an account before you can set up a ministry or organisation page.
            </p>
            <div className="flex gap-2">
              <Button render={<Link href="/sign-in" />} nativeButton={false}>
                Sign in
              </Button>
              <Button render={<Link href="/sign-up" />} nativeButton={false} variant="secondary">
                Create account
              </Button>
            </div>
          </Card>
        </main>
      </div>
    )
  }

  // If they already own an organisation, there's nothing to create — send them
  // straight to their profile.
  const existing = await getMyOrganization()
  if (existing) redirect(`/org/${existing.handle}`)

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold text-balance">Create your organisation</h1>
          <p className="mt-1 text-pretty text-sm leading-relaxed text-muted-foreground">
            Set up a page for your ministry, church, or organisation. You can edit every detail later from your
            profile.
          </p>
        </header>
        <CreateOrganisationForm initialName={currentUser.name ?? ""} />
      </main>
    </div>
  )
}
