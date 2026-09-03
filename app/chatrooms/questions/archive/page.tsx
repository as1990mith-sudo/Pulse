import { redirect } from "next/navigation"
import { QotdArchive } from "@/components/qotd-archive"
import { getArchivedQuestions } from "@/lib/qotd"
import { getCurrentUser } from "@/lib/session"

export const metadata = {
  title: "Previous Questions — Frequency",
  description: "Browse past Questions of the Day and their community discussions.",
}

export default async function QotdArchivePage() {
  const currentUser = await getCurrentUser()
  if (!currentUser) redirect("/sign-in")

  const questions = await getArchivedQuestions()

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden">
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col overflow-hidden">
        <QotdArchive questions={questions} />
      </main>
    </div>
  )
}
