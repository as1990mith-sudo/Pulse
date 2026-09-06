import type { Metadata } from "next"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { AccountPageShell } from "@/components/account/account-ui"
import { SecurityPanel, type AccountSession } from "@/components/account/security-panel"

export const metadata: Metadata = {
  title: "Security · Account",
  description: "Protect your account.",
}

/** Turns a raw user-agent string into a short "Browser on OS" label. */
function describeDevice(ua: string | null | undefined): { label: string; isMobile: boolean } {
  if (!ua) return { label: "Unknown device", isMobile: false }
  const isMobile = /Mobile|Android|iPhone|iPad|iPod/i.test(ua)
  const browser =
    /Edg/i.test(ua) ? "Edge"
    : /OPR|Opera/i.test(ua) ? "Opera"
    : /Chrome/i.test(ua) ? "Chrome"
    : /Firefox/i.test(ua) ? "Firefox"
    : /Safari/i.test(ua) ? "Safari"
    : "Browser"
  const os =
    /iPhone|iPad|iPod/i.test(ua) ? "iOS"
    : /Android/i.test(ua) ? "Android"
    : /Mac OS X|Macintosh/i.test(ua) ? "macOS"
    : /Windows/i.test(ua) ? "Windows"
    : /Linux/i.test(ua) ? "Linux"
    : "device"
  return { label: `${browser} on ${os}`, isMobile }
}

export default async function AccountSecurityPage() {
  const h = await headers()
  const session = await auth.api.getSession({ headers: h })
  if (!session?.user) redirect("/sign-in")

  const currentToken = session.session.token
  const raw = await auth.api.listSessions({ headers: h })

  const sessions: AccountSession[] = raw
    .map((s) => {
      const { label, isMobile } = describeDevice(s.userAgent)
      return {
        id: s.id,
        token: s.token,
        device: label,
        isMobile,
        ip: s.ipAddress ?? null,
        current: s.token === currentToken,
        createdAt: new Date(s.createdAt).toISOString(),
      }
    })
    // Current device first, then most recently created.
    .sort((a, b) => (a.current ? -1 : b.current ? 1 : b.createdAt.localeCompare(a.createdAt)))

  return (
    <AccountPageShell title="Security">
      <SecurityPanel
        email={session.user.email}
        emailVerified={session.user.emailVerified}
        sessions={sessions}
      />
    </AccountPageShell>
  )
}
