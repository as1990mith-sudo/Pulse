"use client"

import Link from "next/link"
import { ArrowLeft, Radio } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import type { BroadcastThread } from "@/app/actions/home-broadcast"

function formatWhen(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function BroadcastThreadView({ thread }: { thread: BroadcastThread }) {
  return (
    <div className="flex h-full flex-col">
      {/* Header — the Home is the identity of the conversation, never the admin. */}
      <header className="flex items-center gap-3 border-b border-border/60 px-3 py-2.5">
        <Link
          href="/messages"
          aria-label="Back to inbox"
          className="flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <span className="relative shrink-0">
          <Avatar className="size-9 ring-2 ring-border/60">
            {thread.image && <AvatarImage src={thread.image || "/placeholder.svg"} alt={thread.homeName} />}
            <AvatarFallback className={cn("text-xs", thread.color)}>{thread.initials}</AvatarFallback>
          </Avatar>
          <span className="absolute -bottom-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground ring-2 ring-card">
            <Radio className="size-2.5" />
          </span>
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold leading-tight tracking-tight">Home Broadcast</p>
          <p className="truncate text-xs text-muted-foreground">{thread.homeName}</p>
        </div>
      </header>

      {/* Messages — read-only. Newest at the bottom, like a normal thread. */}
      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5">
        {thread.messages.map((m) => (
          <div key={m.id} className="flex flex-col items-start gap-1">
            <div className="max-w-[85%] rounded-2xl rounded-tl-md bg-secondary/60 px-3.5 py-2.5">
              <p className="whitespace-pre-wrap text-pretty text-sm leading-relaxed text-foreground">{m.message}</p>
              {m.attachmentUrl && m.attachmentType === "image" && (
                <img
                  src={m.attachmentUrl || "/placeholder.svg"}
                  alt={m.attachmentName ?? "Broadcast attachment"}
                  className="mt-2 max-h-72 w-full rounded-xl object-cover"
                />
              )}
              {m.attachmentUrl && m.attachmentType !== "image" && (
                <a
                  href={m.attachmentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-block text-sm font-medium text-primary underline underline-offset-2"
                >
                  {m.attachmentName ?? "View attachment"}
                </a>
              )}
            </div>
            <time className="px-1 text-[11px] text-muted-foreground">{formatWhen(m.sentAt)}</time>
          </div>
        ))}
      </div>

      <footer className="border-t border-border/60 px-4 py-3">
        <p className="text-center text-xs text-muted-foreground">
          Official broadcasts from {thread.homeName}. You can&apos;t reply here.
        </p>
      </footer>
    </div>
  )
}
