"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { BadgeCheck, Clock, ShieldCheck } from "lucide-react"
import { requestVerification } from "@/app/actions/organizations"
import type { OrgVerificationStatus } from "@/lib/org-types"

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
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">
        <BadgeCheck className="size-4" /> Verified ministry
      </span>
    )
  }

  if (local === "pending") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 px-3 py-1.5 text-xs font-medium text-muted-foreground">
        <Clock className="size-4" /> Verification under review
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
      className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/5 px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/10 disabled:opacity-60"
    >
      <ShieldCheck className="size-4" />
      {pending ? "Requesting..." : "Request verification"}
    </button>
  )
}
