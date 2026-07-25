import { redirect } from "next/navigation"
import { QuestionOfTheDay } from "@/components/question-of-the-day"
import { getChannelFeed } from "@/app/actions/feed"
import { getActiveQuestion, getArchivedQuestions } from "@/lib/qotd"
import { qotdChannel } from "@/lib/qotd-types"
import { getCurrentUser } from "@/lib/session"

export const metadata = {
  title: "Question of the Day — Frequency",
  description: "One question, many perspectives. Join today's community discussion on Frequency.",
}

export default async function QuestionOfTheDayPage() {
  const currentUser = await getCurrentUser()
  if (!currentUser) redirect("/sign-in")

  const question = await getActiveQuestion()
  const [initialResponses, archived] = await Promise.all([
    question ? getChannelFeed(qotdChannel(question.id)) : Promise.resolve([]),
    getArchivedQuestions(),
  ])

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden">
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-hidden">
        <QuestionOfTheDay
          question={question}
          initialResponses={initialResponses}
          currentUser={currentUser}
          archiveCount={archived.length}
        />
      </main>
    </div>
  )
}
