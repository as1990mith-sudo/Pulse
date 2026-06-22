"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Radio } from "lucide-react"
import { authClient } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export function ResetPasswordForm() {
  const router = useRouter()
  const params = useSearchParams()
  const token = params.get("token")
  // Better Auth appends ?error=INVALID_TOKEN when the link is bad/expired.
  const linkError = params.get("error")

  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  const invalid = !token || linkError

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (password !== confirm) {
      setError("Passwords don't match.")
      return
    }
    if (!token) {
      setError("This reset link is invalid or has expired.")
      return
    }

    setLoading(true)
    const { error } = await authClient.resetPassword({ newPassword: password, token })
    setLoading(false)

    if (error) {
      setError(error.message ?? "Couldn't reset your password. Request a new link and try again.")
      return
    }

    setDone(true)
  }

  return (
    <main className="flex min-h-svh flex-col">
      <div className="mx-auto flex w-full max-w-6xl items-center px-4 py-6 sm:px-6">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Radio className="size-4" />
          </span>
          <span className="text-lg font-semibold tracking-tight">Frequency</span>
        </Link>
      </div>

      <div className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-sm">
          <div className="mb-8 space-y-2 text-center">
            <h1 className="text-2xl font-bold tracking-tight text-balance">
              {done ? "Password updated" : "Choose a new password"}
            </h1>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {done
                ? "Your password has been changed. You can now sign in with it."
                : "Enter a new password for your Frequency account."}
            </p>
          </div>

          {done ? (
            <div className="rounded-2xl border border-border/60 bg-card p-6">
              <Button onClick={() => router.push("/sign-in")} className="w-full">
                Go to sign in
              </Button>
            </div>
          ) : invalid ? (
            <div className="space-y-4 rounded-2xl border border-border/60 bg-card p-6 text-center">
              <p className="text-sm leading-relaxed text-muted-foreground">
                This reset link is invalid or has expired. Reset links are only valid for 1 hour.
              </p>
              <Button onClick={() => router.push("/sign-in")} variant="outline" className="w-full">
                Request a new link
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-border/60 bg-card p-6">
              <div className="space-y-2">
                <label htmlFor="new-password" className="text-sm font-medium">
                  New password
                </label>
                <Input
                  id="new-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={8}
                  autoComplete="new-password"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="confirm-password" className="text-sm font-medium">
                  Confirm new password
                </label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={8}
                  autoComplete="new-password"
                />
              </div>

              {error && (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              )}

              <Button type="submit" disabled={loading} className="w-full">
                {loading ? "Updating..." : "Update password"}
              </Button>
            </form>
          )}
        </div>
      </div>
    </main>
  )
}
