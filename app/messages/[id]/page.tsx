import { notFound, redirect } from "next/navigation"
import { DmView } from "@/components/dm-view"
import { getConversationDetail } from "@/app/actions/dm"
import { getCurrentUser } from "@/lib/session"

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const conversationId = Number(id)
  if (!Number.isFinite(conversationId)) notFound()

  const currentUser = await getCurrentUser()
  if (!currentUser) redirect("/sign-in")

  let detail
  try {
    detail = await getConversationDetail(conversationId)
  } catch {
    notFound()
  }

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden">
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col overflow-hidden">
        <DmView detail={detail} />
      </main>
    </div>
  )
}
