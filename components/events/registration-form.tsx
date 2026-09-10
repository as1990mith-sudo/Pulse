"use client"

import { useState, useTransition } from "react"
import { Loader2 } from "lucide-react"
import { registerForEvent } from "@/app/actions/event-registration"
import { EVENT_GENDERS, EVENT_GENDER_LABEL, MAX_GUESTS, type EventGender, type EventQuestion } from "@/lib/events/questions"

type Props = {
  handle: string
  announcementId: number
  /** What Frequency already knows. Non-null values are NOT asked for again. */
  knownName: string | null
  knownEmail: string | null
  knownPhone: string | null
  /** A member's profile gender, prefilled but always editable. */
  knownGender: EventGender | null
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
  knownGender,
  requiresPhone,
  questions,
  onRegistered,
}: Props) {
  const [fullName, setFullName] = useState(knownName ?? "")
  const [email, setEmail] = useState(knownEmail ?? "")
  const [phone, setPhone] = useState(knownPhone ?? "")
  const [gender, setGender] = useState<EventGender | "">(knownGender ?? "")
  const [answers, setAnswers] = useState<Record<string, string | boolean>>({})
  const [marketingOptIn, setMarketingOptIn] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [pending, startTransition] = useTransition()

  // Everyone completes the same form. A member's account values prefill the
  // fields for convenience, but they stay fully editable and whatever is
  // submitted is what's stored — membership never bypasses the form, because a
  // profile's name or email may be wrong for this particular event.
  const showPhone = requiresPhone

  function submit() {
    setError(null)
    setFieldErrors({})
    // Gender is required. Caught here for an instant, inline message rather than
    // a server round trip; the server enforces the same rule regardless.
    if (!gender) {
      setFieldErrors({ gender: "Select your gender to continue." })
      return
    }
    startTransition(async () => {
      const result = await registerForEvent({
        handle,
        announcementId,
        fullName,
        email,
        phone,
        gender,
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
        <p className="text-xs text-muted-foreground">We&apos;ll send your confirmation and event updates here.</p>
      </div>

      {showPhone ? (
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
          <p className="text-xs text-muted-foreground">So the hosts can reach you about this event.</p>
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="reg-gender" className="text-sm font-medium text-foreground">
          Gender
        </label>
        <select
          id="reg-gender"
          value={gender}
          onChange={(e) => {
            setGender(e.target.value as EventGender | "")
            setFieldErrors(({ gender: _drop, ...rest }) => rest)
          }}
          aria-required="true"
          aria-invalid={fieldErrors.gender ? true : undefined}
          className={inputClass}
        >
          <option value="">Select…</option>
          {EVENT_GENDERS.map((g) => (
            <option key={g} value={g}>
              {EVENT_GENDER_LABEL[g]}
            </option>
          ))}
        </select>
        {fieldErrors.gender ? (
          <p role="alert" className="text-xs text-destructive">
            {fieldErrors.gender}
          </p>
        ) : null}
      </div>

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
        {pending ? "Registering…" : "Register"}
      </button>
    </form>
  )
}
