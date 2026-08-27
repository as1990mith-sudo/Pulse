"use client"

import { useEffect, useState, useTransition } from "react"
import { AlertCircle, Check, Loader2, Megaphone, Send, Users, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { getEventAudiences, sendEventBroadcast } from "@/app/actions/event-admin"

type AudienceSize = {
  kind: string
  label: string
  count: number
  eventScoped: boolean
}

type EventOption = { id: number; title: string }

type Purpose = "event" | "marketing"

export function EventAudienceComposer({
  handle,
  events,
}: {
  handle: string
  events: EventOption[]
}) {
  const [open, setOpen] = useState(false)
  const [purpose, setPurpose] = useState<Purpose>("event")
  const [eventId, setEventId] = useState<number | null>(events[0]?.id ?? null)
  const [audiences, setAudiences] = useState<AudienceSize[] | null>(null)
  const [kind, setKind] = useState<string | null>(null)
  const [subject, setSubject] = useState("")
  const [body, setBody] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ sent: number; failed: number } | null>(null)
  const [loadingSizes, startLoadSizes] = useTransition()
  const [sending, startSend] = useTransition()

  // Counts depend on both the event and the purpose (a marketing send excludes
  // anyone without an opt-in), so they are re-resolved whenever either changes
  // rather than cached from the first open.
  useEffect(() => {
    if (!open) return
    startLoadSizes(async () => {
      try {
        const sizes = await getEventAudiences({ handle, announcementId: eventId, purpose })
        setAudiences(sizes)
      } catch {
        setError("Could not load audience sizes.")
      }
    })
  }, [open, handle, eventId, purpose])

  const selected = audiences?.find((a) => a.kind === kind) ?? null

  function reset() {
    setSubject("")
    setBody("")
    setKind(null)
    setError(null)
    setResult(null)
  }

  function onSend() {
    if (!kind) return
    setError(null)
    startSend(async () => {
      const res = await sendEventBroadcast({
        handle,
        kind,
        announcementId: eventId,
        purpose,
        subject,
        body,
      })
      if (res.ok) {
        setResult({ sent: res.sent, failed: res.failed })
        setSubject("")
        setBody("")
      } else {
        setError(res.error)
      }
    })
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-xl border border-border px-3.5 py-2 text-sm font-semibold hover:bg-muted/60"
      >
        <Megaphone className="size-4" aria-hidden="true" />
        Email an audience
      </button>
    )
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <h3 className="flex items-center gap-2 font-display text-sm font-semibold">
          <Megaphone className="size-4" aria-hidden="true" />
          Email an audience
        </h3>
        <button
          type="button"
          onClick={() => {
            setOpen(false)
            reset()
          }}
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted/60"
          aria-label="Close composer"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </header>

      <div className="flex flex-col gap-5 px-4 py-4">
        {/* Purpose first: it changes who is reachable, so choosing it after
            writing the message would silently invalidate the recipient count. */}
        <fieldset>
          <legend className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Type of message
          </legend>
          <div className="flex flex-wrap gap-2">
            {(
              [
                { value: "event", label: "About the event" },
                { value: "marketing", label: "Promotional" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  setPurpose(opt.value)
                  setKind(null)
                  setResult(null)
                }}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                  purpose === opt.value
                    ? "bg-primary text-primary-foreground"
                    : "border border-border text-muted-foreground hover:bg-muted/60",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-pretty text-xs leading-relaxed text-muted-foreground">
            {purpose === "event"
              ? "Sent to people who registered for the event. Anyone who unsubscribed is skipped."
              : "Only sent to contacts who explicitly opted in to updates."}
          </p>
        </fieldset>

        {events.length > 0 && (
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Event
            </span>
            <select
              value={eventId ?? ""}
              onChange={(e) => {
                setEventId(e.target.value ? Number(e.target.value) : null)
                setKind(null)
                setResult(null)
              }}
              className="rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.title}
                </option>
              ))}
            </select>
          </label>
        )}

        <fieldset>
          <legend className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Audience
          </legend>
          {loadingSizes && !audiences ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Working out who&apos;s reachable…
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {(audiences ?? []).map((a) => {
                const disabled = a.count === 0
                return (
                  <li key={a.kind}>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => {
                        setKind(a.kind)
                        setResult(null)
                      }}
                      className={cn(
                        "flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left text-sm transition-colors",
                        kind === a.kind
                          ? "border-primary bg-primary/10"
                          : "border-border hover:bg-muted/60",
                        disabled && "cursor-not-allowed opacity-45 hover:bg-transparent",
                      )}
                      aria-pressed={kind === a.kind}
                    >
                      <span className="font-medium">{a.label}</span>
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Users className="size-3.5" aria-hidden="true" />
                        {a.count}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </fieldset>

        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Subject
          </span>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={200}
            placeholder="A quick update about Sunday"
            className="rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Message
          </span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={6}
            placeholder={"Write your message here.\n\nLeave a blank line to start a new paragraph."}
            className="resize-y rounded-xl border border-border bg-background px-3 py-2 text-sm leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <span className="text-xs text-muted-foreground">
            Each person is emailed individually, so no one sees anyone else&apos;s address.
          </span>
        </label>

        {error && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {error}
          </p>
        )}

        {result && (
          <p
            role="status"
            className="flex items-start gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400"
          >
            <Check className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {result.failed === 0
              ? `Sent to ${result.sent} ${result.sent === 1 ? "person" : "people"}.`
              : `Sent to ${result.sent}. ${result.failed} could not be delivered.`}
          </p>
        )}

        <button
          type="button"
          onClick={onSend}
          disabled={sending || !kind || !subject.trim() || !body.trim()}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity disabled:opacity-50"
        >
          {sending ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Sending…
            </>
          ) : (
            <>
              <Send className="size-4" aria-hidden="true" />
              {selected ? `Send to ${selected.count}` : "Choose an audience"}
            </>
          )}
        </button>
      </div>
    </section>
  )
}
