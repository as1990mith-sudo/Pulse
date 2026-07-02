import type { Metadata } from "next"
import Link from "next/link"
import { SiteHeader } from "@/components/site-header"
import { SavedView } from "@/components/saved-view"
import { getSavedItems } from "@/app/actions/share"
import { getCurrentUser } from "@/lib/session"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

export const metadata: Metadata = {
  title: "Saved · Frequency",
  description: "Your private collection of saved posts, episodes, devotionals, and moments.",
}

export default async function SavedPage() {
  const currentUser = await getCurrentUser()

  if (!currentUser) {
    return (
      <div className="min-h-screen">
        <SiteHeader />
        <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
          <Card className="flex flex-col items-center gap-3 p-10 text-center">
            <p className="text-lg font-semibold">Sign in to see your saved items</p>
            <p className="max-w-sm text-pretty text-sm leading-relaxed text-muted-foreground">
              Bookmarks are private to your account. Sign in to view everything you&apos;ve saved.
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

  const saved = await getSavedItems()

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main>
        <SavedView items={saved} />
      </main>
    </div>
  )
}
