import { redirect } from "next/navigation"
import { ITestify } from "@/components/itestify"
import { getChannelFeed } from "@/app/actions/feed"
import { getCurrentUser } from "@/lib/session"

export const metadata = {
  title: "iTestify — Frequency",
  description: "Share what God has done — testimonies that build faith across the Frequency community.",
}

export default async function ITestifyPage() {
  const currentUser = await getCurrentUser()
  if (!currentUser) redirect("/sign-in")

  const initialPosts = await getChannelFeed("itestify")

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden">
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-hidden">
        <ITestify initialPosts={initialPosts} currentUser={currentUser} />
      </main>
    </div>
  )
}
