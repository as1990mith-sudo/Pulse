import Link from "next/link"
import Image from "next/image"
import { Radio, Users2, type LucideIcon } from "lucide-react"
import type { HomeLiveView } from "@/app/actions/home-surfaces"

/**
 * Shared surface for the Home Rooms and Live pages. Both are entry points into
 * the EXISTING global room/live experience — we surface the sessions that
 * belong to this Home's members and link into the real room. No duplicate
 * room/live system is created here.
 */
export function HomeLiveSurface({
  title,
  subtitle,
  sessions,
  emptyTitle,
  emptyBody,
  icon: Icon,
}: {
  title: string
  subtitle: string
  sessions: HomeLiveView[]
  emptyTitle: string
  emptyBody: string
  icon: LucideIcon
}) {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 pt-5">
      <header className="mb-4">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>
      </header>

      {sessions.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-card/40 px-6 py-14 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Icon className="size-6" />
          </span>
          <p className="mt-3 text-sm font-medium text-foreground">{emptyTitle}</p>
          <p className="mt-1 max-w-xs text-pretty text-sm text-muted-foreground">{emptyBody}</p>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {sessions.map((s) => (
            <li key={s.id}>
              <SessionCard session={s} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function SessionCard({ session }: { session: HomeLiveView }) {
  return (
    <Link
      href={`/live/${session.roomName}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-border/60 bg-card transition-colors hover:border-[var(--home-accent)]/50"
    >
      <div className="relative aspect-video w-full overflow-hidden bg-muted">
        {session.cover ? (
          <Image
            src={session.cover || "/placeholder.svg"}
            alt=""
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
            sizes="(max-width: 640px) 100vw, 320px"
          />
        ) : (
          <div className="flex size-full items-center justify-center">
            {session.mode === "video" ? (
              <Radio className="size-8 text-muted-foreground/50" />
            ) : (
              <Users2 className="size-8 text-muted-foreground/50" />
            )}
          </div>
        )}
        <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-[var(--home-accent)] px-2.5 py-1 text-xs font-semibold text-white">
          <span className="size-1.5 animate-pulse rounded-full bg-white" />
          LIVE
        </span>
      </div>
      <div className="p-3.5">
        <p className="line-clamp-1 text-sm font-semibold text-foreground">{session.title}</p>
        <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
          {session.hostName}
          {session.topic ? ` · ${session.topic}` : ""}
        </p>
      </div>
    </Link>
  )
}
