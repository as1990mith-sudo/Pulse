"use client"

import { useState } from "react"
import Link from "next/link"
import { Mic, PhoneCall, X } from "lucide-react"
import type { CurrentUser } from "@/lib/session"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

type State = "idle" | "form" | "queued"

export function CallInPanel({ currentUser = null }: { currentUser?: CurrentUser | null }) {
  const [state, setState] = useState<State>("idle")
  const [topic, setTopic] = useState("")

  if (!currentUser) {
    return (
      <div className="flex items-center justify-between gap-4 rounded-xl border border-border/60 bg-card p-4">
        <div>
          <p className="font-semibold">Want to join on air?</p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Sign in so the host knows who&apos;s calling in.
          </p>
        </div>
        <Button render={<Link href="/sign-in" />} nativeButton={false} className="shrink-0 gap-1.5">
          <PhoneCall className="size-4" /> Sign in to call in
        </Button>
      </div>
    )
  }

  if (state === "queued") {
    return (
      <div className="rounded-xl border border-primary/40 bg-primary/5 p-4">
        <div className="flex items-center gap-2 text-primary">
          <span className="flex size-8 items-center justify-center rounded-full bg-primary/15">
            <Mic className="size-4" />
          </span>
          <p className="font-semibold">You&apos;re in the call-in queue</p>
        </div>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
          You&apos;re #3 in line as <span className="font-medium text-foreground">{currentUser.name}</span>. Keep your
          mic ready — the host will bring you on air when it&apos;s your turn.
        </p>
        {topic && (
          <p className="mt-2 rounded-lg bg-card px-3 py-2 text-sm text-foreground">
            <span className="text-muted-foreground">Your note: </span>
            {topic}
          </p>
        )}
        <Button variant="ghost" size="sm" className="mt-3 gap-1.5 text-muted-foreground" onClick={() => setState("idle")}>
          <X className="size-4" /> Leave the queue
        </Button>
      </div>
    )
  }

  if (state === "form") {
    return (
      <div className="rounded-xl border border-border/60 bg-card p-4">
        <p className="font-semibold">Request to call in</p>
        <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
          Tell the host what you&apos;d like to talk about. They&apos;ll see your request in their queue.
        </p>
        <Textarea
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="e.g. I have a question about the new release…"
          className="mt-3 min-h-20 resize-none"
        />
        <div className="mt-3 flex items-center gap-2">
          <Button className="gap-1.5" onClick={() => setState("queued")}>
            <PhoneCall className="size-4" /> Join the queue
          </Button>
          <Button variant="ghost" onClick={() => setState("idle")}>
            Cancel
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-border/60 bg-card p-4">
      <div>
        <p className="font-semibold">Want to join on air?</p>
        <p className="text-sm text-muted-foreground leading-relaxed">Request to call in and talk live with the host.</p>
      </div>
      <Button className="shrink-0 gap-1.5" onClick={() => setState("form")}>
        <PhoneCall className="size-4" /> Call in
      </Button>
    </div>
  )
}
