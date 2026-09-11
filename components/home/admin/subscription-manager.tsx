"use client"

// Frequency Home — Subscription.
//
// The premium plan-selection experience for a Home Owner/Admin: choose a plan
// (side-by-side on desktop), open its full grouped detail, pick a billing
// cadence, review a compact summary, and subscribe. No real charge is taken —
// `changePlan` persists the plan, interval and a computed renewal date (all
// re-validated server-side). Pricing/features are read from lib/home/plans.
//
// Kept as one file so the whole flow stays cohesive; it is composed of small,
// clearly-named sections (cards, detail sheet, compare, summary).

import { useMemo, useState, useTransition } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { Check, ChevronRight, Sparkles, Loader2, X, AlertTriangle } from "lucide-react"
import {
  HOME_PLAN_LIST,
  HOME_PLAN_COMPARISON,
  type BillingInterval,
  type HomePlan,
  type HomePlanId,
  annualSavings,
  annualSavingsPercent,
  formatMoney,
  monthlyEquivalent,
  priceFor,
} from "@/lib/home/plans"
import { changePlan } from "@/app/actions/home"
import { cn } from "@/lib/utils"

type Props = {
  handle: string
  currentPlan: HomePlanId
  currentInterval: BillingInterval
  planStatus: string
  renewsAt: string | null
}

const DATE_FMT = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" })

function formatDate(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : DATE_FMT.format(d)
}

const intervalLabel: Record<BillingInterval, string> = { monthly: "Monthly", annual: "Annual" }

export function SubscriptionManager({ handle, currentPlan, currentInterval, planStatus, renewsAt }: Props) {
  // The persisted, confirmed subscription (what the "Current plan" strip shows).
  const [saved, setSaved] = useState<{ plan: HomePlanId; interval: BillingInterval; renewsAt: string | null }>({
    plan: currentPlan,
    interval: currentInterval,
    renewsAt,
  })
  const [status, setStatus] = useState(planStatus)

  // The plan whose detail sheet is open (selection in-progress). null = closed.
  const [openPlanId, setOpenPlanId] = useState<HomePlanId | null>(null)
  const [interval, setInterval] = useState<BillingInterval>(currentInterval)
  const [compareOpen, setCompareOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const savedPlan = useMemo(() => HOME_PLAN_LIST.find((p) => p.id === saved.plan) ?? HOME_PLAN_LIST[0], [saved.plan])
  const openPlan = useMemo(() => HOME_PLAN_LIST.find((p) => p.id === openPlanId) ?? null, [openPlanId])

  const hasSubscription = status === "active" || status === "trialing" || status === "past_due"
  const savedRenews = formatDate(saved.renewsAt)

  function openPlanDetail(plan: HomePlan) {
    setInterval(saved.plan === plan.id ? saved.interval : interval)
    setOpenPlanId(plan.id)
    setError(null)
  }

  function subscribe(plan: HomePlan) {
    setError(null)
    startTransition(async () => {
      try {
        const res = await changePlan(handle, plan.id, interval)
        setSaved({ plan: res.plan, interval: res.interval, renewsAt: res.renewsAt })
        setStatus("active")
        setOpenPlanId(null)
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong. Try again.")
      }
    })
  }

  return (
    <div className="space-y-5">
      <CurrentPlanStrip
        hasSubscription={hasSubscription}
        status={status}
        plan={savedPlan}
        interval={saved.interval}
        renews={savedRenews}
      />

      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-pretty text-base font-semibold text-[var(--home-fg,inherit)]">
            {hasSubscription ? "Change plan" : "Choose your plan"}
          </h2>
          <p className="truncate text-xs text-muted-foreground">Pick the Frequency Home plan that fits your organisation.</p>
        </div>
        <button
          type="button"
          onClick={() => setCompareOpen(true)}
          className="shrink-0 rounded-full border border-border/60 bg-background/40 px-3 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--home-accent)]"
        >
          Compare plans
        </button>
      </div>

      {/* Side-by-side on tablet+, compact stacked on mobile. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {HOME_PLAN_LIST.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            interval={interval}
            isCurrent={saved.plan === plan.id && hasSubscription}
            isOpen={openPlanId === plan.id}
            onOpen={() => openPlanDetail(plan)}
          />
        ))}
      </div>

      <AnimatePresence>
        {openPlan && (
          <PlanDetailSheet
            key={openPlan.id}
            plan={openPlan}
            interval={interval}
            setInterval={setInterval}
            isCurrent={saved.plan === openPlan.id && saved.interval === interval && hasSubscription}
            hasSubscription={hasSubscription}
            currentPlan={savedPlan}
            pending={pending}
            error={error}
            onClose={() => setOpenPlanId(null)}
            onSubscribe={() => subscribe(openPlan)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {compareOpen && <CompareSheet onClose={() => setCompareOpen(false)} />}
      </AnimatePresence>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Current plan strip                                                  */
/* ------------------------------------------------------------------ */

function CurrentPlanStrip({
  hasSubscription,
  status,
  plan,
  interval,
  renews,
}: {
  hasSubscription: boolean
  status: string
  plan: HomePlan
  interval: BillingInterval
  renews: string | null
}) {
  if (!hasSubscription && status !== "canceled") {
    return (
      <div className="rounded-2xl border border-border/60 bg-background/40 px-4 py-3 backdrop-blur">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">No active subscription</p>
        <p className="mt-0.5 text-sm text-[var(--home-fg,inherit)]">Choose a plan to activate your Home.</p>
      </div>
    )
  }

  const pastDue = status === "past_due"
  const canceled = status === "canceled"

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border px-4 py-3.5 backdrop-blur",
        pastDue ? "border-destructive/40 bg-destructive/5" : "border-[var(--home-accent)]/30 bg-background/50",
      )}
    >
      {!pastDue && !canceled && (
        <div
          className="pointer-events-none absolute inset-x-0 -top-16 h-24 opacity-[0.18] blur-2xl"
          style={{ background: "radial-gradient(closest-side, var(--home-accent), transparent)" }}
          aria-hidden
        />
      )}
      <div className="relative flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {canceled ? "Active until" : pastDue ? "Payment failed" : "Current plan"}
          </p>
          <div className="mt-0.5 flex items-baseline gap-2">
            <span className="truncate text-lg font-semibold text-[var(--home-fg,inherit)]">Frequency Home {plan.name}</span>
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {intervalLabel[interval]}
            {renews ? ` · ${canceled ? "Active until" : "Renews"} ${renews}` : ""}
          </p>
        </div>
        <StatusPill status={status} />
      </div>
      {pastDue && (
        <button
          type="button"
          className="relative mt-2.5 rounded-lg bg-destructive px-3 py-1.5 text-xs font-semibold text-destructive-foreground"
        >
          Try again
        </button>
      )}
    </div>
  )
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    active: { label: "Active", cls: "bg-emerald-500/15 text-emerald-500" },
    trialing: { label: "Trial", cls: "bg-sky-500/15 text-sky-500" },
    past_due: { label: "Failed", cls: "bg-destructive/15 text-destructive" },
    canceled: { label: "Ending", cls: "bg-amber-500/15 text-amber-500" },
  }
  const s = map[status] ?? { label: status, cls: "bg-muted text-muted-foreground" }
  return <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold", s.cls)}>{s.label}</span>
}

/* ------------------------------------------------------------------ */
/* Plan card                                                           */
/* ------------------------------------------------------------------ */

function PlanCard({
  plan,
  interval,
  isCurrent,
  isOpen,
  onOpen,
}: {
  plan: HomePlan
  interval: BillingInterval
  isCurrent: boolean
  isOpen: boolean
  onOpen: () => void
}) {
  const price = priceFor(plan, interval)
  const perLabel = interval === "annual" ? "/ year" : "/ month"
  const recommended = plan.recommended

  return (
    <motion.button
      type="button"
      onClick={onOpen}
      whileTap={{ scale: 0.985 }}
      aria-label={`View Frequency Home ${plan.name} plan`}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-2xl border px-4 py-4 text-left backdrop-blur transition-all duration-300",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--home-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        recommended
          ? "border-[var(--home-accent)]/50 bg-background/60 shadow-[0_1px_0_0_var(--home-accent)]/10"
          : "border-border/60 bg-background/40 hover:border-border",
        (isOpen || isCurrent) && "border-[var(--home-accent)] shadow-lg shadow-[var(--home-accent)]/10",
        "hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/5",
      )}
    >
      {recommended && (
        <div
          className="pointer-events-none absolute inset-x-0 -top-20 h-28 opacity-[0.12] blur-2xl transition-opacity duration-300 group-hover:opacity-20"
          style={{ background: "radial-gradient(closest-side, var(--home-accent), transparent)" }}
          aria-hidden
        />
      )}

      <div className="relative flex items-center justify-between gap-2">
        <span className="truncate text-sm font-semibold text-[var(--home-fg,inherit)]">{plan.name}</span>
        {recommended && (
          <span className="flex shrink-0 items-center gap-1 rounded-full border border-[var(--home-accent)]/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--home-accent)]">
            <Sparkles className="h-2.5 w-2.5" aria-hidden />
            Recommended
          </span>
        )}
        {isCurrent && !recommended && (
          <span className="shrink-0 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-500">
            Current
          </span>
        )}
      </div>

      <div className="relative mt-2 flex items-baseline gap-1">
        <span className="text-2xl font-semibold tabular-nums text-[var(--home-fg,inherit)]">
          {formatMoney(price, plan.currency)}
        </span>
        <span className="text-xs text-muted-foreground">{perLabel}</span>
      </div>
      {interval === "annual" && (
        <span className="relative mt-0.5 text-[11px] text-[var(--home-accent)]">
          {formatMoney(monthlyEquivalent(plan), plan.currency)}/mo · save {annualSavingsPercent(plan)}%
        </span>
      )}

      <ul className="relative mt-3 space-y-1.5">
        {plan.features.slice(0, 4).map((f) => (
          <li key={f} className="flex items-center gap-2 text-xs text-muted-foreground">
            <Check className="h-3 w-3 shrink-0 text-[var(--home-accent)]" aria-hidden />
            <span className="truncate">{f}</span>
          </li>
        ))}
      </ul>

      <span className="relative mt-3 inline-flex items-center gap-0.5 text-xs font-medium text-[var(--home-accent)]">
        View plan
        <ChevronRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
      </span>
    </motion.button>
  )
}

/* ------------------------------------------------------------------ */
/* Plan detail sheet (modal on desktop, full-screen on mobile)         */
/* ------------------------------------------------------------------ */

function PlanDetailSheet({
  plan,
  interval,
  setInterval,
  isCurrent,
  hasSubscription,
  currentPlan,
  pending,
  error,
  onClose,
  onSubscribe,
}: {
  plan: HomePlan
  interval: BillingInterval
  setInterval: (i: BillingInterval) => void
  isCurrent: boolean
  hasSubscription: boolean
  currentPlan: HomePlan
  pending: boolean
  error: string | null
  onClose: () => void
  onSubscribe: () => void
}) {
  const reduce = useReducedMotion()
  const price = priceFor(plan, interval)
  const savings = annualSavings(plan)
  const isSwitch = hasSubscription && currentPlan.id !== plan.id

  return (
    <Overlay onClose={onClose}>
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={`Frequency Home ${plan.name} plan details`}
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.98 }}
        animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
        exit={reduce ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.98 }}
        transition={{ type: "spring", stiffness: 320, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "relative flex h-full w-full flex-col overflow-hidden bg-background/95 backdrop-blur-xl",
        )}
      >
        {/* Accent wash */}
        <div
          className="pointer-events-none absolute inset-x-0 -top-24 h-40 opacity-[0.16] blur-3xl"
          style={{ background: "radial-gradient(closest-side, var(--home-accent), transparent)" }}
          aria-hidden
        />

        {/* Header */}
        <div className="relative flex items-start justify-between gap-3 px-5 pt-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-pretty text-lg font-semibold text-[var(--home-fg,inherit)]">
                Frequency Home {plan.name}
              </h3>
              {plan.recommended && (
                <span className="flex shrink-0 items-center gap-1 rounded-full border border-[var(--home-accent)]/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--home-accent)]">
                  <Sparkles className="h-2.5 w-2.5" aria-hidden />
                  Recommended
                </span>
              )}
            </div>
            <p className="mt-0.5 text-pretty text-xs text-muted-foreground">{plan.positioning}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--home-accent)]"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="relative min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {/* Billing toggle */}
          <BillingToggle plan={plan} interval={interval} setInterval={setInterval} />

          {/* Grouped features */}
          <div className="mt-5 space-y-4">
            {plan.featureGroups.map((group) => (
              <div key={group.label}>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--home-accent)]">
                  {group.label}
                </p>
                <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5">
                  {group.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-xs text-[var(--home-fg,inherit)]">
                      <Check className="h-3 w-3 shrink-0 text-[var(--home-accent)]" aria-hidden />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Sticky summary + CTA */}
        <div className="relative border-t border-border/60 bg-background/80 px-5 py-4 backdrop-blur">
          {isSwitch && (
            <div className="mb-2.5 flex items-start gap-2 rounded-lg border border-border/60 bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
              <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden />
              <span>
                Switching {currentPlan.name} → {plan.name}. Billing changes apply from your next renewal.
              </span>
            </div>
          )}

          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-xs text-muted-foreground">
                {plan.name} · {intervalLabel[interval]}
              </p>
              <div className="flex items-baseline gap-1">
                <span className="text-xl font-semibold tabular-nums text-[var(--home-fg,inherit)]">
                  {formatMoney(price, plan.currency)}
                </span>
                <span className="text-xs text-muted-foreground">{interval === "annual" ? "/ year" : "/ month"}</span>
              </div>
              {interval === "annual" && savings > 0 && (
                <p className="text-[11px] text-[var(--home-accent)]">
                  You save {formatMoney(savings, plan.currency)} a year
                </p>
              )}
            </div>

            <motion.button
              type="button"
              whileTap={{ scale: 0.97 }}
              onClick={onSubscribe}
              disabled={pending || isCurrent}
              className={cn(
                "inline-flex shrink-0 items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white shadow-lg transition-all",
                "disabled:cursor-not-allowed disabled:opacity-60",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--home-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              )}
              style={{ backgroundColor: "var(--home-accent)" }}
            >
              {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              {isCurrent ? "Current plan" : pending ? "Subscribing…" : `Subscribe to ${plan.name}`}
            </motion.button>
          </div>

          {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
        </div>
      </motion.div>
    </Overlay>
  )
}

/* ------------------------------------------------------------------ */
/* Billing toggle — premium segmented control                          */
/* ------------------------------------------------------------------ */

function BillingToggle({
  plan,
  interval,
  setInterval,
}: {
  plan: HomePlan
  interval: BillingInterval
  setInterval: (i: BillingInterval) => void
}) {
  const pct = annualSavingsPercent(plan)
  const options: BillingInterval[] = ["monthly", "annual"]
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Billing</p>
      <div
        role="radiogroup"
        aria-label="Billing frequency"
        className="relative flex rounded-xl border border-border/60 bg-muted/40 p-1"
      >
        {options.map((opt) => {
          const active = interval === opt
          return (
            <button
              key={opt}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setInterval(opt)}
              className={cn(
                "relative flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--home-accent)]",
                active ? "text-white" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {active && (
                <motion.span
                  layoutId="billing-pill"
                  transition={{ type: "spring", stiffness: 400, damping: 32 }}
                  className="absolute inset-0 rounded-lg"
                  style={{ backgroundColor: "var(--home-accent)" }}
                  aria-hidden
                />
              )}
              <span className="relative flex items-center justify-center gap-1.5">
                {intervalLabel[opt]}
                {opt === "annual" && pct > 0 && (
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-[9px] font-bold",
                      active ? "bg-white/25 text-white" : "bg-[var(--home-accent)]/15 text-[var(--home-accent)]",
                    )}
                  >
                    -{pct}%
                  </span>
                )}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Compare sheet                                                       */
/* ------------------------------------------------------------------ */

function CompareSheet({ onClose }: { onClose: () => void }) {
  const reduce = useReducedMotion()
  return (
    <Overlay onClose={onClose}>
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Compare plans"
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.98 }}
        animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
        exit={reduce ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.98 }}
        transition={{ type: "spring", stiffness: 320, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
        className="relative flex h-full w-full flex-col overflow-hidden bg-background/95 backdrop-blur-xl"
      >
        <div className="flex items-center justify-between gap-3 px-5 pt-5">
          <h3 className="text-base font-semibold text-[var(--home-fg,inherit)]">Compare plans</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--home-accent)]"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 border-b border-border/60 pb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <span>Feature</span>
            <span className="w-10 text-center">Basic</span>
            <span className="w-10 text-center">Premium</span>
          </div>
          <ul>
            {HOME_PLAN_COMPARISON.map((row) => (
              <li
                key={row.label}
                className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 border-b border-border/40 py-2 text-xs text-[var(--home-fg,inherit)]"
              >
                <span className="text-pretty">{row.label}</span>
                <span className="flex w-10 justify-center">
                  {row.basic ? (
                    <Check className="h-3.5 w-3.5 text-[var(--home-accent)]" aria-label="Included in Basic" />
                  ) : (
                    <span className="text-muted-foreground" aria-label="Not in Basic">
                      —
                    </span>
                  )}
                </span>
                <span className="flex w-10 justify-center">
                  {row.premium ? (
                    <Check className="h-3.5 w-3.5 text-[var(--home-accent)]" aria-label="Included in Premium" />
                  ) : (
                    <span className="text-muted-foreground" aria-label="Not in Premium">
                      —
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </motion.div>
    </Overlay>
  )
}

/* ------------------------------------------------------------------ */
/* Shared overlay — dims + bottom-sheet on mobile, centred on desktop  */
/* ------------------------------------------------------------------ */

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={onClose}
      className="fixed inset-0 z-50 flex bg-black/50 backdrop-blur-sm"
    >
      {children}
    </motion.div>
  )
}
