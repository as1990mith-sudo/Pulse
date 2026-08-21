"use client"

import { useRef, useState } from "react"
import { Camera, ImagePlus, Loader2, Trash2 } from "lucide-react"
import { compressImage, uploadMedia } from "@/lib/upload-media"
import { cn } from "@/lib/utils"

/**
 * Shared upload logic for a single image field. Compresses in the browser
 * (covers keep a larger long edge than square avatars) then uploads straight
 * to Blob via the signed-token flow. Failures surface inline and never block
 * the rest of the form.
 */
export function useImageUpload(kind: "cover" | "avatar", onChange: (url: string) => void) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function onSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = "" // allow re-selecting the same file
    if (!file) return
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.")
      return
    }
    setError(null)
    setBusy(true)
    try {
      const compressed = await compressImage(file, kind === "cover" ? 1920 : 640, 0.85)
      const { url } = await uploadMedia(compressed, kind === "cover" ? "covers" : "avatars", file.name)
      onChange(url)
    } catch {
      setError("Upload failed. Please try again.")
    } finally {
      setBusy(false)
    }
  }

  return { busy, error, inputRef, onSelect }
}

/**
 * Cover art + overlapping profile-picture editor for a Home/organisation. Shared
 * by the in-app "Manage" sheet and the organisation sign-up flow so branding is
 * captured identically at creation and afterwards.
 */
export function BrandImages({
  orgName,
  initials,
  color,
  logo,
  cover,
  onLogo,
  onCover,
}: {
  orgName: string
  initials: string
  color: string
  logo: string
  cover: string
  onLogo: (url: string) => void
  onCover: (url: string) => void
}) {
  const coverUp = useImageUpload("cover", onCover)
  const logoUp = useImageUpload("avatar", onLogo)
  const coverSrc = cover.trim() || logo.trim()

  return (
    <div>
      <div className="relative">
        {/* Cover art */}
        <div className="relative aspect-[16/6] w-full overflow-hidden rounded-2xl border border-border/50 bg-muted/40">
          {coverSrc ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={coverSrc || "/placeholder.svg"}
                alt=""
                className={cn("size-full object-cover", cover.trim() ? "" : "scale-125 opacity-50 blur-xl")}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/45 to-transparent" />
            </>
          ) : (
            <div className="flex size-full items-center justify-center">
              <span className="inline-flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <ImagePlus className="size-4" /> Add cover art
              </span>
            </div>
          )}

          <input ref={coverUp.inputRef} type="file" accept="image/*" className="sr-only" onChange={coverUp.onSelect} />

          <div className="absolute right-2.5 top-2.5 flex items-center gap-1.5">
            <ImageActionButton
              onClick={() => coverUp.inputRef.current?.click()}
              busy={coverUp.busy}
              icon={<Camera className="size-3.5" />}
              label={cover.trim() ? "Change" : "Upload"}
            />
            {cover.trim() && !coverUp.busy && (
              <ImageActionButton
                onClick={() => onCover("")}
                icon={<Trash2 className="size-3.5" />}
                label="Remove"
                destructive
              />
            )}
          </div>
        </div>

        {/* Profile picture, overlapping the cover's lower-left corner */}
        <div className="absolute -bottom-5 left-4">
          <div className="relative">
            <div className="rounded-2xl bg-card p-1 shadow-lg ring-1 ring-border/60">
              <span
                className={cn(
                  "flex size-16 items-center justify-center overflow-hidden rounded-xl text-lg font-bold text-white",
                  !logo.trim() && color,
                )}
              >
                {logo.trim() ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logo || "/placeholder.svg"} alt={orgName} className="size-full object-cover" />
                ) : (
                  initials
                )}
              </span>
            </div>
            <input ref={logoUp.inputRef} type="file" accept="image/*" className="sr-only" onChange={logoUp.onSelect} />
            <button
              type="button"
              onClick={() => logoUp.inputRef.current?.click()}
              disabled={logoUp.busy}
              aria-label="Change profile picture"
              className="absolute -bottom-1 -right-1 flex size-7 items-center justify-center rounded-full border border-card bg-primary text-primary-foreground shadow-md transition-transform active:scale-95 disabled:opacity-70"
            >
              {logoUp.busy ? <Loader2 className="size-3.5 animate-spin" /> : <Camera className="size-3.5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Helper row (leaves clearance for the overlapping avatar) */}
      <div className="mt-7 flex flex-wrap items-center justify-between gap-2 pl-1">
        <p className="text-xs text-muted-foreground">
          {logo.trim() ? "Profile picture set" : "Add a profile picture"} — a square image works best.
        </p>
        {logo.trim() && !logoUp.busy && (
          <button
            type="button"
            onClick={() => onLogo("")}
            className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-destructive"
          >
            <Trash2 className="size-3.5" /> Remove picture
          </button>
        )}
      </div>

      {(coverUp.error || logoUp.error) && (
        <p className="mt-2 text-xs text-destructive" role="alert">
          {coverUp.error ?? logoUp.error}
        </p>
      )}
    </div>
  )
}

function ImageActionButton({
  onClick,
  busy,
  icon,
  label,
  destructive,
}: {
  onClick: () => void
  busy?: boolean
  icon: React.ReactNode
  label: string
  destructive?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold text-white shadow-md backdrop-blur transition-colors disabled:opacity-70",
        destructive ? "bg-black/50 hover:bg-destructive" : "bg-black/50 hover:bg-black/70",
      )}
    >
      {busy ? <Loader2 className="size-3.5 animate-spin" /> : icon}
      {label}
    </button>
  )
}
