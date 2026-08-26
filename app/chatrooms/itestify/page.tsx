import { redirect } from "next/navigation"
import { ITestify } from "@/components/itestify"
import { getChannelFeed } from "@/app/actions/feed"
import { getCurrentUser } from "@/lib/session"
import { getActiveHomeContext } from "@/lib/home/active-home"

export const metadata = {
  title: "iTestify — Frequency",
  description: "Share what God has done — testimonies that build faith across the Frequency community.",
}

export default async function ITestifyPage() {
  const currentUser = await getCurrentUser()
  if (!currentUser) redirect("/sign-in")

  // Scoped to the active Home, exactly as the /chatrooms hub does. This route
  // renders the same room with different chrome, so leaving it unscoped here
  // would make it a bypass that shows another Home's testimonies.
  const { home } = await getActiveHomeContext()
  const initialPosts = await getChannelFeed("itestify", { homeId: home?.id ?? null })

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden">
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-hidden">
        <ITestify initialPosts={initialPosts} currentUser={currentUser} homeId={home?.id ?? null} />
      </main>
    </div>
  )
}
