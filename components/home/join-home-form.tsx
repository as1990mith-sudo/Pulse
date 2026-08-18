"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowRight, CheckCircle2, Clock, Loader2, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { joinHomeByKey, previewHomeByKey, type HomeKeyPreview } from "@/app/actions/home"
import { isValidKeyFormat, normalizeKey } from "@/lib/home/auth-key"

type Result =
  | { status: "joined"; handle: string; homeName: string }
  | { status: "pending"; handle: string; homeName: string }
  | { status: "already_member"; handle: string; homeName: string }

/**
 * Two-step join (spec §5). Step 1: the member enters their Home key and we
 * validate it — an invalid key is rejected with a clear message and the user
 * cannot proceed. Step 2: on a valid key we reveal the organisation's identity
 * ("You are joining this Home") and only then let them confirm and join.
 */
export function JoinHomeForm({ initialKey = "", signedIn = true }: { initialKey?: string; signedIn?: boolean }) {
  const router = useRouter()
  const [value, setValue] = useState(initialKey)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<HomeKeyPreview | null>(null)
  const [result, setResult] = useState<Result | null>(null)

  const valid = isValidKeyFormat(value)

  async function validate(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!valid) {
      setError("Enter a key in the format FREQ-XXX-XXXX-XXXX.")
      return
    }
    setLoading(true)
    try {
      const p = await previewHomeByKey(normalizeKey(value))
      setPreview(p)
    } catch (err) {
      setError(err instanceof Error ? err.message : "That Home key isn't recognised.")
    } finally {
      setLoading(false)
    }
  }

  async function confirmJoin() {
    if (!preview) return
    // Spec §5: a member becomes part of the Home only after account creation.
    // If the viewer isn't signed in yet, take them to sign-up now that they've
    // confirmed the organisation, preserving the validated key so they land
    // straight back on this confirmation step afterwards.
    if (!signedIn) {
      const next = `/home/join?key=${encodeURIComponent(normalizeKey(value))}`
      router.push(`/sign-up?next=${encodeURIComponent(next)}`)
      return
    }
    setError(null)
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
        onClick={() => router.push("/")}
      />
    )
  }

  if (result && result.status === "pending") {
    return (
      <ResultCard
        icon={<Clock className="size-6 text-primary" />}
        title="Request sent"
        desc={`Your request to join ${result.homeName} is awaiting approval from an administrator. You'll get access once it's approved.`}
        cta="Done"
        onClick={() => router.push("/")}
      />
    )
  }

  // Step 2 — confirm the organisation identity before joining.
  if (preview) {
    return (
      <div className="space-y-5 rounded-2xl border border-border/60 bg-card p-6 text-center">
        <span
          className="mx-auto flex size-16 items-center justify-center overflow-hidden rounded-2xl text-xl font-bold text-white"
          style={{ backgroundColor: preview.accent }}
        >
          {preview.orgLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview.orgLogo || "/placeholder.svg"} alt="" className="size-full object-cover" />
          ) : (
            preview.orgInitials
          )}
        </span>
        <div className="space-y-1">
          <h2 className="text-xl font-bold tracking-tight text-balance">{preview.homeName}</h2>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{preview.categoryLabel}</p>
          <p className="pt-1 text-sm text-muted-foreground">You are joining this Home.</p>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="space-y-2">
          <Button type="button" onClick={confirmJoin} disabled={loading} className="w-full gap-2 py-3">
            {loading ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
            {loading ? "Joining…" : signedIn ? `Continue to ${preview.homeName}` : "Create your account to join"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setPreview(null)
              setError(null)
            }}
            disabled={loading}
            className="w-full"
          >
            Use a different key
          </Button>
        </div>
      </div>
    )
  }

  // Step 1 — enter and validate the key.
  return (
    <form onSubmit={validate} className="space-y-4 rounded-2xl border border-border/60 bg-card p-6">
      <div className="space-y-1.5">
        <label htmlFor="auth-key" className="text-sm font-medium">
          Home key
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
        {loading ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
        {loading ? "Checking…" : "Continue"}
      </Button>

      <p className="text-center text-xs leading-relaxed text-muted-foreground">
        Don&apos;t have a key? Ask your organisation&apos;s administrator to share it with you.
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
