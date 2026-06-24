"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Radio } from "lucide-react"
import { authClient } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export function AuthForm({ mode, googleEnabled = false }: { mode: "sign-in" | "sign-up"; googleEnabled?: boolean }) {
  const router = useRouter()
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  // Sign-in only: toggles the inline "forgot password" view + its success note.
  const [forgot, setForgot] = useState(false)
  const [resetSent, setResetSent] = useState(false)

  const isSignUp = mode === "sign-up"

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { error } = isSignUp
      ? await authClient.signUp.email({ email, password, name })
      : await authClient.signIn.email({ email, password })

    setLoading(false)

    if (error) {
      setError(error.message ?? "Something went wrong. Please try again.")
      return
    }

    router.push("/feed")
    router.refresh()
  }

  async function handleForgotSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { error } = await authClient.requestPasswordReset({
      email,
      redirectTo: "/reset-password",
    })

    setLoading(false)

    if (error) {
      setError(error.message ?? "Couldn't send the reset email. Please try again.")
      return
    }

    // Always show success (don't reveal whether the email exists).
    setResetSent(true)
  }

  async function handleGoogle() {
    setError(null)
    setGoogleLoading(true)
    // Better Auth redirects to Google, then back to `callbackURL`. It creates
    // the account automatically on first sign-in, so this covers sign-up too.
    const { error } = await authClient.signIn.social({
      provider: "google",
      callbackURL: "/feed",
    })
    if (error) {
      setGoogleLoading(false)
      setError(error.message ?? "Couldn't sign in with Google. Please try again.")
    }
    // On success the browser navigates away to Google — no further work here.
  }

  function backToSignIn() {
    setForgot(false)
    setResetSent(false)
    setError(null)
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
              {forgot ? "Reset your password" : isSignUp ? "Join the conversation" : "Welcome back"}
            </h1>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {forgot
                ? "Enter your account email and we'll send you a link to choose a new password."
                : isSignUp
                  ? "Create a listener account to chat, call in, and post what's on your mind."
                  : "Sign in to chat, call in, and share your thoughts."}
            </p>
          </div>

          {forgot ? (
            resetSent ? (
              <div className="space-y-4 rounded-2xl border border-border/60 bg-card p-6 text-center">
                <p className="text-sm leading-relaxed text-muted-foreground">
                  If an account exists for <span className="font-medium text-foreground">{email}</span>, a password
                  reset link is on its way. Check your inbox (and spam folder) — the link expires in 1 hour.
                </p>
                <Button type="button" variant="outline" onClick={backToSignIn} className="w-full">
                  Back to sign in
                </Button>
              </div>
            ) : (
              <form onSubmit={handleForgotSubmit} className="space-y-4 rounded-2xl border border-border/60 bg-card p-6">
                <div className="space-y-2">
                  <label htmlFor="reset-email" className="text-sm font-medium">
                    Email
                  </label>
                  <Input
                    id="reset-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    autoComplete="email"
                  />
                </div>

                {error && (
                  <p className="text-sm text-destructive" role="alert">
                    {error}
                  </p>
                )}

                <Button type="submit" disabled={loading} className="w-full">
                  {loading ? "Sending..." : "Send reset link"}
                </Button>
                <button
                  type="button"
                  onClick={backToSignIn}
                  className="w-full text-center text-sm font-medium text-primary hover:underline"
                >
                  Back to sign in
                </button>
              </form>
            )
          ) : (
          <>
          {googleEnabled && (
            <div className="mb-4 space-y-4">
              <Button
                type="button"
                variant="outline"
                onClick={handleGoogle}
                disabled={googleLoading || loading}
                className="w-full gap-2"
              >
                <GoogleIcon className="size-4" />
                {googleLoading ? "Redirecting..." : `Continue with Google`}
              </Button>
              <div className="flex items-center gap-3">
                <span className="h-px flex-1 bg-border" />
                <span className="text-xs text-muted-foreground">or</span>
                <span className="h-px flex-1 bg-border" />
              </div>
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-border/60 bg-card p-6">
            {isSignUp && (
              <div className="space-y-2">
                <label htmlFor="name" className="text-sm font-medium">
                  Display name
                </label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="What should we call you?"
                  required
                  autoComplete="name"
                />
              </div>
            )}
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium">
                Email
              </label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="text-sm font-medium">
                  Password
                </label>
                {!isSignUp && (
                  <button
                    type="button"
                    onClick={() => {
                      setForgot(true)
                      setError(null)
                    }}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={8}
                autoComplete={isSignUp ? "new-password" : "current-password"}
              />
            </div>

            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}

            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Please wait..." : isSignUp ? "Create account" : "Sign in"}
            </Button>
          </form>
          </>
          )}

          {!forgot && (
            <p className="mt-4 text-center text-sm text-muted-foreground">
              {isSignUp ? "Already have an account? " : "New to Frequency? "}
              <Link href={isSignUp ? "/sign-in" : "/sign-up"} className="font-medium text-primary hover:underline">
                {isSignUp ? "Sign in" : "Create an account"}
              </Link>
            </p>
          )}
        </div>
      </div>
    </main>
  )
}

// Multi-color Google "G" mark for the OAuth button (lucide has no brand icons).
function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05l3.01-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  )
}
