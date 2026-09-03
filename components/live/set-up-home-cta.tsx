"use client"

// Member-facing invitation shown at the bottom of the Live tab: people who
// aren't yet hosting their own community are gently nudged to create a Home.
// A "+" opens a small chooser so they can pick Premium or Premium Pro up front,
// then land in the existing onboarding flow pre-seeded with that plan.

import { useState } from "react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { Plus, Check, ArrowRight } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { HOME_PLAN_LIST, formatHomePrice } from "@/lib/home/plans"
import { cn } from "@/lib/utils"

export function SetUpHomeCta() {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  return (
    <section className="px-5 pb-2 pt-10">
      <div className="relative overflow-hidden rounded-3xl border border-border/60 bg-card">
        {/* Illustration band — the signature visual. */}
        <div className="relative aspect-[16/10] w-full sm:aspect-[2/1]">
          <Image
            src="/images/set-up-home-illustration.png"
            alt="A glowing home radiating live broadcast signals to a gathered community"
            fill
            sizes="(max-width: 640px) 100vw, 640px"
            className="object-cover"
            priority={false}
          />
          {/* Bottom scrim so the copy stays legible over any illustration edge. */}
          <div className="absolute inset-0 bg-gradient-to-t from-card via-card/60 to-transparent" />
        </div>

        {/* Copy + action, pulled up slightly over the scrim. */}
        <div className="relative -mt-10 px-6 pb-7 sm:-mt-14 sm:px-8">
          <h2 className="text-balance font-display text-2xl font-bold leading-tight tracking-tight sm:text-3xl">
            Set up your own Home
          </h2>
          <p className="mt-2 max-w-md text-pretty text-sm leading-relaxed text-muted-foreground">
            Manage your community and go live. Bring your members together in a private, branded space that&apos;s
            entirely yours.
          </p>

          <button
            type="button"
            onClick={() => setOpen(true)}
            className="group mt-5 inline-flex items-center gap-2.5 rounded-full bg-primary py-2.5 pl-2.5 pr-5 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:shadow-primary/30 active:scale-[0.98]"
          >
            <span className="flex size-7 items-center justify-center rounded-full bg-primary-foreground/15">
              <Plus className="size-4" />
            </span>
            Set up a Home
          </button>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md gap-0 overflow-hidden p-0">
          <DialogHeader className="space-y-1.5 px-6 pt-6">
            <DialogTitle className="font-display text-xl font-bold tracking-tight">Choose your plan</DialogTitle>
            <DialogDescription className="text-sm leading-relaxed">
              Pick the Home that fits your community. You can change this later.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3 p-6">
            {HOME_PLAN_LIST.map((plan) => (
              <button
                key={plan.id}
                type="button"
                onClick={() => router.push(`/sign-up/home?plan=${plan.id}`)}
                className={cn(
                  "group relative w-full rounded-2xl border p-4 text-left transition-all hover:border-primary/60 active:scale-[0.99]",
                  plan.featured ? "border-primary/50 bg-primary/5" : "border-border bg-background",
                )}
              >
                {plan.featured ? (
                  <span className="absolute right-4 top-4 rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary-foreground">
                    Popular
                  </span>
                ) : null}
                <div className="flex items-baseline gap-2">
                  <span className="font-display text-lg font-bold">{plan.name}</span>
                  <span className="text-sm text-muted-foreground">
                    {formatHomePrice(plan)}
                    <span className="text-xs">/mo</span>
                  </span>
                </div>
                <p className="mt-1 text-pretty text-xs leading-relaxed text-muted-foreground">{plan.tagline}</p>
                <ul className="mt-3 space-y-1.5">
                  {plan.features.slice(0, 3).map((f) => (
                    <li key={f} className="flex items-start gap-2 text-xs text-foreground/80">
                      <Check className="mt-0.5 size-3.5 shrink-0 text-primary" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <span className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-primary">
                  Continue with {plan.name}
                  <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                </span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </section>
  )
}
