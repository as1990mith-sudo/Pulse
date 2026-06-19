import { notFound, redirect } from "next/navigation"
import { SiteHeader } from "@/components/site-header"
import { ChatroomView } from "@/components/chatroom-view"
import { getChatroomDetail } from "@/app/actions/chatroom"
import { getCurrentUser } from "@/lib/session"

export default async function ChatroomDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const chatroomId = Number(id)
  if (!Number.isFinite(chatroomId)) notFound()

  const currentUser = await getCurrentUser()
  if (!currentUser) redirect("/sign-in")

  let detail
  try {
    detail = await getChatroomDetail(chatroomId)
  } catch {
    // Not a member, or the room doesn't exist.
    notFound()
  }

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-6 sm:px-6">
        <ChatroomView detail={detail} />
      </main>
    </div>
  )
}
