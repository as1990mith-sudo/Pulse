"use client"

import { Check } from "lucide-react"
import { HOME_PLAN_LIST, formatHomePrice, type HomePlanId } from "@/lib/home/plans"

// Premium plan selection cards. Restrained emphasis on Premium Pro (the
// advanced plan). Shared by onboarding and the admin Subscription panel.
export function PlanCards({
  value,
  onChange,
  currentPlan,
}: {
  value: HomePlanId
  onChange: (id: HomePlanId) => void
  // When set, marks the plan the Home is currently on (admin context).
  currentPlan?: HomePlanId
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {HOME_PLAN_LIST.map((plan) => {
        const active = value === plan.id
        const isCurrent = currentPlan === plan.id
        return (
          <button
            key={plan.id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(plan.id)}
            className={[
              "group relative flex flex-col rounded-3xl border p-6 text-left transition-all duration-300 sm:p-7",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              active
                ? "border-primary bg-card shadow-elevated"
                : plan.featured
                  ? "border-primary/30 bg-card/70 shadow-soft hover:border-primary/50 hover:shadow-elevated"
                  : "border-border/60 bg-card/70 shadow-soft hover:border-border hover:shadow-elevated",
            ].join(" ")}
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-lg font-semibold tracking-tight">{plan.name}</h3>
              <div className="flex items-center gap-2">
                {plan.featured && !isCurrent && (
                  <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                    Advanced
                  </span>
                )}
                {isCurrent && (
                  <span className="rounded-full border border-border bg-secondary px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                    Current
                  </span>
                )}
              </div>
            </div>

            <div className="mt-4 flex items-baseline gap-1.5">
              <span className="text-4xl font-semibold tracking-tight">{formatHomePrice(plan)}</span>
              <span className="text-sm text-muted-foreground">/ month</span>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground text-pretty">{plan.positioning}</p>

            <ul className="mt-5 space-y-2.5 border-t border-border/60 pt-5">
              {plan.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2.5 text-sm">
                  <Check
                    className={["mt-0.5 size-4 shrink-0", plan.featured ? "text-primary" : "text-foreground/70"].join(
                      " ",
                    )}
                  />
                  <span className="leading-snug text-foreground/90">{feature}</span>
                </li>
              ))}
            </ul>

            <span
              className={[
                "mt-6 flex items-center justify-center rounded-full border px-4 py-2.5 text-sm font-semibold transition-colors",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-transparent text-foreground group-hover:bg-secondary",
              ].join(" ")}
            >
              {active ? (
                <span className="inline-flex items-center gap-1.5">
                  <Check className="size-4" /> Selected
                </span>
              ) : (
                `Choose ${plan.name}`
              )}
            </span>
          </button>
        )
      })}
    </div>
  )
}
