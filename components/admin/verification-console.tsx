"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import {
  BadgeCheck,
  Clock,
  ExternalLink,
  Globe,
  MapPin,
  ShieldCheck,
  ShieldX,
  Users,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import {
  approveVerification,
  rejectVerification,
  revokeVerification,
  type AdminVerificationRow,
} from "@/app/actions/admin-verification"

type Filter = "pending" | "verified" | "all"

const STATUS_META: Record<
  AdminVerificationRow["verificationStatus"],
  { label: string; className: string }
> = {
  pending: { label: "Pending review", className: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  approved: { label: "Verified", className: "bg-primary/15 text-primary" },
  rejected: { label: "Rejected", className: "bg-destructive/15 text-destructive" },
  none: { label: "Not requested", className: "bg-muted text-muted-foreground" },
}

export function VerificationConsole({ initialRows }: { initialRows: AdminVerificationRow[] }) {
  const [rows, setRows] = useState(initialRows)
  const [filter, setFilter] = useState<Filter>("pending")
  const [rejecting, setRejecting] = useState<string | null>(null)
  const [note, setNote] = useState("")
  const [isPending, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)

  const pendingCount = rows.filter((r) => r.verificationStatus === "pending").length

  const visible = rows.filter((r) => {
    if (filter === "pending") return r.verificationStatus === "pending"
    if (filter === "verified") return r.verified
    return true
  })

  function patch(id: string, changes: Partial<AdminVerificationRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...changes } : r)))
  }

  function approve(id: string) {
    setBusyId(id)
    startTransition(async () => {
      try {
        await approveVerification(id)
        patch(id, { verified: true, verificationStatus: "approved", verificationNote: null })
      } finally {
        setBusyId(null)
      }
    })
  }

  function submitReject(id: string) {
    setBusyId(id)
    startTransition(async () => {
      try {
        await rejectVerification(id, note)
        patch(id, { verified: false, verificationStatus: "rejected", verificationNote: note.trim() || null })
        setRejecting(null)
        setNote("")
      } finally {
        setBusyId(null)
      }
    })
  }

  function revoke(id: string) {
    setBusyId(id)
    startTransition(async () => {
      try {
        await revokeVerification(id)
        patch(id, { verified: false, verificationStatus: "none", verificationNote: null })
      } finally {
        setBusyId(null)
      }
    })
  }

  const filters: { id: Filter; label: string; count?: number }[] = [
    { id: "pending", label: "Pending", count: pendingCount },
    { id: "verified", label: "Verified" },
    { id: "all", label: "All" },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <ShieldCheck className="size-6 text-primary" />
            Organisation verification
          </h1>
          <p className="text-sm text-muted-foreground">
            Review ministry applications, approve verified badges, and manage organisation trust.
          </p>
        </div>
        {pendingCount > 0 && (
          <Badge className="gap-1.5 rounded-full bg-amber-500/15 px-3 py-1 text-amber-600 dark:text-amber-400">
            <Clock className="size-3.5" />
            {pendingCount} awaiting review
          </Badge>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-1 rounded-full border border-border/60 bg-card/40 p-1">
        {filters.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
              filter === f.id ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {f.label}
            {typeof f.count === "number" && f.count > 0 && (
              <span
                className={cn(
                  "rounded-full px-1.5 text-xs tabular-nums",
                  filter === f.id ? "bg-background/20" : "bg-muted",
                )}
              >
                {f.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* List */}
      {visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/60 bg-card/30 p-12 text-center">
          <ShieldCheck className="mx-auto mb-3 size-8 text-muted-foreground/60" />
          <p className="text-sm text-muted-foreground">
            {filter === "pending" ? "No verification requests awaiting review." : "No organisations to show."}
          </p>
        </div>
      ) : (
        <ul className="grid gap-3">
          {visible.map((org) => {
            const status = STATUS_META[org.verificationStatus]
            const busy = busyId === org.id && isPending
            return (
              <li
                key={org.id}
                className="rounded-2xl border border-border/70 bg-card/60 p-5 shadow-sm backdrop-blur-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/org/${org.handle}`}
                        className="truncate text-base font-semibold hover:underline"
                      >
                        {org.name}
                      </Link>
                      {org.verified && <BadgeCheck className="size-4 shrink-0 text-primary" />}
                      <Badge className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs", status.className)}>
                        {status.label}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      @{org.handle} · {org.category}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        {org.onlineOnly ? <Globe className="size-3.5" /> : <MapPin className="size-3.5" />}
                        {org.reach}
                        {org.location ? ` · ${org.location}` : ""}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Users className="size-3.5" />
                        {org.subscriberCount} subscriber{org.subscriberCount === 1 ? "" : "s"}
                      </span>
                      {org.website && (
                        <a
                          href={org.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-primary hover:underline"
                        >
                          <ExternalLink className="size-3.5" />
                          Website
                        </a>
                      )}
                    </div>
                  </div>
                </div>

                {org.description && (
                  <p className="mt-3 line-clamp-2 text-pretty text-sm text-muted-foreground">{org.description}</p>
                )}

                <p className="mt-2 text-xs text-muted-foreground/80">
                  Owner: <span className="text-foreground/80">{org.ownerName}</span> · {org.ownerEmail}
                </p>

                {org.verificationStatus === "rejected" && org.verificationNote && (
                  <p className="mt-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    Rejection note: {org.verificationNote}
                  </p>
                )}

                {/* Reject note editor */}
                {rejecting === org.id ? (
                  <div className="mt-4 space-y-2">
                    <Textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Optional note to the organisation (e.g. what's needed to get verified)…"
                      rows={2}
                      className="resize-none text-sm"
                    />
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={busy}
                        onClick={() => submitReject(org.id)}
                      >
                        Confirm rejection
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => {
                          setRejecting(null)
                          setNote("")
                        }}
                      >
                        <X className="size-4" /> Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {!org.verified && (
                      <Button size="sm" disabled={busy} onClick={() => approve(org.id)} className="gap-1.5">
                        <ShieldCheck className="size-4" />
                        {org.verificationStatus === "rejected" ? "Approve anyway" : "Approve"}
                      </Button>
                    )}
                    {org.verified && (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy}
                        onClick={() => revoke(org.id)}
                        className="gap-1.5"
                      >
                        <ShieldX className="size-4" />
                        Revoke badge
                      </Button>
                    )}
                    {org.verificationStatus !== "rejected" && !org.verified && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => {
                          setRejecting(org.id)
                          setNote("")
                        }}
                        className="gap-1.5 text-destructive hover:text-destructive"
                      >
                        <ShieldX className="size-4" />
                        Reject
                      </Button>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
