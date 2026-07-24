import Link from "next/link"
import { ShieldAlert } from "lucide-react"
import { getAdminActor } from "@/lib/admin-auth"
import { Button } from "@/components/ui/button"
import { AdminShell } from "@/components/admin/shell/admin-shell"

export const metadata = {
  title: "Admin Console · Frequency",
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const actor = await getAdminActor()

  if (!actor) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="flex w-full max-w-md flex-col items-center gap-4 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive ring-1 ring-inset ring-destructive/20">
            <ShieldAlert className="size-7" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Restricted area</h1>
          <p className="text-pretty text-muted-foreground">
            The Admin Console is limited to authorized staff. Sign in with an approved admin account to continue.
          </p>
          <div className="flex gap-2">
            <Button render={<Link href="/sign-in" />} nativeButton={false}>
              Sign in
            </Button>
            <Button variant="ghost" render={<Link href="/" />} nativeButton={false}>
              Back to app
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return <AdminShell actor={actor}>{children}</AdminShell>
}
