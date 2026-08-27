"use client"

import { useState, useTransition } from "react"
import { CheckCircle2, Loader2 } from "lucide-react"
import { registerForEvent } from "@/app/actions/event-registration"
import { MAX_GUESTS, type EventQuestion } from "@/lib/events/questions"

type Props = {
  handle: string
  announcementId: number
  /** What Frequency already knows. Non-null values are NOT asked for again. */
  knownName: string | null
  knownEmail: string | null
  knownPhone: string | null
  isMember: boolean
  requiresPhone: boolean
  questions: EventQuestion[]
  onRegistered: () => void
}

/**
 * The registration form.
 *
 * ONE component serves the member and the stranger, differing only in which
 * fields it renders. That is the entire point of the feature: a member whose
 * name, email and mobile are already on file sees a single button, while a
 * first-time visitor sees the fields Frequency genuinely doesn't have. Two
 * separate forms would inevitably drift apart in validation and wording.
 */
export function RegistrationForm({
  handle,
  announcementId,
  knownName,
  knownEmail,
  knownPhone,
  isMember,
  requiresPhone,
  questions,
  onRegistered,
}: Props) {
  const [fullName, setFullName] = useState(knownName ?? "")
  const [email, setEmail] = useState(knownEmail ?? "")
  const [phone, setPhone] = useState(knownPhone ?? "")
  const [answers, setAnswers] = useState<Record<string, string | boolean>>({})
  const [marketingOptIn, setMarketingOptIn] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [pending, startTransition] = useTransition()

  // Only ask for what we don't hold. A member with a saved mobile is asked
  // nothing at all beyond the event's own questions.
  const needsName = !knownName
  const needsEmail = !knownEmail
  const needsPhone = requiresPhone && !knownPhone
  const isOneTap = !needsName && !needsEmail && !needsPhone && questions.length === 0

  function submit() {
    setError(null)
    setFieldErrors({})
    startTransition(async () => {
      const result = await registerForEvent({
        handle,
        announcementId,
        fullName,
        email,
        phone,
        answers,
        marketingOptIn,
      })
      if (result.ok) {
        onRegistered()
      } else {
        setError(result.error)
        if (result.fieldErrors) setFieldErrors(result.fieldErrors)
      }
    })
  }

  const inputClass =
    "w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      {isOneTap ? (
        <div className="flex items-start gap-3 rounded-xl bg-secondary px-4 py-3">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-secondary-foreground" aria-hidden="true" />
          <p className="text-sm leading-relaxed text-secondary-foreground text-pretty">
            We already have your details, {knownName?.split(" ")[0]}. Just confirm to register.
          </p>
        </div>
      ) : null}

      {needsName ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="reg-name" className="text-sm font-medium text-foreground">
            Full name
          </label>
          <input
            id="reg-name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            autoComplete="name"
            className={inputClass}
            placeholder="Jane Doe"
          />
        </div>
      ) : null}

      {needsEmail ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="reg-email" className="text-sm font-medium text-foreground">
            Email
          </label>
          <input
            id="reg-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className={inputClass}
            placeholder="jane@example.com"
          />
          <p className="text-xs text-muted-foreground">We&apos;ll send your confirmation here.</p>
        </div>
      ) : null}

      {needsPhone ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="reg-phone" className="text-sm font-medium text-foreground">
            Mobile number
          </label>
          <input
            id="reg-phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
            autoComplete="tel"
            className={inputClass}
            placeholder="07700 900000"
          />
          <p className="text-xs text-muted-foreground">
            {isMember
              ? "Saved to your account, so we won't ask again."
              : "So the hosts can reach you about this event."}
          </p>
        </div>
      ) : null}

      {questions.map((q) => {
        const err = fieldErrors[q.id]
        const id = `q-${q.id}`
        return (
          <div key={q.id} className="flex flex-col gap-1.5">
            {q.type === "boolean" ? (
              <label className="flex items-start gap-3 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={Boolean(answers[q.id])}
                  onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.checked }))}
                  className="mt-0.5 size-4 rounded border-input"
                />
                <span className="leading-relaxed">{q.label}</span>
              </label>
            ) : (
              <>
                <label htmlFor={id} className="text-sm font-medium text-foreground">
                  {q.label}
                  {q.required ? "" : <span className="ml-1 font-normal text-muted-foreground">(optional)</span>}
                </label>
                {q.type === "long" ? (
                  <textarea
                    id={id}
                    rows={3}
                    required={q.required}
                    value={String(answers[q.id] ?? "")}
                    onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                    className={inputClass}
                  />
                ) : q.type === "select" ? (
                  <select
                    id={id}
                    required={q.required}
                    value={String(answers[q.id] ?? "")}
                    onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                    className={inputClass}
                  >
                    <option value="">Choose…</option>
                    {(q.options ?? []).map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    id={id}
                    type={q.type === "number" || q.type === "guests" ? "number" : "text"}
                    // A party-size answer drives the event's capacity, so the
                    // field advertises the same bounds the server enforces
                    // rather than letting someone type 60 and be rejected only
                    // after submitting.
                    {...(q.type === "guests"
                      ? { min: 1, max: MAX_GUESTS, step: 1, inputMode: "numeric" as const }
                      : {})}
                    required={q.required}
                    value={String(answers[q.id] ?? "")}
                    onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                    className={inputClass}
                  />
                )}
              </>
            )}
            {err ? (
              <p role="alert" className="text-xs text-destructive">
                {err}
              </p>
            ) : null}
          </div>
        )
      })}

      {/* Consent is a separate, unticked choice. Registering for an event is
          never treated as permission to send marketing. */}
      <label className="flex items-start gap-3 text-sm text-muted-foreground">
        <input
          type="checkbox"
          checked={marketingOptIn}
          onChange={(e) => setMarketingOptIn(e.target.checked)}
          className="mt-0.5 size-4 rounded border-input"
        />
        <span className="leading-relaxed text-pretty">
          Keep me updated about future events and news. You&apos;ll get your registration confirmation either way.
        </span>
      </label>

      {error ? (
        <p role="alert" className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="flex items-center justify-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
        {pending ? "Registering…" : isOneTap ? "Confirm my place" : "Register"}
      </button>
    </form>
  )
}
