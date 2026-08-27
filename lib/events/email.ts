import "server-only"

import { Resend } from "resend"

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null
const FROM = process.env.EMAIL_FROM || "Frequency <onboarding@resend.dev>"

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

/** Wraps body content in the shared Frequency email shell. */
function shell(heading: string, inner: string, footer?: string): string {
  return `
    <div style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#111827">
      <h1 style="font-size:20px;font-weight:600;margin:0 0 16px">${heading}</h1>
      ${inner}
      ${
        footer
          ? `<p style="font-size:12px;line-height:1.6;color:#6b7280;margin:24px 0 0;border-top:1px solid #e5e7eb;padding-top:16px">${footer}</p>`
          : ""
      }
    </div>
  `
}

export type EventEmailDetails = {
  eventTitle: string
  homeName: string
  date: string | null
  time: string | null
  location: string | null
  registrantName: string
  /** Absolute URL of the confirmation page, so the person can return to it. */
  confirmationUrl: string | null
}

/**
 * Sends a registration confirmation.
 *
 * FAIL-SOFT BY DESIGN: this never throws. A registration that is already
 * committed to the database must not be reported as failed because an email
 * provider was unreachable — the place is genuinely taken, and the confirmation
 * is also shown on screen. Failures are logged for diagnosis and returned as
 * `false` so a caller can surface a soft notice if it wants to.
 */
export async function sendRegistrationConfirmation(
  to: string,
  details: EventEmailDetails,
): Promise<boolean> {
  if (!resend) {
    console.log("[v0] RESEND_API_KEY not set — skipping event confirmation email.")
    return false
  }

  const when = [details.date, details.time].filter(Boolean).join(" at ")
  const rows: string[] = []
  if (when) rows.push(`<strong>When</strong><br />${escapeHtml(when)}`)
  if (details.location) rows.push(`<strong>Where</strong><br />${escapeHtml(details.location)}`)

  const inner = `
    <p style="font-size:14px;line-height:1.6;margin:0 0 12px">Hi ${escapeHtml(details.registrantName)},</p>
    <p style="font-size:14px;line-height:1.6;margin:0 0 20px">
      You're registered for <strong>${escapeHtml(details.eventTitle)}</strong>, hosted by
      ${escapeHtml(details.homeName)}.
    </p>
    ${
      rows.length > 0
        ? `<div style="font-size:14px;line-height:1.7;background:#f9fafb;border-radius:12px;padding:16px;margin:0 0 20px">${rows.join(
            '<br /><br />',
          )}</div>`
        : ""
    }
    ${
      details.confirmationUrl
        ? `<a href="${details.confirmationUrl}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 20px;border-radius:9999px">View your registration</a>`
        : ""
    }
  `

  try {
    const { data, error } = await resend.emails.send({
      from: FROM,
      to,
      subject: `You're registered — ${details.eventTitle}`,
      text: [
        `Hi ${details.registrantName},`,
        "",
        `You're registered for ${details.eventTitle}, hosted by ${details.homeName}.`,
        "",
        when ? `When: ${when}` : "",
        details.location ? `Where: ${details.location}` : "",
        "",
        details.confirmationUrl ? `View your registration: ${details.confirmationUrl}` : "",
        "",
        "You're receiving this because you registered for this event.",
      ]
        .filter((line) => line !== "")
        .join("\n"),
      html: shell(
        "You're registered",
        inner,
        "You're receiving this because you registered for this event.",
      ),
    })
    if (error) {
      console.log("[v0] Event confirmation email failed:", error)
      return false
    }
    console.log("[v0] Event confirmation email sent:", data?.id)
    return true
  } catch (err) {
    console.log("[v0] Event confirmation email threw:", err)
    return false
  }
}

/**
 * Sends one broadcast to many recipients, individually.
 *
 * Each recipient gets their OWN send with a single address in `to`. This is the
 * whole point: a shared `to` (or a cc) would expose every registrant's email
 * address to everyone else on the list, which for an event audience of hundreds
 * is a serious privacy breach. One send per person costs more requests and is
 * the correct trade.
 *
 * Sends are batched with small concurrency to stay within provider rate limits,
 * and are fail-soft per recipient: one bad address does not abort the broadcast.
 * Returns the delivered/failed split for the audit record.
 */
export async function sendBroadcast(input: {
  recipients: { email: string; name: string | null }[]
  subject: string
  body: string
  homeName: string
  /** Appended so recipients understand why they received this. */
  reason: string
}): Promise<{ sent: number; failed: number }> {
  if (!resend) {
    console.log("[v0] RESEND_API_KEY not set — skipping broadcast.")
    return { sent: 0, failed: input.recipients.length }
  }

  let sent = 0
  let failed = 0
  const CONCURRENCY = 5

  // Paragraph-preserving HTML from the admin's plain-text composition. Escaped
  // first so an admin cannot inject markup (deliberately or by pasting).
  const paragraphs = input.body
    .split(/\n{2,}/)
    .map((p) => `<p style="font-size:14px;line-height:1.6;margin:0 0 14px">${escapeHtml(p).replace(/\n/g, "<br />")}</p>`)
    .join("")

  for (let i = 0; i < input.recipients.length; i += CONCURRENCY) {
    const slice = input.recipients.slice(i, i + CONCURRENCY)
    const results = await Promise.all(
      slice.map(async (recipient) => {
        try {
          const greeting = recipient.name ? `Hi ${recipient.name},` : "Hi,"
          const { error } = await resend.emails.send({
            from: FROM,
            // Exactly one address. Never a list.
            to: recipient.email,
            subject: input.subject,
            text: [greeting, "", input.body, "", `— ${input.homeName}`, "", input.reason].join("\n"),
            html: shell(
              escapeHtml(input.subject),
              `<p style="font-size:14px;line-height:1.6;margin:0 0 14px">${escapeHtml(greeting)}</p>${paragraphs}
               <p style="font-size:14px;line-height:1.6;margin:18px 0 0;color:#6b7280">— ${escapeHtml(input.homeName)}</p>`,
              escapeHtml(input.reason),
            ),
          })
          return !error
        } catch {
          return false
        }
      }),
    )
    for (const ok of results) {
      if (ok) sent += 1
      else failed += 1
    }
  }

  console.log(`[v0] Broadcast complete: ${sent} sent, ${failed} failed.`)
  return { sent, failed }
}
