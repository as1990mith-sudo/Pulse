"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Radio } from "lucide-react"
import { authClient } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const router = useRouter()
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

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
              {isSignUp ? "Join the conversation" : "Welcome back"}
            </h1>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {isSignUp
                ? "Create a listener account to chat, call in, and post what's on your mind."
                : "Sign in to chat, call in, and share your thoughts."}
            </p>
          </div>

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
              <label htmlFor="password" className="text-sm font-medium">
                Password
              </label>
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

          <p className="mt-4 text-center text-sm text-muted-foreground">
            {isSignUp ? "Already have an account? " : "New to Frequency? "}
            <Link href={isSignUp ? "/sign-in" : "/sign-up"} className="font-medium text-primary hover:underline">
              {isSignUp ? "Sign in" : "Create an account"}
            </Link>
          </p>
        </div>
      </div>
    </main>
  )
}
