"use client"

import { useState, useTransition } from "react"
import { AtSign, Check, Globe, Lock, Users } from "lucide-react"
import { toast } from "sonner"
import { updateMentionPrivacy } from "@/app/actions/mentions"
import type { MentionPrivacy } from "@/lib/mentions-server"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

const OPTIONS: {
  value: MentionPrivacy
  label: string
  description: string
  icon: typeof Globe
}[] = [
  {
    value: "everyone",
    label: "Everyone",
    description: "Anyone on Frequency can tag you in posts and articles.",
    icon: Globe,
  },
  {
    value: "followers",
    label: "People who follow you",
    description: "Only members who follow you can mention you. Others' tags show as plain text.",
    icon: Users,
  },
  {
    value: "none",
    label: "No one",
    description: "Nobody can mention you. Any attempt appears as plain, unlinked text.",
    icon: Lock,
  },
]

export function MentionPrivacyControl({ initialValue }: { initialValue: MentionPrivacy }) {
  const [value, setValue] = useState<MentionPrivacy>(initialValue)
  const [isPending, startTransition] = useTransition()

  function choose(next: MentionPrivacy) {
    if (next === value || isPending) return
    const previous = value
    setValue(next) // optimistic
    startTransition(async () => {
      const res = await updateMentionPrivacy(next)
      if (!res.ok) {
        setValue(previous)
        toast.error(res.error)
        return
      }
      toast.success("Mention setting updated")
    })
  }

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center gap-2">
        <span className="flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <AtSign className="size-5" />
        </span>
        <div>
          <h2 className="font-semibold leading-tight">Who can @mention you</h2>
          <p className="text-sm text-muted-foreground">Controls tagging across posts and articles.</p>
        </div>
      </div>

      <fieldset className="flex flex-col gap-2" disabled={isPending}>
        <legend className="sr-only">Who can mention you</legend>
        {OPTIONS.map((opt) => {
          const Icon = opt.icon
          const selected = value === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => choose(opt.value)}
              className={cn(
                "flex items-start gap-3 rounded-xl border p-3.5 text-left transition-colors",
                selected
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/40 hover:bg-muted/50",
                isPending && "opacity-70",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full",
                  selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                )}
              >
                <Icon className="size-4" />
              </span>
              <span className="flex-1">
                <span className="flex items-center gap-2 font-medium">
                  {opt.label}
                  {selected && <Check className="size-4 text-primary" aria-hidden />}
                </span>
                <span className="mt-0.5 block text-pretty text-sm leading-relaxed text-muted-foreground">
                  {opt.description}
                </span>
              </span>
            </button>
          )
        })}
      </fieldset>
    </Card>
  )
}
