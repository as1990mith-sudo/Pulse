import { notFound, redirect } from "next/navigation"
import { BroadcastThreadView } from "@/components/broadcast-thread-view"
import { getBroadcastThread, markBroadcastThreadOpened } from "@/app/actions/home-broadcast"
import { getCurrentUser } from "@/lib/session"

export default async function BroadcastThreadPage({ params }: { params: Promise<{ homeId: string }> }) {
  const { homeId } = await params

  const currentUser = await getCurrentUser()
  if (!currentUser) redirect("/sign-in")

  const thread = await getBroadcastThread(homeId)
  if (!thread) notFound()

  // Opening the thread clears the unread/priority state for this member.
  await markBroadcastThreadOpened(homeId)

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden">
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col overflow-hidden">
        <BroadcastThreadView thread={thread} />
      </main>
    </div>
  )
}
