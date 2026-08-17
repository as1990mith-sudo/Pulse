"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Clock, ShieldCheck } from "lucide-react"
import { requestVerification } from "@/app/actions/organizations"
import type { OrgVerificationStatus } from "@/lib/org-types"
import { VerifiedBadge } from "@/components/org/verified-badge"

/**
 * Owner-only verification control. Reflects the current review status and lets
 * the owner request official verification when none is pending/approved.
 */
export function OrgVerifyButton({
  organizationId,
  status,
  verified,
}: {
  organizationId: string
  status: OrgVerificationStatus
  verified: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [local, setLocal] = useState<OrgVerificationStatus>(status)

  if (verified || local === "approved") {
    // Verified: show the badge alone, no label.
    return <VerifiedBadge size="lg" />
  }

  if (local === "pending") {
    return (
      <span className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-full border border-border/60 px-3 text-xs font-medium text-muted-foreground">
        <Clock className="size-4 shrink-0" /> Under review
      </span>
    )
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          try {
            await requestVerification(organizationId)
            setLocal("pending")
            router.refresh()
          } catch {
            /* no-op; button stays actionable */
          }
        })
      }
      className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-full border border-primary/40 bg-primary/5 px-4 text-sm font-semibold text-primary transition-colors hover:bg-primary/10 active:scale-[0.98] disabled:opacity-60"
    >
      <ShieldCheck className="size-4 shrink-0" />
      {pending ? "Requesting..." : "Get verified"}
    </button>
  )
}
