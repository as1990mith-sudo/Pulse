"use client"

import { useState, useTransition } from "react"
import { PlanCards } from "@/components/home/plan-cards"
import { changePlan } from "@/app/actions/home"
import type { HomePlanId } from "@/lib/home/plans"

export function SubscriptionManager({ handle, currentPlan }: { handle: string; currentPlan: HomePlanId }) {
  const [plan, setPlan] = useState<HomePlanId>(currentPlan)
  const [saved, setSaved] = useState<HomePlanId>(currentPlan)
  const [pending, startTransition] = useTransition()

  function save() {
    if (plan === saved) return
    startTransition(async () => {
      await changePlan(handle, plan)
      setSaved(plan)
    })
  }

  return (
    <div className="space-y-6">
      <PlanCards value={plan} onChange={setPlan} currentPlan={saved} />
      <div className="flex items-center justify-end gap-3">
        {plan !== saved && <span className="text-sm text-muted-foreground">Unsaved plan change</span>}
        <button
          type="button"
          onClick={save}
          disabled={pending || plan === saved}
          className="rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ backgroundColor: "var(--home-accent)" }}
        >
          {pending ? "Saving…" : plan === saved ? "Current plan" : "Update plan"}
        </button>
      </div>
    </div>
  )
}
