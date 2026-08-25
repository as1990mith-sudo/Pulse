"use client"

import { useEffect, useState, useTransition } from "react"
import { Check, Copy, KeyRound, Loader2, RefreshCw, Share2, ShieldOff } from "lucide-react"
import { cn } from "@/lib/utils"
import { regenerateAuthKey, disableAuthKey, setJoinPolicy } from "@/app/actions/home"
import type { HomeAuthKeyView, HomeJoinPolicy } from "@/lib/home/types"

export function AuthKeyManager({
  handle,
  initialKey,
  initialPolicy,
}: {
  handle: string
  initialKey: HomeAuthKeyView | null
  initialPolicy: HomeJoinPolicy
}) {
  const [authKey, setAuthKey] = useState(initialKey)
  const [policy, setPolicy] = useState<HomeJoinPolicy>(initialPolicy)
  const [copied, setCopied] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)
  const [pending, startTransition] = useTransition()
  const [confirmDisable, setConfirmDisable] = useState(false)

  // The invite link needs the real origin, which only exists in the browser.
  // Read it after mount rather than during render so the server and client
  // markup agree — building it inline would hydrate-mismatch on every load.
  const [origin, setOrigin] = useState("")
  useEffect(() => setOrigin(window.location.origin), [])

  // /home/join already reads ?key=, so the link just deep-links into the same
  // confirm-then-join flow an admin would otherwise talk someone through.
  const inviteLink = authKey && origin ? `${origin}/home/join?key=${encodeURIComponent(authKey.key)}` : ""

  function copy() {
    if (!authKey) return
    navigator.clipboard.writeText(authKey.key)
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  function copyLink() {
    if (!inviteLink) return
    navigator.clipboard.writeText(inviteLink)
    setLinkCopied(true)
    setTimeout(() => setLinkCopied(false), 1600)
  }

  async function share() {
    if (!inviteLink) return
    // Native share sheet on mobile (WhatsApp, Messages, email); fall back to a
    // plain copy on desktop, where navigator.share mostly doesn't exist.
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: "Join our Home", text: "Join our Home on Pulse", url: inviteLink })
        return
      } catch {
        // Cancelling the sheet throws; that isn't an error worth surfacing.
        return
      }
    }
    copyLink()
  }

  function regenerate() {
    startTransition(async () => {
      const res = await regenerateAuthKey(handle)
      setAuthKey({ id: "new", key: res.key, active: true, createdAt: new Date().toISOString() })
      setConfirmDisable(false)
    })
  }

  function disable() {
    startTransition(async () => {
      await disableAuthKey(handle)
      setAuthKey(null)
      setConfirmDisable(false)
    })
  }

  function changePolicy(next: HomeJoinPolicy) {
    setPolicy(next)
    startTransition(() => {
      void setJoinPolicy(handle, next)
    })
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="mb-4 flex items-center gap-2">
          <span
            className="flex size-9 items-center justify-center rounded-xl text-white"
            style={{ backgroundColor: "var(--home-accent)" }}
          >
            <KeyRound className="size-[18px]" />
          </span>
          <div>
            <h3 className="text-sm font-semibold">Organisation authorisation key</h3>
            <p className="text-xs text-muted-foreground">Members enter this key to join your Home.</p>
          </div>
        </div>

        {authKey ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <code className="flex-1 select-all rounded-xl border border-border bg-muted/40 px-4 py-3 font-mono text-base tracking-wider">
              {authKey.key}
            </code>
            <button
              type="button"
              onClick={copy}
              className={cn(
                "inline-flex items-center justify-center gap-2 rounded-xl border border-border px-4 py-3 text-sm font-semibold transition-colors hover:bg-muted",
                copied && "border-emerald-500/40 text-emerald-500",
              )}
            >
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
            No active key. Regenerate one to let new members join.
          </div>
        )}

        {/* Ready-to-send invite link. Most people are invited over WhatsApp or
            email, where a tappable link is far more reliable than asking someone
            to retype a key into the right screen. */}
        {authKey && (
          <div className="mt-4 rounded-xl border border-border bg-muted/20 p-3">
            <p className="mb-2 text-xs font-semibold text-muted-foreground">Invite link</p>
            <p className="mb-3 break-all font-mono text-xs leading-relaxed text-foreground/80">
              {inviteLink || "Preparing link…"}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={copyLink}
                disabled={!inviteLink}
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold transition-colors hover:bg-muted disabled:opacity-60",
                  linkCopied && "border-emerald-500/40 text-emerald-500",
                )}
              >
                {linkCopied ? <Check className="size-4" /> : <Copy className="size-4" />}
                {linkCopied ? "Link copied" : "Copy link"}
              </button>
              <button
                type="button"
                onClick={share}
                disabled={!inviteLink}
                className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted disabled:opacity-60"
              >
                <Share2 className="size-4" /> Share
              </button>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Opens straight to a confirmation screen. If they don&apos;t have an account yet, they&apos;ll join this
              Home right after signing up.
            </p>
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={regenerate}
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            style={{ backgroundColor: "var(--home-accent)" }}
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            Regenerate key
          </button>
          {authKey &&
            (confirmDisable ? (
              <span className="inline-flex items-center gap-2">
                <button
                  type="button"
                  onClick={disable}
                  disabled={pending}
                  className="inline-flex items-center gap-2 rounded-lg bg-destructive px-3 py-2 text-sm font-semibold text-destructive-foreground hover:opacity-90 disabled:opacity-60"
                >
                  <ShieldOff className="size-4" /> Confirm disable
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDisable(false)}
                  className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
                >
                  Cancel
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDisable(true)}
                className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold text-muted-foreground hover:bg-muted"
              >
                <ShieldOff className="size-4" /> Disable key
              </button>
            ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Regenerating or disabling the key never removes existing members — it only affects future onboarding.
        </p>
      </div>

      {/* Join policy */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <h3 className="mb-4 text-sm font-semibold">When someone enters a valid key</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <PolicyCard
            active={policy === "auto"}
            onClick={() => changePolicy("auto")}
            title="Join automatically"
            desc="A valid key grants instant membership."
          />
          <PolicyCard
            active={policy === "approval"}
            onClick={() => changePolicy("approval")}
            title="Require approval"
            desc="A valid key creates a request an admin approves."
          />
        </div>
      </div>
    </div>
  )
}

function PolicyCard({
  active,
  onClick,
  title,
  desc,
}: {
  active: boolean
  onClick: () => void
  title: string
  desc: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-xl border p-4 text-left transition-all",
        active ? "border-transparent ring-2" : "border-border hover:bg-muted/40",
      )}
      style={active ? { ["--tw-ring-color" as string]: "var(--home-accent)" } : undefined}
    >
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{desc}</p>
    </button>
  )
}
