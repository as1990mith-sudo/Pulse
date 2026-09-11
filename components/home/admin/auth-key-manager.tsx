"use client"

import { useEffect, useState, useTransition } from "react"
import { Check, Copy, KeyRound, Loader2, RefreshCw, Share2, ShieldOff } from "lucide-react"
import { cn } from "@/lib/utils"
import { regenerateAuthKey, disableAuthKey, setJoinPolicy } from "@/app/actions/home"
import type { HomeAuthKeyView, HomeJoinPolicy } from "@/lib/home/types"

// Shared surface for the console's compact cards: translucent card fill, inset
// hairline ring, and a soft shadow. Matches the Overview command-centre tiles.
const SURFACE = "rounded-2xl bg-card/60 shadow-soft ring-1 ring-inset ring-border/50"

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
    <div className="space-y-4">
      {/* ── Auth key hero ─────────────────────────────────────────────
          A gradient accent wash in the top-right corner lifts this from a
          flat card into the console's "hero" surface without flooding it. */}
      <div className={cn("relative overflow-hidden p-4", SURFACE)}>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(130% 95% at 100% 0%, color-mix(in oklab, var(--home-accent) 15%, transparent), transparent 55%)",
          }}
        />
        <div className="relative">
          <div className="mb-3.5 flex items-center gap-2.5">
            <span
              className="flex size-9 shrink-0 items-center justify-center rounded-xl text-white shadow-soft"
              style={{
                background:
                  "linear-gradient(135deg, var(--home-accent), color-mix(in oklab, var(--home-accent) 55%, #000))",
              }}
            >
              <KeyRound className="size-[18px]" />
            </span>
            <div className="min-w-0">
              <h3 className="font-display text-sm font-semibold tracking-tight">Organisation authorisation key</h3>
              <p className="text-xs text-muted-foreground">Members enter this key to join your Home.</p>
            </div>
          </div>

          {authKey ? (
            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
              <code className="flex-1 select-all rounded-xl bg-background/60 px-3.5 py-2.5 font-mono text-[15px] tracking-wider ring-1 ring-inset ring-border/60">
                {authKey.key}
              </code>
              <button
                type="button"
                onClick={copy}
                className={cn(
                  "tap-scale inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold ring-1 ring-inset ring-border/60 transition-colors hover:bg-secondary/60",
                  copied && "text-emerald-500 ring-emerald-500/40",
                )}
              >
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border/70 bg-background/40 px-4 py-5 text-center text-sm text-muted-foreground">
              No active key. Regenerate one to let new members join.
            </div>
          )}

          {/* Ready-to-send invite link. Most people are invited over WhatsApp or
              email, where a tappable link is far more reliable than asking
              someone to retype a key into the right screen. */}
          {authKey && (
            <div className="mt-3 rounded-xl bg-background/50 p-3 ring-1 ring-inset ring-border/50">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Invite link
              </p>
              <p className="mb-2.5 break-all font-mono text-xs leading-relaxed text-foreground/80">
                {inviteLink || "Preparing link…"}
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={copyLink}
                  disabled={!inviteLink}
                  className={cn(
                    "tap-scale inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-[13px] font-semibold ring-1 ring-inset ring-border/60 transition-colors hover:bg-secondary/60 disabled:opacity-60",
                    linkCopied && "text-emerald-500 ring-emerald-500/40",
                  )}
                >
                  {linkCopied ? <Check className="size-4" /> : <Copy className="size-4" />}
                  {linkCopied ? "Link copied" : "Copy link"}
                </button>
                <button
                  type="button"
                  onClick={share}
                  disabled={!inviteLink}
                  className="tap-scale inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-[13px] font-semibold text-muted-foreground ring-1 ring-inset ring-border/60 transition-colors hover:bg-secondary/60 disabled:opacity-60"
                >
                  <Share2 className="size-4" /> Share
                </button>
              </div>
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={regenerate}
              disabled={pending}
              className="tap-scale inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold text-white shadow-soft transition-opacity hover:opacity-95 disabled:opacity-60"
              style={{
                background:
                  "linear-gradient(135deg, var(--home-accent), color-mix(in oklab, var(--home-accent) 60%, #000))",
              }}
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
                    className="tap-scale inline-flex items-center gap-2 rounded-lg bg-destructive px-3.5 py-2 text-sm font-semibold text-destructive-foreground hover:opacity-90 disabled:opacity-60"
                  >
                    <ShieldOff className="size-4" /> Confirm disable
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDisable(false)}
                    className="tap-scale rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary/60"
                  >
                    Cancel
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDisable(true)}
                  className="tap-scale inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold text-muted-foreground ring-1 ring-inset ring-border/60 hover:bg-secondary/60"
                >
                  <ShieldOff className="size-4" /> Disable key
                </button>
              ))}
          </div>
        </div>
      </div>

      {/* ── Join policy ──────────────────────────────────────────────── */}
      <div className={cn("p-4", SURFACE)}>
        <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          When someone enters a valid key
        </h3>
        <div className="grid gap-2.5 sm:grid-cols-2">
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
        "tap-scale relative overflow-hidden rounded-xl p-3.5 text-left ring-1 ring-inset transition-all",
        active ? "ring-transparent" : "ring-border/60 hover:bg-secondary/40",
      )}
      style={
        active
          ? {
              background:
                "linear-gradient(135deg, color-mix(in oklab, var(--home-accent) 22%, transparent), color-mix(in oklab, var(--home-accent) 5%, transparent))",
              boxShadow: "inset 0 0 0 1.5px color-mix(in oklab, var(--home-accent) 55%, transparent)",
            }
          : undefined
      }
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">{title}</p>
        {active && (
          <span
            className="flex size-4 items-center justify-center rounded-full text-white"
            style={{ backgroundColor: "var(--home-accent)" }}
          >
            <Check className="size-3" />
          </span>
        )}
      </div>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{desc}</p>
    </button>
  )
}
