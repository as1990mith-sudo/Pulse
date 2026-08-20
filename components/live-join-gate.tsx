"use client"

import { useState } from "react"
import { Loader2, Radio } from "lucide-react"
import { joinLiveAsGuest, type LiveStreamView } from "@/app/actions/live"

/**
 * Display-name gate for PUBLIC live sessions.
 *
 * When a visitor opens a public Live link without an account, the room's join
 * attempt comes back `needsIdentity` and this overlay is shown. The guest enters
 * only a display name — no account, no membership, no download, no joining the
 * organisation — then taps "Join Meeting". We create a lightweight signed guest
 * session (via `joinLiveAsGuest`) and call `onJoined`, which re-runs the room's
 * join so it connects as that guest.
 *
 * This grants access to the Live ONLY. The guest never gains the Home community,
 * notice board, member directory, appointments, or anything beyond this session.
 */
export function LiveJoinGate({
  stream,
  onJoined,
}: {
  stream: LiveStreamView
  onJoined: () => void
}) {
  const [name, setName] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    const trimmed = name.trim()
    if (!trimmed) {
      setError("Please enter a display name.")
      return
    }
    setSubmitting(true)
    setError(null)
    const res = await joinLiveAsGuest({ name: trimmed })
    if (!res.ok) {
      setSubmitting(false)
      setError(res.error ?? "Could not join. Please try again.")
      return
    }
    // Keep the spinner up while the room reconnects as the guest.
    onJoined()
  }

  return (
    <div className="fixed inset-0 z-[65] flex items-center justify-center bg-black/95 px-6 backdrop-blur-sm">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <Radio className="size-7" strokeWidth={2.5} />
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-white text-balance">Join Live</h1>
          <p className="mt-2 text-sm leading-relaxed text-white/60 text-pretty">
            {stream.title ? `“${stream.title}”` : "This live session"}
            {stream.hostName ? ` with ${stream.hostName}` : ""}. Enter a display name to join.
          </p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (!submitting) void submit()
          }}
          className="flex flex-col gap-3"
        >
          <label htmlFor="live-guest-name" className="sr-only">
            Display name
          </label>
          <input
            id="live-guest-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Display name"
            maxLength={40}
            autoFocus
            autoComplete="name"
            className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3.5 text-base text-white placeholder:text-white/40 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3.5 text-base font-bold text-primary-foreground shadow-lg shadow-primary/30 transition-all hover:opacity-95 active:scale-[0.99] disabled:opacity-60"
          >
            {submitting ? <Loader2 className="size-5 animate-spin" /> : null}
            {submitting ? "Joining…" : "Join Meeting"}
          </button>
        </form>
      </div>
    </div>
  )
}
