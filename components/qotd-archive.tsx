import Link from "next/link"
import { ArrowLeft, ChevronRight, Lightbulb, MessageSquare } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import type { QotdQuestionRow } from "@/lib/qotd-types"

export function QotdArchive({ questions }: { questions: QotdQuestionRow[] }) {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex items-center gap-3 border-b border-border/60 bg-background/95 px-4 py-3 backdrop-blur sm:px-6">
        <Link
          href="/chatrooms/questions"
          className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          aria-label="Back to Question of the Day"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-bold tracking-tight">Previous questions</h1>
          <p className="truncate text-sm text-muted-foreground">Past Questions of the Day and their discussions</p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto overscroll-contain">
        {questions.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-24 text-center">
            <Avatar className="size-16 ring-2 ring-amber-500/30">
              <AvatarFallback className="bg-amber-600 text-white">
                <Lightbulb className="size-7" />
              </AvatarFallback>
            </Avatar>
            <p className="text-lg font-semibold">No previous questions yet</p>
            <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
              Once a new Question of the Day is published, past ones will be preserved here with their discussions.
            </p>
          </div>
        ) : (
          <ul className="mx-auto max-w-2xl divide-y divide-border/60">
            {questions.map((q) => (
              <li key={q.id}>
                <Link
                  href={`/chatrooms/questions/archive/${q.id}`}
                  className="flex items-center gap-4 px-4 py-4 transition-colors hover:bg-secondary/30 sm:px-6"
                >
                  {q.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={q.image || "/placeholder.svg"} alt="" className="size-14 shrink-0 rounded-xl object-cover" />
                  ) : (
                    <span className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-amber-500/12 text-amber-600 dark:text-amber-400">
                      <Lightbulb className="size-6" />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-muted-foreground">{q.activeDate}</p>
                    <p className="mt-0.5 line-clamp-2 font-semibold text-pretty">{q.questionText}</p>
                    <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                      <MessageSquare className="size-3.5" /> {q.responseCount}{" "}
                      {q.responseCount === 1 ? "response" : "responses"}
                    </p>
                  </div>
                  <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
