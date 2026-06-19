import Link from "next/link"
import { ShieldAlert } from "lucide-react"
import { getAdminUser } from "@/lib/admin"
import { getAdminContent } from "@/lib/content"
import { SiteHeader } from "@/components/site-header"
import { AdminDashboard } from "@/components/admin/admin-dashboard"
import { Button } from "@/components/ui/button"

export const metadata = {
  title: "Admin · Frequency",
}

export default async function AdminPage() {
  const admin = await getAdminUser()

  if (!admin) {
    return (
      <div className="min-h-screen">
        <SiteHeader />
        <main className="mx-auto flex w-full max-w-md flex-col items-center gap-4 px-4 py-24 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted">
            <ShieldAlert className="size-6 text-muted-foreground" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Admins only</h1>
          <p className="text-pretty text-muted-foreground">
            This area is for hosts. Sign in with an approved admin account to manage devotionals and episodes.
          </p>
          <Button render={<Link href="/sign-in" />} nativeButton={false}>
            Sign in
          </Button>
        </main>
      </div>
    )
  }

  const { devotionals, episodes } = await getAdminContent()

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
        <AdminDashboard adminName={admin.name} devotionals={devotionals} episodes={episodes} />
      </main>
    </div>
  )
}
