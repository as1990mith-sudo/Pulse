"use client"

import { useEffect, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"

type ActionKind = "dismiss" | "hide" | "remove" | "warn"

const COPY: Record<ActionKind, { title: string; description: string; cta: string; destructive: boolean; placeholder: string }> = {
  dismiss: {
    title: "Dismiss report",
    description: "No action will be taken against the content. This is recorded in the moderation history.",
    cta: "Dismiss report",
    destructive: false,
    placeholder: "Why is this report being dismissed? (e.g. not a violation)",
  },
  warn: {
    title: "Warn the author",
    description: "The author will be notified with your message. The content stays visible.",
    cta: "Send warning",
    destructive: false,
    placeholder: "Warning message shown to the author…",
  },
  hide: {
    title: "Hide content",
    description: "The content will be hidden from the public but not deleted. It can be restored later.",
    cta: "Hide content",
    destructive: false,
    placeholder: "Reason for hiding this content…",
  },
  remove: {
    title: "Remove content",
    description: "The content will be removed from public view and the author notified. This can be restored.",
    cta: "Remove content",
    destructive: true,
    placeholder: "Reason for removal (shown in moderation history)…",
  },
}

export function ModerationDialog({
  action,
  onClose,
  onConfirm,
}: {
  action: ActionKind | null
  onClose: () => void
  onConfirm: (reason: string) => Promise<void>
}) {
  const [reason, setReason] = useState("")
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (action) setReason("")
  }, [action])

  const copy = action ? COPY[action] : null

  async function submit() {
    if (!reason.trim()) return
    setSubmitting(true)
    try {
      await onConfirm(reason.trim())
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={action !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        {copy && (
          <>
            <DialogHeader>
              <DialogTitle>{copy.title}</DialogTitle>
              <DialogDescription>{copy.description}</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-2">
              <Label htmlFor="mod-reason">Reason</Label>
              <textarea
                id="mod-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={4}
                autoFocus
                placeholder={copy.placeholder}
                className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onClose} disabled={submitting}>
                Cancel
              </Button>
              <Button
                variant={copy.destructive ? "destructive" : "default"}
                onClick={submit}
                disabled={submitting || !reason.trim()}
              >
                {submitting ? "Working…" : copy.cta}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
