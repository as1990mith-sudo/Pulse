"use client"

import { useEffect, useRef, useState } from "react"
import { Mic, MicOff, Video, VideoOff, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Pre-join preview for a grid ("landscape") video meeting. A participant sees
 * their own camera and can choose to enter with mic and/or camera on or off
 * before joining. Their choices are handed back via `onEnter`; everything can
 * still be toggled once inside the meeting.
 *
 * The preview uses a local getUserMedia stream that is fully torn down before
 * entering, so LiveKit can acquire the devices cleanly on connect.
 */
export function GridPrejoin({
  title,
  hostName,
  selfName,
  joining,
  onEnter,
}: {
  title: string
  hostName: string
  selfName: string
  joining: boolean
  onEnter: (choices: { micOn: boolean; camOn: boolean }) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [micOn, setMicOn] = useState(true)
  const [camOn, setCamOn] = useState(true)
  const [starting, setStarting] = useState(true)
  const [denied, setDenied] = useState(false)

  // Acquire a local preview stream once. Tracks are enabled/disabled to reflect
  // the mic/cam toggles without re-requesting permission.
  useEffect(() => {
    let cancelled = false
    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) videoRef.current.srcObject = stream
        setStarting(false)
      } catch {
        if (!cancelled) {
          setDenied(true)
          setStarting(false)
          setCamOn(false)
          setMicOn(false)
        }
      }
    }
    void start()
    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [])

  // Reflect toggles on the live preview tracks.
  useEffect(() => {
    streamRef.current?.getVideoTracks().forEach((t) => (t.enabled = camOn))
  }, [camOn])
  useEffect(() => {
    streamRef.current?.getAudioTracks().forEach((t) => (t.enabled = micOn))
  }, [micOn])

  function enter() {
    // Release the preview devices so LiveKit can take them over cleanly.
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    onEnter({ micOn, camOn })
  }

  return (
    <div className="flex h-full flex-col bg-neutral-950 px-5 pb-[max(env(safe-area-inset-bottom),1.25rem)] pt-6">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-5">
        <div className="text-center">
          <h1 className="text-balance text-xl font-bold text-white">{title}</h1>
          <p className="mt-1 text-sm text-white/60">{hostName}&apos;s meeting</p>
        </div>

        {/* Camera preview */}
        <div className="relative aspect-[3/4] w-full overflow-hidden rounded-2xl bg-neutral-800">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={cn(
              "absolute inset-0 size-full -scale-x-100 object-cover transition-opacity",
              camOn && !starting ? "opacity-100" : "opacity-0",
            )}
          />
          {starting && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="size-7 animate-spin text-white/70" />
            </div>
          )}
          {!starting && !camOn && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/70">
              <VideoOff className="size-8" />
              <span className="text-sm">Camera is off</span>
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 py-2">
            <span className="text-sm font-medium text-white">{selfName}</span>
          </div>
        </div>

        {denied && (
          <p className="text-center text-xs text-white/50">
            {"We couldn't access your camera or microphone. You can still enter and turn them on later."}
          </p>
        )}

        {/* Mic / camera toggles */}
        <div className="flex items-center justify-center gap-4">
          <button
            type="button"
            onClick={() => setMicOn((v) => !v)}
            aria-pressed={micOn}
            aria-label={micOn ? "Turn microphone off" : "Turn microphone on"}
            className={cn(
              "flex size-14 items-center justify-center rounded-full text-white transition-colors",
              micOn ? "bg-white/10 hover:bg-white/20" : "bg-destructive text-destructive-foreground",
            )}
          >
            {micOn ? <Mic className="size-6" /> : <MicOff className="size-6" />}
          </button>
          <button
            type="button"
            onClick={() => setCamOn((v) => !v)}
            aria-pressed={camOn}
            aria-label={camOn ? "Turn camera off" : "Turn camera on"}
            className={cn(
              "flex size-14 items-center justify-center rounded-full text-white transition-colors",
              camOn ? "bg-white/10 hover:bg-white/20" : "bg-destructive text-destructive-foreground",
            )}
          >
            {camOn ? <Video className="size-6" /> : <VideoOff className="size-6" />}
          </button>
        </div>

        <button
          type="button"
          onClick={enter}
          disabled={joining}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary text-base font-semibold text-primary-foreground disabled:opacity-70"
        >
          {joining ? (
            <>
              <Loader2 className="size-5 animate-spin" /> Joining…
            </>
          ) : (
            "Join meeting"
          )}
        </button>
      </div>
    </div>
  )
}
