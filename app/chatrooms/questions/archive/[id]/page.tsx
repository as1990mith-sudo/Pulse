import { notFound, redirect } from "next/navigation"
import { QotdArchiveDetail } from "@/components/qotd-archive-detail"
import { getChannelFeed } from "@/app/actions/feed"
import { getQuestionById } from "@/lib/qotd"
import { qotdChannel } from "@/lib/qotd-types"
import { getCurrentUser } from "@/lib/session"

export const metadata = {
  title: "Previous Question — Frequency",
}

export default async function QotdArchiveDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const currentUser = await getCurrentUser()
  if (!currentUser) redirect("/sign-in")

  const { id } = await params
  const questionId = Number(id)
  if (!Number.isFinite(questionId)) notFound()

  const question = await getQuestionById(questionId)
  if (!question) notFound()

  const responses = await getChannelFeed(qotdChannel(question.id))

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden">
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col overflow-hidden">
        <QotdArchiveDetail question={question} responses={responses} currentUser={currentUser} />
      </main>
    </div>
  )
}
