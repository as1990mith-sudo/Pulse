"use client"

import { useState } from "react"
import { AlertTriangle, Film } from "lucide-react"

/**
 * Post-end "save decision" shown to the host AFTER a live session has already
 * ended for everyone. This is deliberately separate from the existing
 * "End live session / Keep streaming" confirmation — by the time this appears
 * the room is already torn down for all participants, so nothing here blocks or
 * delays the live-room termination.
 *
 * Flow:
 *   "Save this live session as an episode?"  → Yes, Save Episode | No
 *     └─ No → "Are you sure you don't want to save this live session?"
 *              → Go Back (return to the decision) | Don't Save
 *
 * The overlay intentionally cannot be dismissed by clicking the backdrop: the
 * host must make an explicit choice.
 */
export function SaveEpisodePrompt({
  onSave,
  onDiscard,
}: {
  /** Host chose to save — kick off the (async) episode save/processing. */
  onSave: () => void
  /** Host confirmed they don't want to save — discard the recording. */
  onDiscard: () => void
}) {
  const [confirmingDiscard, setConfirmingDiscard] = useState(false)

  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" aria-hidden="true" />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="save-episode-title"
        className="relative z-10 w-full max-w-xs rounded-3xl border border-white/10 bg-zinc-900/95 p-6 text-center shadow-2xl backdrop-blur-xl"
      >
        {!confirmingDiscard ? (
          <>
            <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Film className="size-6" />
            </div>
            <h2 id="save-episode-title" className="text-lg font-semibold text-white text-balance">
              Save this live session as an episode?
            </h2>
            <p className="mt-1.5 text-sm text-white/60 text-pretty">
              Your live has ended. You can add the recording to your catalogue, or skip saving it.
            </p>
            <div className="mt-5 flex flex-col gap-2">
              <button
                type="button"
                onClick={onSave}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 active:scale-[0.99]"
              >
                Yes, Save Episode
              </button>
              <button
                type="button"
                onClick={() => setConfirmingDiscard(true)}
                className="w-full rounded-2xl bg-white/10 px-5 py-3 text-sm font-semibold text-white ring-1 ring-inset ring-white/15 transition-colors hover:bg-white/20"
              >
                No
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-destructive/15 text-destructive">
              <AlertTriangle className="size-6" />
            </div>
            <h2 id="save-episode-title" className="text-lg font-semibold text-white text-balance">
              Are you sure you don&apos;t want to save this live session?
            </h2>
            <p className="mt-1.5 text-sm text-white/60 text-pretty">
              The recording won&apos;t be added to your catalogue and can&apos;t be recovered later.
            </p>
            <div className="mt-5 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setConfirmingDiscard(false)}
                className="w-full rounded-2xl bg-white/10 px-5 py-3 text-sm font-semibold text-white ring-1 ring-inset ring-white/15 transition-colors hover:bg-white/20"
              >
                Go Back
              </button>
              <button
                type="button"
                onClick={onDiscard}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-destructive px-5 py-3 text-sm font-semibold text-destructive-foreground transition-opacity hover:opacity-90 active:scale-[0.99]"
              >
                Don&apos;t Save
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
