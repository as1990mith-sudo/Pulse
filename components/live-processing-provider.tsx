"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { AlertTriangle, CheckCircle2, Loader2, RotateCw, X } from "lucide-react"
import { uploadMedia } from "@/lib/upload-media"
import {
  createProcessingEpisode,
  failProcessing,
  finalizeProcessing,
} from "@/app/actions/live-processing"
import { haptic } from "@/lib/haptics"
import { cn } from "@/lib/utils"

/**
 * A single live replay handed to the background processor. The blob is provided
 * as a promise because the studio's MediaRecorder finalizes slightly after the
 * host clicks "Save"; we hold the resolved blob in memory for the whole job so a
 * failed upload can be retried without re-recording.
 */
export type LiveReplayJobInput = {
  title: string
  category: string
  duration: string
  cover: string | null
  mediaKind: "video" | "audio"
  fileBaseName: string
  blobPromise: Promise<Blob | null>
  // Live wall-clock length in seconds. Used to validate the recording spans the
  // whole session (not a truncated few-seconds clip) before publishing.
  expectedDurationSec?: number
}

type JobStatus = "preparing" | "verifying" | "uploading" | "finalizing" | "ready" | "failed"

type Job = {
  localId: string
  episodeId: number | null
  title: string
  mediaKind: "video" | "audio"
  status: JobStatus
  progress: number // 0..100 upload progress
  startedAt: number
  error?: string
  expectedDurationSec?: number
  // The resolved recording, kept in memory so Retry can re-upload it.
  blob: Blob | null
}

type LiveProcessingContextValue = {
  enqueue: (input: LiveReplayJobInput) => Promise<void>
  retry: (episodeId?: number) => void
  // Whether a failed episode still has its in-memory blob available to retry.
  isRetryable: (episodeId?: number) => boolean
}

const LiveProcessingContext = createContext<LiveProcessingContextValue | null>(null)

export function useLiveProcessing(): LiveProcessingContextValue {
  const ctx = useContext(LiveProcessingContext)
  if (!ctx) {
    // Safe no-op fallback so components using the hook don't crash if rendered
    // outside the provider (e.g. isolated tests / storybook).
    return {
      enqueue: async () => {},
      retry: () => {},
      isRetryable: () => false,
    }
  }
  return ctx
}

// Rough per-media-kind throughput estimate (bytes/sec) used only to show a
// friendly "about N min left" — never a hard promise.
const EST_BYTES_PER_SEC = 700 * 1024

function formatEta(bytesRemaining: number): string | null {
  if (bytesRemaining <= 0) return null
  const secs = Math.round(bytesRemaining / EST_BYTES_PER_SEC)
  if (secs < 45) return "less than a minute left"
  const mins = Math.max(1, Math.round(secs / 60))
  return `about ${mins} min left`
}

type ProbeResult = { ok: true; durationSec: number } | { ok: false; reason: string }

/**
 * Mandatory pre-publish validation. Decodes the recording in an offscreen
 * <video> and verifies it is a real, playable media file BEFORE the replay is
 * ever marked Ready — so a corrupt, empty, or truncated upload can never
 * replace/become the final replay. We check that:
 *   1. the file decodes (metadata loads) — i.e. it's a valid, finalised file;
 *   2. it reports a finite duration greater than zero;
 *   3. it carries a video track with real pixel dimensions (kind === video);
 *   4. the duration is consistent with the actual live length — at least half
 *      of the wall-clock session — which rejects a "few seconds" clip that
 *      slipped through.
 * A decode timeout also fails validation rather than publishing blind.
 */
async function probeVideoBlob(
  blob: Blob,
  mediaKind: "video" | "audio",
  expectedDurationSec?: number,
): Promise<ProbeResult> {
  if (typeof document === "undefined") return { ok: true, durationSec: 0 } // SSR guard; never runs client-side
  const url = URL.createObjectURL(blob)
  const el = document.createElement(mediaKind === "video" ? "video" : "audio") as HTMLMediaElement & {
    videoWidth?: number
    videoHeight?: number
  }
  el.preload = "metadata"
  el.muted = true
  el.src = url

  try {
    const duration = await new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("timeout")), 20000)
      el.onloadedmetadata = () => {
        clearTimeout(timer)
        resolve(el.duration)
      }
      el.onerror = () => {
        clearTimeout(timer)
        reject(new Error("decode-error"))
      }
    })

    if (!Number.isFinite(duration) || duration <= 0) {
      return { ok: false, reason: "The recording has no valid duration." }
    }
    if (mediaKind === "video" && !(el.videoWidth && el.videoWidth > 0)) {
      return { ok: false, reason: "The recording is missing a video track." }
    }
    // Truncation guard: only enforced for sessions long enough to judge (>20s),
    // with generous slack so mild encoder/wall-clock drift never false-fails.
    if (expectedDurationSec && expectedDurationSec > 20 && duration < expectedDurationSec * 0.5) {
      return {
        ok: false,
        reason: `The recording is incomplete (${Math.round(duration)}s of ~${expectedDurationSec}s).`,
      }
    }
    return { ok: true, durationSec: duration }
  } catch (e) {
    const reason =
      e instanceof Error && e.message === "timeout"
        ? "The recording could not be verified in time."
        : "The recording could not be decoded."
    return { ok: false, reason }
  } finally {
    el.removeAttribute("src")
    el.load?.()
    URL.revokeObjectURL(url)
  }
}

export function LiveProcessingProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [jobs, setJobs] = useState<Job[]>([])
  // Mirror of jobs for use inside stable callbacks without stale closures.
  const jobsRef = useRef<Job[]>([])
  jobsRef.current = jobs
  // Blobs kept out of React state (they're large + non-serializable).
  const blobStore = useRef<Map<string, Blob>>(new Map())

  const patchJob = useCallback((localId: string, patch: Partial<Job>) => {
    setJobs((prev) => prev.map((j) => (j.localId === localId ? { ...j, ...patch } : j)))
  }, [])

  const dismissJob = useCallback((localId: string) => {
    blobStore.current.delete(localId)
    setJobs((prev) => prev.filter((j) => j.localId !== localId))
  }, [])

  // Core pipeline for one job: upload the complete recording, then finalize the
  // placeholder episode. Any throw marks the job (and the DB row) failed.
  const runJob = useCallback(
    async (job: Job) => {
      const blob = blobStore.current.get(job.localId)
      if (!blob || blob.size === 0) {
        patchJob(job.localId, { status: "failed", error: "Recording was empty." })
        if (job.episodeId) await failProcessing({ episodeId: job.episodeId, error: "Recording was empty." })
        return
      }

      try {
        // ── Mandatory validation ────────────────────────────────────────────
        // Verify the recording is a valid, playable, complete media file BEFORE
        // uploading or publishing. A corrupt/truncated blob fails here and the
        // DB row stays unpublished (processing → failed, retryable) rather than
        // ever becoming a broken replay.
        patchJob(job.localId, { status: "verifying", progress: 0 })
        const probe = await probeVideoBlob(blob, job.mediaKind, job.expectedDurationSec)
        if (!probe.ok) {
          patchJob(job.localId, { status: "failed", error: probe.reason })
          if (job.episodeId) await failProcessing({ episodeId: job.episodeId, error: probe.reason })
          router.refresh()
          return
        }

        patchJob(job.localId, { status: "uploading", progress: 0 })
        const ext = blob.type.includes("mp4") ? "mp4" : blob.type.includes("webm") ? "webm" : job.mediaKind === "video" ? "webm" : "webm"
        const file = new File([blob], `${job.title || "live"}.${ext}`.replace(/[^\w.-]+/g, "-"), {
          type: blob.type || (job.mediaKind === "video" ? "video/webm" : "audio/webm"),
        })

        const { url } = await uploadMedia(file, "episodes", undefined, (pct) =>
          patchJob(job.localId, { progress: pct }),
        )

        patchJob(job.localId, { status: "finalizing", progress: 100 })
        if (job.episodeId) {
          const res = await finalizeProcessing({ episodeId: job.episodeId, mediaKind: job.mediaKind, url })
          if (!res.ok) throw new Error(res.error)
        }

        patchJob(job.localId, { status: "ready" })
        haptic("light")
        // Surface the fresh replay in the catalogue immediately.
        router.refresh()
        // The in-memory blob is no longer needed once ready.
        blobStore.current.delete(job.localId)
      } catch (err) {
        const message = err instanceof Error ? err.message : "Upload failed"
        patchJob(job.localId, { status: "failed", error: message })
        if (job.episodeId) await failProcessing({ episodeId: job.episodeId, error: message })
        router.refresh()
      }
    },
    [patchJob, router],
  )

  const enqueue = useCallback(
    async (input: LiveReplayJobInput) => {
      const localId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      const job: Job = {
        localId,
        episodeId: null,
        title: input.title,
        mediaKind: input.mediaKind,
        status: "preparing",
        progress: 0,
        startedAt: Date.now(),
        expectedDurationSec: input.expectedDurationSec,
        blob: null,
      }
      setJobs((prev) => [...prev, job])

      // 1) Immediately create the "Processing…" catalogue entry (no media url).
      const created = await createProcessingEpisode({
        title: input.title,
        category: input.category,
        duration: input.duration,
        cover: input.cover,
        mediaKind: input.mediaKind,
      })
      if (!created.ok) {
        patchJob(localId, { status: "failed", error: created.error })
        return
      }
      patchJob(localId, { episodeId: created.episodeId })
      // Show the placeholder in the catalogue right away.
      router.refresh()

      // 2) Await the recording blob (usually already resolved) and store it.
      const blob = await input.blobPromise.catch(() => null)
      if (blob && blob.size > 0) blobStore.current.set(localId, blob)

      // 3) Run the upload/finalize pipeline in the background.
      const current = { ...job, episodeId: created.episodeId, blob }
      void runJob(current)
    },
    [patchJob, router, runJob],
  )

  const retry = useCallback(
    (episodeId?: number) => {
      const job = jobsRef.current.find((j) => j.episodeId === episodeId || (episodeId == null && j.status === "failed"))
      if (!job || !blobStore.current.has(job.localId)) return
      patchJob(job.localId, { status: "uploading", progress: 0, error: undefined, startedAt: Date.now() })
      void runJob({ ...job, status: "uploading" })
    },
    [patchJob, runJob],
  )

  const isRetryable = useCallback((episodeId?: number) => {
    const job = jobsRef.current.find((j) => j.episodeId === episodeId)
    return Boolean(job && blobStore.current.has(job.localId))
  }, [])

  // Warn the host before they fully close the tab/app while an upload is still
  // in flight — closing loses the in-memory recording (client-side limitation).
  useEffect(() => {
    const hasActive = jobs.some(
      (j) =>
        j.status === "preparing" ||
        j.status === "verifying" ||
        j.status === "uploading" ||
        j.status === "finalizing",
    )
    if (!hasActive) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ""
    }
    window.addEventListener("beforeunload", handler)
    return () => window.removeEventListener("beforeunload", handler)
  }, [jobs])

  const value = useMemo<LiveProcessingContextValue>(
    () => ({ enqueue, retry, isRetryable }),
    [enqueue, retry, isRetryable],
  )

  // Only show jobs that are worth a status card (hide nothing until dismissed).
  const visibleJobs = jobs

  return (
    <LiveProcessingContext.Provider value={value}>
      {children}
      {visibleJobs.length > 0 && (
        <div
          className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] z-[60] flex flex-col items-center gap-2 px-4"
          role="status"
          aria-live="polite"
        >
          {visibleJobs.map((job) => (
            <ProcessingCard key={job.localId} job={job} onRetry={() => retry(job.episodeId ?? undefined)} onDismiss={() => dismissJob(job.localId)} retryable={blobStore.current.has(job.localId)} />
          ))}
        </div>
      )}
    </LiveProcessingContext.Provider>
  )
}

/**
 * A minimal circular progress ring drawn with two stacked SVG circles. When
 * `indeterminate`, it spins a short arc (preparing/verifying, where there's no
 * byte-level progress yet); otherwise it sweeps to `value` (0–100).
 */
function ProgressRing({
  value,
  indeterminate = false,
  className,
  children,
}: {
  value: number
  indeterminate?: boolean
  className?: string
  children?: React.ReactNode
}) {
  const r = 15
  const c = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(100, value))
  return (
    <span className={cn("relative flex size-9 shrink-0 items-center justify-center", className)}>
      <svg viewBox="0 0 36 36" className={cn("size-9 -rotate-90", indeterminate && "animate-spin")}>
        <circle cx="18" cy="18" r={r} fill="none" strokeWidth="2.5" className="stroke-secondary" />
        <circle
          cx="18"
          cy="18"
          r={r}
          fill="none"
          strokeWidth="2.5"
          strokeLinecap="round"
          className="stroke-primary transition-[stroke-dashoffset] duration-300 ease-out"
          strokeDasharray={c}
          strokeDashoffset={indeterminate ? c * 0.75 : c * (1 - pct / 100)}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center">{children}</span>
    </span>
  )
}

function ProcessingCard({
  job,
  onRetry,
  onDismiss,
  retryable,
}: {
  job: Job
  onRetry: () => void
  onDismiss: () => void
  retryable: boolean
}) {
  const active =
    job.status === "preparing" ||
    job.status === "verifying" ||
    job.status === "uploading" ||
    job.status === "finalizing"
  // Displayed progress: uploading uses real bytes; finalizing is effectively
  // complete; preparing/verifying have no measurable progress (indeterminate).
  const indeterminate = job.status === "preparing" || job.status === "verifying"
  const displayPct = job.status === "finalizing" ? 100 : job.progress
  // Auto-dismiss the success state so the ready card disappears on its own —
  // it's a transient system status, not a banner that lingers.
  useEffect(() => {
    if (job.status !== "ready") return
    const t = setTimeout(onDismiss, 3500)
    return () => clearTimeout(t)
  }, [job.status, onDismiss])

  const label =
    job.status === "ready"
      ? "Replay ready"
      : job.status === "failed"
        ? "Processing failed"
        : "Processing replay"

  return (
    <div className="pointer-events-auto w-full max-w-sm overflow-hidden rounded-2xl border border-border/50 bg-card/90 shadow-xl shadow-black/30 ring-1 ring-white/5 backdrop-blur-xl animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex items-center gap-3 p-3">
        {job.status === "ready" ? (
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
            <CheckCircle2 className="size-5" />
          </span>
        ) : job.status === "failed" ? (
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-destructive/15 text-destructive">
            <AlertTriangle className="size-5" />
          </span>
        ) : (
          <ProgressRing value={displayPct} indeterminate={indeterminate}>
            {indeterminate ? (
              <Loader2 className="size-3.5 animate-spin text-primary" />
            ) : (
              <span className="text-[10px] font-semibold tabular-nums text-foreground">{displayPct}</span>
            )}
          </ProgressRing>
        )}

        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "text-[11px] font-medium uppercase tracking-wide",
              job.status === "ready"
                ? "text-primary"
                : job.status === "failed"
                  ? "text-destructive"
                  : "text-muted-foreground",
            )}
          >
            {label}
          </p>
          <p className="mt-0.5 truncate text-sm font-semibold leading-tight text-foreground">
            {job.status === "failed" ? job.error || "Something went wrong while uploading." : job.title}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {job.status === "failed" && retryable && (
            <button
              type="button"
              onClick={onRetry}
              className="flex h-8 items-center gap-1.5 rounded-full bg-destructive/15 px-3 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/25"
            >
              <RotateCw className="size-3.5" /> Retry
            </button>
          )}
          {!active && (
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Dismiss"
              className="flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
