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
