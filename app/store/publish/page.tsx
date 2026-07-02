import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { SiteHeader } from "@/components/site-header"
import { PublishForm } from "@/components/store/publish-form"
import { getCurrentUser } from "@/lib/session"

export const metadata: Metadata = {
  title: "Sell on Frequency · Publish",
  description: "Publish a book or course to sell in the Frequency store.",
}

export const dynamic = "force-dynamic"

export default async function PublishPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/sign-in")

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main>
        <PublishForm />
      </main>
    </div>
  )
}
