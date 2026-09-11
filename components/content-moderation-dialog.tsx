"use client"

import { useState, useTransition } from "react"
import { Ban, Loader2, Trash2, UserMinus } from "lucide-react"
import { toast } from "sonner"
import { SUSPENSION_DURATIONS, type SuspensionDurationId } from "@/lib/home/moderation"
import {
  moderateRemoveAuthor,
  moderateRemoveContent,
  moderateSuspendAuthor,
  type ModerationTargetType,
} from "@/app/actions/home-reports"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * The three admin moderation flows reachable from a post or comment ⋮ menu:
 * delete the content, suspend its author for a while, or remove the author from
 * the Home. `null` means the dialog is closed.
 */
export type ModerationMode = "delete" | "suspend" | "remove" | null

/**
 * Shared confirm/duration surface for direct content moderation. Both the feed
 * post menu and the comment menu drive it with their own `mode` state so the
 * suspend-duration picker and destructive-confirm copy live in exactly one
 * place. Every action calls a server action that re-checks `reports.manage` and
 * resolves the Home from the content id, so this component holds no authority
 * of its own — it only collects intent.
 */
export function ContentModerationDialog({
  mode,
  onClose,
  targetType,
  targetId,
  subjectLabel,
  onContentRemoved,
}: {
  mode: ModerationMode
  onClose: () => void
  targetType: ModerationTargetType
  targetId: string
  subjectLabel: string
  /** Called after a successful delete so the surface can hide the row. */
  onContentRemoved?: () => void
}) {
  const [duration, setDuration] = useState<SuspensionDurationId>("24h")
  const [pending, startTransition] = useTransition()

  if (!mode) return null

  const noun = targetType === "post" || targetType === "community_post" ? "post" : "comment"

  const run = (fn: () => Promise<unknown>, successMsg: string, after?: () => void) => {
    startTransition(async () => {
      try {
        await fn()
        toast.success(successMsg)
        after?.()
        onClose()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Something went wrong.")
      }
    })
  }

  return (
    <div
      className="fixed inset-0 z-[130] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-3xl border border-white/10 bg-card p-5 shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        {mode === "delete" && (
          <>
            <div className="mb-1 flex items-center gap-2 text-destructive">
              <Trash2 className="size-5" />
              <h2 className="text-lg font-semibold text-foreground">{`Delete this ${noun}?`}</h2>
            </div>
            <p className="mb-5 text-sm leading-relaxed text-muted-foreground">
              {`This removes ${subjectLabel}'s ${noun} for everyone in this Home. This can't be undone.`}
            </p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={pending}
                onClick={() =>
                  run(() => moderateRemoveContent(targetType, targetId), `${noun[0].toUpperCase()}${noun.slice(1)} deleted`, onContentRemoved)
                }
              >
                {pending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                {`Delete ${noun}`}
              </Button>
            </div>
          </>
        )}

        {mode === "suspend" && (
          <>
            <div className="mb-1 flex items-center gap-2 text-destructive">
              <Ban className="size-5" />
              <h2 className="text-lg font-semibold text-foreground">{`Suspend ${subjectLabel}`}</h2>
            </div>
            <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
              They stay a member but can&apos;t post or comment in this Home until the suspension ends.
            </p>
            <div className="mb-5 grid grid-cols-2 gap-2">
              {SUSPENSION_DURATIONS.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setDuration(d.id)}
                  className={cn(
                    "rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors",
                    duration === d.id
                      ? "border-destructive bg-destructive/10 text-foreground"
                      : "border-white/10 bg-secondary/40 text-muted-foreground hover:text-foreground",
                  )}
                >
                  {d.label}
                </button>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={pending}
                onClick={() =>
                  run(
                    () => moderateSuspendAuthor(targetType, targetId, duration),
                    `${subjectLabel} suspended`,
                  )
                }
              >
                {pending ? <Loader2 className="size-4 animate-spin" /> : <Ban className="size-4" />}
                Suspend
              </Button>
            </div>
          </>
        )}

        {mode === "remove" && (
          <>
            <div className="mb-1 flex items-center gap-2 text-destructive">
              <UserMinus className="size-5" />
              <h2 className="text-lg font-semibold text-foreground">{`Remove ${subjectLabel}?`}</h2>
            </div>
            <p className="mb-5 text-sm leading-relaxed text-muted-foreground">
              {`This removes ${subjectLabel} from this Home. Their account and content elsewhere are untouched, and they can rejoin later.`}
            </p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={pending}
                onClick={() =>
                  run(() => moderateRemoveAuthor(targetType, targetId), `${subjectLabel} removed from this Home`)
                }
              >
                {pending ? <Loader2 className="size-4 animate-spin" /> : <UserMinus className="size-4" />}
                Remove
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
