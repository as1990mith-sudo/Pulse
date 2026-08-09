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
}

type JobStatus = "preparing" | "uploading" | "finalizing" | "ready" | "failed"

type Job = {
  localId: string
  episodeId: number | null
  title: string
  mediaKind: "video" | "audio"
  status: JobStatus
  progress: number // 0..100 upload progress
  startedAt: number
  error?: string
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
        blob: null,
      }
      setJobs((prev) => [...prev, job])

      // 1) Immediately create the "Processing…" catalogue entry (no media url).
      const created = await createProcessingEpisode({
        title: input.title,
        category: input.category,
        duration: input.duration,
        cover: input.cover,
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
    const hasActive = jobs.some((j) => j.status === "preparing" || j.status === "uploading" || j.status === "finalizing")
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
  const active = job.status === "preparing" || job.status === "uploading" || job.status === "finalizing"
  const elapsedMin = Math.floor((Date.now() - job.startedAt) / 60000)
  // Rough remaining-bytes estimate for the ETA line during upload.
  const eta = job.status === "uploading" && job.progress < 100 ? `${100 - job.progress}% to go` : null
  const slow = job.status === "uploading" && elapsedMin >= 3

  return (
    <div className="pointer-events-auto w-full max-w-md overflow-hidden rounded-2xl border border-border/60 bg-card/95 shadow-2xl shadow-black/40 backdrop-blur">
      <div className="flex items-start gap-3 p-3.5">
        <span
          className={cn(
            "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full",
            job.status === "ready"
              ? "bg-primary/15 text-primary"
              : job.status === "failed"
                ? "bg-destructive/15 text-destructive"
                : "bg-secondary text-foreground",
          )}
        >
          {job.status === "ready" ? (
            <CheckCircle2 className="size-4.5" />
          ) : job.status === "failed" ? (
            <AlertTriangle className="size-4.5" />
          ) : (
            <Loader2 className="size-4.5 animate-spin" />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold leading-tight">
            {job.status === "ready"
              ? "Replay ready"
              : job.status === "failed"
                ? "Processing failed"
                : "Processing your replay…"}
          </p>
          <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-muted-foreground">
            {job.status === "ready" ? (
              "Your live replay is now ready in your Live Catalogue."
            ) : job.status === "failed" ? (
              job.error || "Something went wrong while uploading."
            ) : slow ? (
              "Your live replay is still processing. We'll notify you when it's ready."
            ) : (
              <>
                {job.title}
                {eta ? ` · ${eta}` : ""}
              </>
            )}
          </p>

          {active && (
            <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-300"
                style={{ width: `${job.status === "finalizing" ? 100 : job.progress}%` }}
              />
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {job.status === "failed" && retryable && (
            <button
              type="button"
              onClick={onRetry}
              className="flex h-8 items-center gap-1.5 rounded-full bg-destructive/15 px-2.5 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/25"
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
