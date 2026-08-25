import type { Metadata } from "next"
import Link from "next/link"
import { Bell, ChevronRight } from "lucide-react"
import { SiteHeader } from "@/components/site-header"
import { MentionPrivacyControl } from "@/components/settings/mention-privacy-control"
import { getMyMentionPrivacy } from "@/app/actions/mentions"
import { getCurrentUser } from "@/lib/session"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

export const metadata: Metadata = {
  title: "Privacy · Frequency",
  description: "Control who can @mention you across posts and articles.",
}

export default async function PrivacySettingsPage() {
  const currentUser = await getCurrentUser()

  if (!currentUser) {
    return (
      <div className="min-h-screen">
        <SiteHeader />
        <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
          <Card className="flex flex-col items-center gap-3 p-10 text-center">
            <p className="text-lg font-semibold">Sign in to manage your privacy</p>
            <p className="max-w-sm text-pretty text-sm leading-relaxed text-muted-foreground">
              These settings are private to your account. Sign in to control who can mention you.
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

  const privacy = await getMyMentionPrivacy()

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold text-balance">Privacy</h1>
          <p className="mt-1 text-pretty text-sm leading-relaxed text-muted-foreground">
            Manage how other members can interact with you.
          </p>
        </header>
        <div className="flex flex-col gap-4">
          <MentionPrivacyControl initialValue={privacy} />

          {/* Notifications live on their own screen — device permission, per-category
              toggles and platform-specific help are too much to inline here. */}
          <Link href="/settings/notifications" className="block">
            <Card interactive className="flex-row items-center gap-3 p-5 transition-colors hover:bg-muted/50">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-foreground">
                <Bell className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold leading-tight">Manage notifications</span>
                <span className="mt-0.5 block text-pretty text-sm leading-relaxed text-muted-foreground">
                  Choose what reaches your devices, from lives to replies.
                </span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            </Card>
          </Link>
        </div>
      </main>
    </div>
  )
}
