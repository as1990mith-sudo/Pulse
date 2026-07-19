"use client"

import { useRef, useState } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion } from "motion/react"
import { Loader2, Music, Pause, Play, Square, Upload, Volume2 } from "lucide-react"
import { uploadMedia } from "@/lib/upload-media"
import { cn } from "@/lib/utils"

export type MusicState = {
  url: string | null
  name: string | null
  playing: boolean
  volume: number
}

/**
 * Host-only background music sheet for a Conversation room. The host can upload
 * a track, play/pause it, and set its volume. The room auto-ducks the music
 * under active speakers; this panel controls the base level + playback.
 */
export function ConversationMusicPanel({
  open,
  onClose,
  music,
  onPlayUrl,
  onTogglePlay,
  onVolume,
  onStop,
}: {
  open: boolean
  onClose: () => void
  music: MusicState
  onPlayUrl: (url: string, name: string) => void
  onTogglePlay: () => void
  onVolume: (v: number) => void
  onStop: () => void
}) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [mounted] = useState(() => typeof document !== "undefined")

  async function handleFile(file: File) {
    setError(null)
    setUploading(true)
    try {
      const data = await uploadMedia(file, "live-music")
      onPlayUrl(data.url, data.name)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed")
    } finally {
      setUploading(false)
    }
  }

  if (!mounted) return null

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
          <motion.button
            type="button"
            aria-label="Close music"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-md"
          />
          <motion.div
            initial={{ y: "100%", opacity: 0.6 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0.6 }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
            className="relative z-10 m-3 w-full max-w-sm overflow-hidden rounded-3xl border border-white/10 bg-zinc-900/95 p-5 text-white shadow-2xl backdrop-blur-xl"
          >
            <div className="mb-4 flex items-center gap-2">
              <span className="flex size-9 items-center justify-center rounded-xl bg-primary/15 text-primary">
                <Music className="size-[18px]" />
              </span>
              <div>
                <h3 className="text-sm font-bold">Background music</h3>
                <p className="text-xs text-white/55">Ducks softly under whoever&apos;s speaking</p>
              </div>
            </div>

            {music.url ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3 rounded-2xl bg-white/5 p-3">
                  <button
                    type="button"
                    onClick={onTogglePlay}
                    aria-label={music.playing ? "Pause music" : "Play music"}
                    className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
                  >
                    {music.playing ? <Pause className="size-5" /> : <Play className="size-5 translate-x-0.5" />}
                  </button>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{music.name ?? "Track"}</span>
                  <button
                    type="button"
                    onClick={onStop}
                    aria-label="Stop music"
                    className="flex size-9 items-center justify-center rounded-full bg-white/10 text-white/80 hover:bg-white/20"
                  >
                    <Square className="size-4" />
                  </button>
                </div>

                <label className="flex items-center gap-3">
                  <Volume2 className="size-4 shrink-0 text-white/60" />
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={music.volume}
                    onChange={(e) => onVolume(Number(e.target.value))}
                    aria-label="Music volume"
                    className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/15 accent-primary"
                  />
                </label>

                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  disabled={uploading}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 py-2.5 text-sm font-medium text-white/80 hover:bg-white/10 disabled:opacity-50"
                >
                  {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                  Change track
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={uploading}
                className={cn(
                  "flex w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/20 bg-white/5 py-8 text-sm text-white/70 transition-colors hover:bg-white/10 disabled:opacity-60",
                )}
              >
                {uploading ? (
                  <>
                    <Loader2 className="size-6 animate-spin" /> Uploading…
                  </>
                ) : (
                  <>
                    <Upload className="size-6" /> Upload a track
                  </>
                )}
              </button>
            )}

            {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

            <input
              ref={inputRef}
              type="file"
              accept="audio/*"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void handleFile(file)
                e.target.value = ""
              }}
            />
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
