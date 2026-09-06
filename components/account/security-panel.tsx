"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { BadgeCheck, Loader2, LogOut, MailWarning, Monitor, Smartphone } from "lucide-react"
import { toast } from "sonner"
import { authClient } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

export type AccountSession = {
  id: string
  token: string
  device: string
  isMobile: boolean
  ip: string | null
  current: boolean
  createdAt: string
}

export function SecurityPanel({
  email,
  emailVerified,
  sessions,
}: {
  email: string
  emailVerified: boolean
  sessions: AccountSession[]
}) {
  return (
    <div className="flex flex-col gap-4">
      {!emailVerified && <VerifyEmailCard email={email} />}
      <ChangePasswordCard />
      <ChangeEmailCard currentEmail={email} emailVerified={emailVerified} />
      <SessionsCard sessions={sessions} />
    </div>
  )
}

function VerifyEmailCard({ email }: { email: string }) {
  const [sending, setSending] = useState(false)

  async function send() {
    setSending(true)
    const { error } = await authClient.sendVerificationEmail({ email, callbackURL: "/account/security" })
    setSending(false)
    if (error) {
      toast.error(error.message || "Couldn't send the verification email.")
      return
    }
    toast.success("Verification email sent")
  }

  return (
    <Card className="flex items-start gap-3 p-5">
      <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <MailWarning className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="font-semibold leading-tight">Verify your email</h2>
        <p className="mt-0.5 text-pretty text-sm leading-relaxed text-muted-foreground">
          Confirm {email} to secure your account.
        </p>
        <div className="mt-3">
          <Button size="sm" disabled={sending} onClick={send}>
            {sending && <Loader2 className="size-4 animate-spin" />}
            Send verification email
          </Button>
        </div>
      </div>
    </Card>
  )
}

function ChangePasswordCard() {
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [confirm, setConfirm] = useState("")
  const [saving, setSaving] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (next.length < 8) {
      toast.error("Your new password must be at least 8 characters.")
      return
    }
    if (next !== confirm) {
      toast.error("Those passwords don't match.")
      return
    }
    setSaving(true)
    const { error } = await authClient.changePassword({
      currentPassword: current,
      newPassword: next,
      revokeOtherSessions: false,
    })
    setSaving(false)
    if (error) {
      toast.error(error.message || "Couldn't change your password.")
      return
    }
    toast.success("Password changed")
    setCurrent("")
    setNext("")
    setConfirm("")
  }

  return (
    <Card className="p-5">
      <h2 className="mb-4 font-semibold leading-tight">Change password</h2>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <Field label="Current password">
          <Input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
        </Field>
        <Field label="New password">
          <Input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required />
        </Field>
        <Field label="Confirm new password">
          <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        </Field>
        <div className="mt-1">
          <Button type="submit" disabled={saving || !current || !next}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            Update password
          </Button>
        </div>
      </form>
    </Card>
  )
}

function ChangeEmailCard({ currentEmail, emailVerified }: { currentEmail: string; emailVerified: boolean }) {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [saving, setSaving] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const next = email.trim().toLowerCase()
    if (!next || next === currentEmail.toLowerCase()) {
      toast.error("Enter a new email address.")
      return
    }
    setSaving(true)
    const { error } = await authClient.changeEmail({ newEmail: next, callbackURL: "/account/security" })
    setSaving(false)
    if (error) {
      toast.error(error.message || "Couldn't change your email.")
      return
    }
    // When the current address is verified, Better Auth emails it an approval
    // link and defers the change; otherwise it applies immediately.
    if (emailVerified) {
      toast.success("Check your current inbox to approve the change")
    } else {
      toast.success("Email updated")
      router.refresh()
    }
    setEmail("")
  }

  return (
    <Card className="p-5">
      <h2 className="mb-1 font-semibold leading-tight">Change email</h2>
      <p className="mb-4 text-sm text-muted-foreground">Current: {currentEmail}</p>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <Field label="New email address">
          <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <div className="mt-1">
          <Button type="submit" disabled={saving || !email}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            Update email
          </Button>
        </div>
      </form>
    </Card>
  )
}

function SessionsCard({ sessions }: { sessions: AccountSession[] }) {
  const router = useRouter()
  const [busyToken, setBusyToken] = useState<string | null>(null)
  const [revokingAll, setRevokingAll] = useState(false)
  const hasOthers = sessions.some((s) => !s.current)

  async function revokeOne(token: string) {
    setBusyToken(token)
    const { error } = await authClient.revokeSession({ token })
    setBusyToken(null)
    if (error) {
      toast.error(error.message || "Couldn't sign out that device.")
      return
    }
    toast.success("Signed out")
    router.refresh()
  }

  async function revokeOthers() {
    setRevokingAll(true)
    const { error } = await authClient.revokeOtherSessions()
    setRevokingAll(false)
    if (error) {
      toast.error(error.message || "Couldn't sign out other devices.")
      return
    }
    toast.success("Signed out of all other devices")
    router.refresh()
  }

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="font-semibold leading-tight">Active sessions</h2>
        {hasOthers && (
          <Button size="sm" variant="outline" disabled={revokingAll} onClick={revokeOthers}>
            {revokingAll ? <Loader2 className="size-4 animate-spin" /> : <LogOut className="size-4" />}
            Sign out others
          </Button>
        )}
      </div>
      <ul className="flex flex-col divide-y divide-border/60">
        {sessions.map((s) => {
          const Icon = s.isMobile ? Smartphone : Monitor
          return (
            <li key={s.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-foreground">
                <Icon className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 truncate text-[15px] font-medium">
                  {s.device}
                  {s.current && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      <BadgeCheck className="size-3" />
                      This device
                    </span>
                  )}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {s.ip ? `${s.ip} · ` : ""}
                  {new Date(s.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
                </p>
              </div>
              {!s.current && (
                <button
                  type="button"
                  onClick={() => revokeOne(s.token)}
                  disabled={busyToken === s.token}
                  className={cn(
                    "shrink-0 rounded-full px-3 py-1.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-60",
                  )}
                >
                  {busyToken === s.token ? <Loader2 className="size-4 animate-spin" /> : "Sign out"}
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-foreground">{label}</span>
      {children}
    </label>
  )
}
