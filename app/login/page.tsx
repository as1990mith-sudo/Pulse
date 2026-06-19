"use client"

import { useRouter } from "next/navigation"
import Link from "next/link"
import { Radio } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export default function LoginPage() {
  const router = useRouter()

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    router.push("/studio")
  }

  return (
    <main className="flex min-h-screen flex-col">
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
            <h1 className="text-2xl font-bold tracking-tight text-balance">Welcome back, host</h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Sign in to open your studio and go live.
            </p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border border-border/60 bg-card p-6">
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium">
                Email
              </label>
              <Input id="email" type="email" placeholder="you@example.com" required />
            </div>
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium">
                Password
              </label>
              <Input id="password" type="password" placeholder="••••••••" required />
            </div>
            <Button type="submit" className="w-full">
              Sign in
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-muted-foreground">
            New host?{" "}
            <Link href="/studio" className="font-medium text-primary hover:underline">
              Open the studio
            </Link>
          </p>
        </div>
      </div>
    </main>
  )
}
