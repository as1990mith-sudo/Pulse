"use client"

import { Check } from "lucide-react"

export type OnboardingStep = { id: string; label: string }

// Refined progress indicator for the Home onboarding. Full stepped rail on
// larger screens; a compact "Step x of n" summary with a progress bar on mobile.
export function StepIndicator({ steps, current }: { steps: OnboardingStep[]; current: number }) {
  const pct = Math.round(((current + 1) / steps.length) * 100)
  return (
    <div>
      {/* Mobile */}
      <div className="sm:hidden">
        <div className="flex items-baseline justify-between">
          <p className="text-sm font-medium">{steps[current]?.label}</p>
          <p className="text-xs text-muted-foreground">
            Step {current + 1} of {steps.length}
          </p>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Desktop */}
      <ol className="hidden items-center sm:flex">
        {steps.map((step, i) => {
          const done = i < current
          const active = i === current
          return (
            <li key={step.id} className="flex flex-1 items-center last:flex-none">
              <div className="flex items-center gap-3">
                <span
                  className={[
                    "flex size-9 shrink-0 items-center justify-center rounded-full border text-sm font-semibold transition-all duration-300",
                    done
                      ? "border-primary bg-primary text-primary-foreground"
                      : active
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-card text-muted-foreground",
                  ].join(" ")}
                >
                  {done ? <Check className="size-4" /> : i + 1}
                </span>
                <span
                  className={[
                    "text-sm font-medium transition-colors",
                    active ? "text-foreground" : done ? "text-foreground/70" : "text-muted-foreground",
                  ].join(" ")}
                >
                  {step.label}
                </span>
              </div>
              {i < steps.length - 1 && (
                <span
                  className={[
                    "mx-4 h-px flex-1 transition-colors duration-300",
                    done ? "bg-primary/60" : "bg-border",
                  ].join(" ")}
                />
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
