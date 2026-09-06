import { Resend } from "resend"

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

// Verified sender. Falls back to Resend's shared testing address so the flow
// still works before a custom domain is verified.
const FROM = process.env.EMAIL_FROM || "Frequency <onboarding@resend.dev>"

/**
 * Sends the password-reset email. Throws if Resend isn't configured so the
 * caller (Better Auth) surfaces a clear error instead of silently no-oping.
 */
export async function sendPasswordResetEmail({
  to,
  name,
  url,
}: {
  to: string
  name?: string | null
  url: string
}): Promise<void> {
  if (!resend) {
    throw new Error("RESEND_API_KEY is not set — cannot send password reset email.")
  }

  const greeting = name ? `Hi ${name},` : "Hi,"

  // Resend's SDK does NOT throw on API errors — it returns `{ data, error }`.
  // We must inspect `error` and throw, otherwise a rejected send (e.g. an
  // unverified sender domain, or test-mode recipient restrictions) fails
  // silently and Better Auth reports success even though nothing was delivered.
  const { data, error } = await resend.emails.send({
    from: FROM,
    to,
    subject: "Reset your Frequency password",
    text: [
      greeting,
      "",
      "We received a request to reset your Frequency password.",
      "Open the link below to choose a new one. This link expires in 1 hour.",
      "",
      url,
      "",
      "If you didn't request this, you can safely ignore this email — your password won't change.",
    ].join("\n"),
    html: `
      <div style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#111827">
        <h1 style="font-size:20px;font-weight:600;margin:0 0 16px">Reset your password</h1>
        <p style="font-size:14px;line-height:1.6;margin:0 0 12px">${greeting}</p>
        <p style="font-size:14px;line-height:1.6;margin:0 0 20px">
          We received a request to reset your Frequency password. Tap the button
          below to choose a new one. This link expires in 1 hour.
        </p>
        <a href="${url}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 20px;border-radius:9999px">
          Reset password
        </a>
        <p style="font-size:12px;line-height:1.6;color:#6b7280;margin:24px 0 0">
          If you didn't request this, you can safely ignore this email — your
          password won't change.
        </p>
        <p style="font-size:12px;line-height:1.6;color:#6b7280;margin:12px 0 0;word-break:break-all">
          Or paste this link into your browser:<br />${url}
        </p>
      </div>
    `,
  })

  if (error) {
    console.log("[v0] Resend failed to send password reset email:", error)
    // Common cause: the EMAIL_FROM domain isn't verified in Resend, or (when
    // using onboarding@resend.dev) Resend test mode only allows sending to your
    // own account email. Verify a domain at resend.com/domains and set EMAIL_FROM.
    throw new Error(
      typeof error === "object" && error && "message" in error
        ? String((error as { message: unknown }).message)
        : "Failed to send password reset email.",
    )
  }

  console.log("[v0] Password reset email sent:", data?.id)
}

/**
 * Sends a single call-to-action email (heading, one paragraph, a button, and a
 * plain-text fallback link) in the same visual style as the reset email. Shared
 * by the email-verification and change-email flows so we keep one template.
 */
async function sendActionEmail({
  to,
  subject,
  heading,
  greeting,
  intro,
  buttonLabel,
  url,
  footer,
}: {
  to: string
  subject: string
  heading: string
  greeting: string
  intro: string
  buttonLabel: string
  url: string
  footer: string
}): Promise<void> {
  if (!resend) {
    throw new Error("RESEND_API_KEY is not set — cannot send email.")
  }

  const { data, error } = await resend.emails.send({
    from: FROM,
    to,
    subject,
    text: [greeting, "", intro, "", url, "", footer].join("\n"),
    html: `
      <div style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#111827">
        <h1 style="font-size:20px;font-weight:600;margin:0 0 16px">${heading}</h1>
        <p style="font-size:14px;line-height:1.6;margin:0 0 12px">${greeting}</p>
        <p style="font-size:14px;line-height:1.6;margin:0 0 20px">${intro}</p>
        <a href="${url}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 20px;border-radius:9999px">
          ${buttonLabel}
        </a>
        <p style="font-size:12px;line-height:1.6;color:#6b7280;margin:24px 0 0">${footer}</p>
        <p style="font-size:12px;line-height:1.6;color:#6b7280;margin:12px 0 0;word-break:break-all">
          Or paste this link into your browser:<br />${url}
        </p>
      </div>
    `,
  })

  if (error) {
    console.log("[v0] Resend failed to send action email:", error)
    throw new Error(
      typeof error === "object" && error && "message" in error
        ? String((error as { message: unknown }).message)
        : "Failed to send email.",
    )
  }

  console.log("[v0] Action email sent:", subject, data?.id)
}

/** Confirms a member's email address (Account → Security → verify email). */
export async function sendVerificationEmail({
  to,
  name,
  url,
}: {
  to: string
  name?: string | null
  url: string
}): Promise<void> {
  await sendActionEmail({
    to,
    subject: "Verify your Frequency email",
    heading: "Verify your email",
    greeting: name ? `Hi ${name},` : "Hi,",
    intro: "Confirm this is your email address so we can keep your Frequency account secure.",
    buttonLabel: "Verify email",
    url,
    footer: "If you didn't request this, you can safely ignore this email.",
  })
}

/**
 * Sent to a member's CURRENT address to approve changing it to a new one. Better
 * Auth only calls this when the current email is already verified; the link
 * confirms the change before it takes effect.
 */
export async function sendChangeEmailVerification({
  to,
  name,
  newEmail,
  url,
}: {
  to: string
  name?: string | null
  newEmail: string
  url: string
}): Promise<void> {
  await sendActionEmail({
    to,
    subject: "Confirm your new Frequency email",
    heading: "Approve your email change",
    greeting: name ? `Hi ${name},` : "Hi,",
    intro: `We received a request to change your Frequency email to ${newEmail}. Approve it below to make the change.`,
    buttonLabel: "Approve change",
    url,
    footer: "If you didn't request this, ignore this email and your address won't change.",
  })
}

/* -------------------------------------------------------------------------- */
/* Appointment emails (confirmation / reschedule / cancellation)              */
/* -------------------------------------------------------------------------- */

export type AppointmentEmailKind = "confirmed" | "rescheduled" | "cancelled"

export type AppointmentEmailDetails = {
  to: string
  name?: string | null
  title: string
  homeName: string
  hostName?: string | null
  whenISO: string
  durationMinutes: number
  useFrequencyLive: boolean
  location?: string | null
  /** Tokenised manage-page URL — join / reschedule / cancel, no account needed. */
  manageUrl: string
}

function formatWhen(whenISO: string): { date: string; time: string } {
  const d = new Date(whenISO)
  return {
    date: d.toLocaleDateString("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }),
    time: `${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })} UTC`,
  }
}

const APPOINTMENT_COPY: Record<
  AppointmentEmailKind,
  { subject: (t: string) => string; heading: string; intro: (h: string) => string; button: string; showButton: boolean }
> = {
  confirmed: {
    subject: (t) => `Appointment confirmed: ${t}`,
    heading: "Your appointment is confirmed",
    intro: (h) => `Your appointment with ${h} is booked. Here are the details.`,
    button: "View appointment",
    showButton: true,
  },
  rescheduled: {
    subject: (t) => `Appointment rescheduled: ${t}`,
    heading: "Your appointment was rescheduled",
    intro: (h) => `Your appointment with ${h} has a new time. Here are the updated details.`,
    button: "View appointment",
    showButton: true,
  },
  cancelled: {
    subject: (t) => `Appointment cancelled: ${t}`,
    heading: "Your appointment was cancelled",
    intro: (h) => `Your appointment with ${h} has been cancelled. You can book again any time.`,
    button: "Book again",
    showButton: false,
  },
}

/**
 * Sends an appointment confirmation / reschedule / cancellation email. Called
 * ONLY after the booking change has been committed, so the recipient never gets
 * an email for a change that didn't actually happen. No-ops (throws) if Resend
 * isn't configured; callers wrap the send so a mail failure can't roll back a
 * committed booking.
 */
export async function sendAppointmentEmail(
  kind: AppointmentEmailKind,
  details: AppointmentEmailDetails,
): Promise<void> {
  if (!resend) {
    throw new Error("RESEND_API_KEY is not set — cannot send appointment email.")
  }

  const copy = APPOINTMENT_COPY[kind]
  const { date, time } = formatWhen(details.whenISO)
  const greeting = details.name ? `Hi ${details.name},` : "Hi,"
  const meetingLine = details.useFrequencyLive
    ? "Video call — join from your appointment page when it opens (10 minutes before the start)."
    : details.location
      ? `Location: ${details.location}`
      : "In person."

  const rows: [string, string][] = [
    ["Type", details.title],
    ["Date", date],
    ["Time", time],
    ["Duration", `${details.durationMinutes} min`],
    ...(details.hostName ? ([["With", details.hostName]] as [string, string][]) : []),
    ["Meeting", meetingLine],
  ]

  const rowsHtml = rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 0;font-size:13px;color:#6b7280;width:110px;vertical-align:top">${k}</td><td style="padding:6px 0;font-size:14px;color:#111827;font-weight:500">${v}</td></tr>`,
    )
    .join("")

  const buttonHtml = copy.showButton
    ? `<a href="${details.manageUrl}" style="display:inline-block;margin-top:8px;background:#111827;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 20px;border-radius:9999px">${copy.button}</a>`
    : ""

  const { data, error } = await resend.emails.send({
    from: FROM,
    to: details.to,
    subject: copy.subject(details.title),
    text: [
      greeting,
      "",
      copy.intro(details.homeName),
      "",
      ...rows.map(([k, v]) => `${k}: ${v}`),
      "",
      `Manage your appointment: ${details.manageUrl}`,
    ].join("\n"),
    html: `
      <div style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#111827">
        <h1 style="font-size:20px;font-weight:600;margin:0 0 16px">${copy.heading}</h1>
        <p style="font-size:14px;line-height:1.6;margin:0 0 20px">${greeting}</p>
        <p style="font-size:14px;line-height:1.6;margin:0 0 20px">${copy.intro(details.homeName)}</p>
        <table style="width:100%;border-collapse:collapse;margin:0 0 24px">${rowsHtml}</table>
        ${buttonHtml}
        <p style="font-size:12px;line-height:1.6;color:#6b7280;margin:24px 0 0">
          Manage or change this appointment any time:<br /><span style="word-break:break-all">${details.manageUrl}</span>
        </p>
      </div>
    `,
  })

  if (error) {
    console.log("[v0] Resend failed to send appointment email:", error)
    throw new Error(
      typeof error === "object" && error && "message" in error
        ? String((error as { message: unknown }).message)
        : "Failed to send appointment email.",
    )
  }

  console.log("[v0] Appointment email sent:", kind, data?.id)
}
