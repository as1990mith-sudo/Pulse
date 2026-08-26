"use client"

import { useState } from "react"
import { CheckCircle2, Lock } from "lucide-react"
import { RegistrationForm } from "@/components/events/registration-form"
import type { EventQuestion } from "@/lib/events/registration"

type Props = {
  handle: string
  announcementId: number
  eventTitle: string
  knownName: string | null
  knownEmail: string | null
  knownPhone: string | null
  isMember: boolean
  alreadyRegistered: boolean
  requiresPhone: boolean
  questions: EventQuestion[]
  open: boolean
  closedReason: string | null
  isFull: boolean
  /** False when the event takes members-only registrations. */
  canRegister: boolean
  signInHref: string
}

/**
 * Owns the registration surface's state: form → confirmed.
 *
 * The confirmed state is rendered client-side immediately on success rather than
 * waiting for a redirect, so the person gets instant, unambiguous feedback that
 * their place is secured — the moment that matters most in the whole flow.
 */
export function RegistrationPanel({
  handle,
  announcementId,
  eventTitle,
  knownName,
  knownEmail,
  knownPhone,
  isMember,
  alreadyRegistered,
  requiresPhone,
  questions,
  open,
  closedReason,
  isFull,
  canRegister,
  signInHref,
}: Props) {
  const [registered, setRegistered] = useState(alreadyRegistered)

  if (registered) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
          <div className="flex flex-col gap-2">
            <h2 className="font-display text-base font-semibold text-card-foreground">You&apos;re registered</h2>
            {/* The event name is given its own line rather than being inlined
                into the sentence: it echoes the title above, and interpolating
                it mid-paragraph also swallowed the leading space in JSX. */}
            <p className="font-display text-sm font-semibold text-card-foreground text-balance">{eventTitle}</p>
            <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
              Your place is confirmed. We&apos;ve sent the details to your email — keep an eye out for anything the hosts
              send closer to the day.
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (isFull) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6">
        <h2 className="font-display text-base font-semibold text-card-foreground">This event is full</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground text-pretty">
          Every place has been taken. Follow {""}
          <a href={`/org/${handle}`} className="underline underline-offset-2">
            the hosts
          </a>{" "}
          to hear about the next one.
        </p>
      </div>
    )
  }

  if (!open) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6">
        <h2 className="font-display text-base font-semibold text-card-foreground">Registration closed</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground text-pretty">
          {closedReason ?? "Registration isn't open for this event."}
        </p>
      </div>
    )
  }

  // A members-only event still shows publicly (the admin chose to publish the
  // page) but explains plainly why the visitor can't take a place, instead of
  // silently hiding the form.
  if (!canRegister) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-start gap-3">
          <Lock className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div>
            <h2 className="font-display text-base font-semibold text-card-foreground">Members only</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground text-pretty">
              This event is open to members of this Home.{" "}
              <a href={signInHref} className="underline underline-offset-2">
                Sign in
              </a>{" "}
              if you&apos;re already a member.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <h2 className="font-display text-base font-semibold text-card-foreground">Register</h2>
      <p className="mt-1 mb-4 text-sm leading-relaxed text-muted-foreground text-pretty">
        {knownEmail
          ? "Confirm your place below."
          : "No account needed — just your details and you're in."}
      </p>
      <RegistrationForm
        handle={handle}
        announcementId={announcementId}
        knownName={knownName}
        knownEmail={knownEmail}
        knownPhone={knownPhone}
        isMember={isMember}
        requiresPhone={requiresPhone}
        questions={questions}
        onRegistered={() => setRegistered(true)}
      />
    </div>
  )
}
