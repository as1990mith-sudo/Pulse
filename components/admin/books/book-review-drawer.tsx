"use client"

import { useEffect, useState, useTransition } from "react"
import Image from "next/image"
import {
  CheckCircle2,
  XCircle,
  RefreshCw,
  FileText,
  ExternalLink,
  Download,
  Clock,
} from "lucide-react"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { StatusBadge } from "@/components/admin/kit"
import { approveBook, rejectBook, requestBookChanges } from "@/app/actions/admin-books"
import type { BookSubmissionRow, SubmissionStatus } from "@/lib/admin/books"
import { toast } from "sonner"

const STATUS_TONE: Record<SubmissionStatus, "warning" | "info" | "success" | "danger"> = {
  pending: "warning",
  changes_requested: "info",
  approved: "success",
  rejected: "danger",
}

const STATUS_LABEL: Record<SubmissionStatus, string> = {
  pending: "Pending review",
  changes_requested: "Changes requested",
  approved: "Approved",
  rejected: "Rejected",
}

type Mode = "approve" | "reject" | "changes" | null

export function BookReviewDrawer({
  submission,
  canApprove,
  onClose,
  onReviewed,
}: {
  submission: BookSubmissionRow | null
  canApprove: boolean
  onClose: () => void
  onReviewed: () => void
}) {
  const [mode, setMode] = useState<Mode>(null)
  const [note, setNote] = useState("")
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    setMode(null)
    setNote("")
  }, [submission?.id])

  const open = submission !== null
  const isPdf = submission?.fileUrl?.toLowerCase().endsWith(".pdf") ?? false
  const decided = submission?.status === "approved" || submission?.status === "rejected"

  function submit() {
    if (!submission) return
    const trimmed = note.trim()
    // Validate before entering the transition so we never return a value from it.
    if ((mode === "reject" || mode === "changes") && !trimmed) {
      toast.error(mode === "reject" ? "Please provide feedback" : "Please describe the changes needed")
      return
    }
    const id = submission.id
    startTransition(async () => {
      try {
        if (mode === "approve") {
          await approveBook(id, trimmed || undefined)
          toast.success("Book approved and published")
        } else if (mode === "reject") {
          await rejectBook(id, trimmed)
          toast.success("Book rejected")
        } else if (mode === "changes") {
          await requestBookChanges(id, trimmed)
          toast.success("Changes requested")
        }
        onReviewed()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Action failed")
      }
    })
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-2xl">
        {submission && (
          <>
            <SheetHeader className="border-b border-border p-4">
              <div className="flex items-center gap-2">
                <SheetTitle className="truncate">{submission.title}</SheetTitle>
                <StatusBadge tone={STATUS_TONE[submission.status]}>
                  {STATUS_LABEL[submission.status]}
                </StatusBadge>
              </div>
              <SheetDescription>
                by {submission.author}
                {submission.submissionCount > 1 ? ` · Resubmission #${submission.submissionCount}` : ""}
              </SheetDescription>
            </SheetHeader>

            <div className="flex-1 overflow-y-auto p-4">
              {/* Meta */}
              <div className="flex gap-4">
                <div className="relative h-40 w-28 shrink-0 overflow-hidden rounded-lg bg-muted">
                  {submission.cover ? (
                    <Image src={submission.cover || "/placeholder.svg"} alt="" fill sizes="112px" className="object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-muted-foreground">
                      <FileText className="h-8 w-8" />
                    </div>
                  )}
                </div>
                <dl className="grid flex-1 grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <div>
                    <dt className="text-xs text-muted-foreground">Category</dt>
                    <dd className="text-foreground">{submission.category || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Language</dt>
                    <dd className="text-foreground">{submission.language || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Pages</dt>
                    <dd className="text-foreground">{submission.pages ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Price</dt>
                    <dd className="text-foreground">
                      {submission.priceCents === 0 ? "Free" : `$${(submission.priceCents / 100).toFixed(2)}`}
                    </dd>
                  </div>
                  <div className="col-span-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    Submitted {new Date(submission.createdAt).toLocaleString()}
                  </div>
                </dl>
              </div>

              {submission.subtitle && (
                <p className="mt-4 text-sm text-muted-foreground">{submission.subtitle}</p>
              )}

              {/* Prior feedback */}
              {submission.feedback && (
                <div className="mt-4 rounded-lg border border-border bg-muted/40 p-3">
                  <p className="text-xs font-medium text-foreground">Reviewer feedback</p>
                  <p className="mt-1 text-sm text-muted-foreground">{submission.feedback}</p>
                </div>
              )}

              {/* Manuscript preview */}
              <div className="mt-4">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-medium text-foreground">Manuscript</p>
                  {submission.fileUrl && (
                    <div className="flex items-center gap-2">
                      <a
                        href={submission.fileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                      >
                        <ExternalLink className="h-3.5 w-3.5" /> Open
                      </a>
                      <a
                        href={submission.fileUrl}
                        download={submission.fileName ?? undefined}
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                      >
                        <Download className="h-3.5 w-3.5" /> Download
                      </a>
                    </div>
                  )}
                </div>
                {submission.fileUrl ? (
                  isPdf ? (
                    <object
                      data={`${submission.fileUrl}#toolbar=0&navpanes=0`}
                      type="application/pdf"
                      className="h-[420px] w-full rounded-lg border border-border bg-muted"
                    >
                      <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                        <FileText className="h-8 w-8" />
                        <span>Preview unavailable.</span>
                        <a href={submission.fileUrl} target="_blank" rel="noreferrer" className="text-primary underline">
                          Open the file
                        </a>
                      </div>
                    </object>
                  ) : (
                    <div className="flex h-32 flex-col items-center justify-center gap-2 rounded-lg border border-border bg-muted text-sm text-muted-foreground">
                      <FileText className="h-8 w-8" />
                      <span>{submission.fileName ?? "Book file"} — download to review</span>
                    </div>
                  )
                ) : (
                  <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
                    No file was attached to this submission.
                  </div>
                )}
              </div>
            </div>

            {/* Action footer */}
            {canApprove && !decided && (
              <div className="border-t border-border p-4">
                {mode === null ? (
                  <div className="flex flex-wrap gap-2">
                    <Button className="flex-1" onClick={() => setMode("approve")}>
                      <CheckCircle2 className="mr-1.5 h-4 w-4" />
                      Approve & publish
                    </Button>
                    <Button variant="outline" className="flex-1" onClick={() => setMode("changes")}>
                      <RefreshCw className="mr-1.5 h-4 w-4" />
                      Request changes
                    </Button>
                    <Button variant="destructive" className="flex-1" onClick={() => setMode("reject")}>
                      <XCircle className="mr-1.5 h-4 w-4" />
                      Reject
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="review-note">
                        {mode === "approve"
                          ? "Note to author (optional)"
                          : mode === "reject"
                            ? "Reason for rejection"
                            : "What needs to change?"}
                      </Label>
                      <textarea
                        id="review-note"
                        rows={3}
                        autoFocus
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder={
                          mode === "approve"
                            ? "Optional message shown to the author…"
                            : "Explain your decision so the author can respond…"
                        }
                        className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" onClick={() => setMode(null)} disabled={pending}>
                        Back
                      </Button>
                      <Button
                        variant={mode === "reject" ? "destructive" : "default"}
                        onClick={submit}
                        disabled={pending || (mode !== "approve" && !note.trim())}
                      >
                        {pending
                          ? "Working…"
                          : mode === "approve"
                            ? "Approve & publish"
                            : mode === "reject"
                              ? "Reject book"
                              : "Send request"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
