"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowRight, CheckCircle2, Clock, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { joinHomeByKey } from "@/app/actions/home"
import { isValidKeyFormat, normalizeKey } from "@/lib/home/auth-key"

type Result =
  | { status: "joined"; handle: string; homeName: string }
  | { status: "pending"; handle: string; homeName: string }
  | { status: "already_member"; handle: string; homeName: string }

export function JoinHomeForm({ initialKey = "" }: { initialKey?: string }) {
  const router = useRouter()
  const [value, setValue] = useState(initialKey)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<Result | null>(null)

  const valid = isValidKeyFormat(value)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!valid) {
      setError("Enter a key in the format FREQ-XXX-XXXX-XXXX.")
      return
    }
    setLoading(true)
    try {
      const res = await joinHomeByKey(normalizeKey(value))
      setResult(res)
      if (res.status === "joined" || res.status === "already_member") {
        router.refresh()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't join. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  if (result && (result.status === "joined" || result.status === "already_member")) {
    return (
      <ResultCard
        icon={<CheckCircle2 className="size-6 text-primary" />}
        title={result.status === "joined" ? `Welcome to ${result.homeName}` : `You're already in ${result.homeName}`}
        desc="You now have access to this organisation's private Home."
        cta="Enter Home"
        onClick={() => router.push(`/home/${result.handle}`)}
      />
    )
  }

  if (result && result.status === "pending") {
    return (
      <ResultCard
        icon={<Clock className="size-6 text-primary" />}
        title="Request sent"
        desc={`Your request to join ${result.homeName} is awaiting approval from an administrator. You'll get access once it's approved.`}
        cta="Back to Home"
        onClick={() => router.push("/home")}
      />
    )
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-border/60 bg-card p-6">
      <div className="space-y-1.5">
        <label htmlFor="auth-key" className="text-sm font-medium">
          Authorisation key
        </label>
        <input
          id="auth-key"
          value={value}
          onChange={(e) => setValue(e.target.value.toUpperCase())}
          placeholder="FREQ-KNG-7F42-XP91"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          className="w-full rounded-xl border border-input bg-background px-3.5 py-3 text-center font-mono text-base tracking-[0.15em] shadow-sm placeholder:tracking-normal placeholder:text-muted-foreground/60 focus-visible:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" disabled={loading || !valid} className="w-full gap-2 py-3">
        {loading ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
        {loading ? "Joining…" : "Join Home"}
      </Button>

      <p className="text-center text-xs leading-relaxed text-muted-foreground">
        Don't have a key? Ask your organisation's administrator to share it with you.
      </p>
    </form>
  )
}

function ResultCard({
  icon,
  title,
  desc,
  cta,
  onClick,
}: {
  icon: React.ReactNode
  title: string
  desc: string
  cta: string
  onClick: () => void
}) {
  return (
    <div className="space-y-4 rounded-2xl border border-border/60 bg-card p-6 text-center">
      <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary/10">{icon}</span>
      <div className="space-y-1.5">
        <h2 className="text-lg font-bold tracking-tight text-balance">{title}</h2>
        <p className="text-sm leading-relaxed text-muted-foreground text-pretty">{desc}</p>
      </div>
      <Button type="button" onClick={onClick} className="w-full gap-2">
        {cta} <ArrowRight className="size-4" />
      </Button>
    </div>
  )
}
