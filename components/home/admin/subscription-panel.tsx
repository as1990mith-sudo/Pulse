"use client"

import { useState, useTransition } from "react"
import { Check, Loader2 } from "lucide-react"
import { PlanCards } from "@/components/home/plan-cards"
import { changePlan } from "@/app/actions/home"
import { getHomePlan, type HomePlanId } from "@/lib/home/plans"

export function SubscriptionPanel({
  handle,
  currentPlan,
}: {
  handle: string
  currentPlan: HomePlanId
}) {
  const [selected, setSelected] = useState<HomePlanId>(currentPlan)
  const [savedPlan, setSavedPlan] = useState<HomePlanId>(currentPlan)
  const [pending, startTransition] = useTransition()
  const [justSaved, setJustSaved] = useState(false)

  const dirty = selected !== savedPlan

  function save() {
    startTransition(async () => {
      const res = await changePlan(handle, selected)
      setSavedPlan(res.plan)
      setJustSaved(true)
      setTimeout(() => setJustSaved(false), 2000)
    })
  }

  const plan = getHomePlan(savedPlan)

  return (
    <div className="space-y-6">
      {/* Current plan summary */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Your plan</span>
        <p className="mt-1 text-xl font-semibold">{plan.name}</p>
        <p className="text-sm text-muted-foreground">{plan.tagline}</p>
      </div>

      <PlanCards value={selected} onChange={setSelected} currentPlan={savedPlan} />

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={!dirty || pending}
          className="inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          style={{ backgroundColor: "var(--home-accent)" }}
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : justSaved ? <Check className="size-4" /> : null}
          {justSaved ? "Plan updated" : dirty ? "Update plan" : "Current plan"}
        </button>
        {dirty && (
          <button
            type="button"
            onClick={() => setSelected(savedPlan)}
            className="text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Prices are placeholders during the current phase. Changing your plan takes effect immediately; no payment is
        collected yet.
      </p>
    </div>
  )
}
