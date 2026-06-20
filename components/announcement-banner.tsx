"use client"

import { useRef, useState, useTransition } from "react"
import { createPortal } from "react-dom"
import Image from "next/image"
import {
  CalendarPlus,
  Check,
  Clock,
  ImageIcon,
  Loader2,
  MapPin,
  Megaphone,
  Plus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { ImageLightbox } from "@/components/image-lightbox"
import { ImageCropper } from "@/components/image-cropper"
import { createAnnouncement, deleteAnnouncement, type AnnouncementView } from "@/app/actions/announcements"
import { AD_BLOCK_HOURS, AD_MAX_HOURS, priceForHours } from "@/lib/ads"
import { downloadIcs, formatEventDate, googleCalendarUrl } from "@/lib/calendar"
import type { CurrentUser } from "@/lib/session"
import { cn } from "@/lib/utils"
import { uploadMedia } from "@/lib/upload-media"

export function AnnouncementBanner({
  announcements,
  myRequests,
  currentUser,
}: {
  announcements: AnnouncementView[]
  myRequests: AnnouncementView[]
  currentUser: CurrentUser | null
}) {
  const [showForm, setShowForm] = useState(false)

  // Pending/declined requests still worth surfacing to their owner (approved
  // ones already appear in the public list above).
  const trackable = myRequests.filter((r) => r.status !== "approved")

  return (
    <section aria-label="Announcements" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Megaphone className="size-4" />
          </span>
          <div className="leading-tight">
            <h2 className="text-sm font-semibold">Announcements</h2>
            <p className="text-xs text-muted-foreground">Promoted events from creators</p>
          </div>
        </div>
        {currentUser && (
          <Button size="sm" variant="secondary" className="gap-1.5" onClick={() => setShowForm(true)}>
            <Plus className="size-4" /> Advertise here
          </Button>
        )}
      </div>

      {announcements.length > 0 ? (
        <div className="flex flex-col gap-3">
          {announcements.map((a) => (
            <AnnouncementCard key={a.id} announcement={a} />
          ))}
        </div>
      ) : (
        <Card className="flex flex-col items-center gap-3 border-dashed bg-card/50 p-6 text-center">
          <Sparkles className="size-6 text-primary" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-balance">Promote your event to the whole community</p>
            <p className="text-xs text-muted-foreground text-pretty">
              Feature your flyer here. Listeners can add it to their calendar and get a reminder.
            </p>
          </div>
          {currentUser ? (
            <Button size="sm" className="gap-1.5" onClick={() => setShowForm(true)}>
              <Megaphone className="size-4" /> Advertise here
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">Sign in to advertise your event.</p>
          )}
        </Card>
      )}

      {/* Owner's request tracker: pending + declined */}
      {trackable.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Your advert requests</p>
          {trackable.map((r) => (
            <RequestStatusRow key={r.id} request={r} />
          ))}
        </div>
      )}

      {showForm && currentUser && <AdvertiseForm onClose={() => setShowForm(false)} />}
    </section>
  )
}

function StatusBadge({ status }: { status: AnnouncementView["status"] }) {
  if (status === "approved") {
    return <Badge className="gap-1 bg-live text-live-foreground">Published</Badge>
  }
  if (status === "declined") {
    return (
      <Badge variant="secondary" className="gap-1 text-destructive">
        Declined
      </Badge>
    )
  }
  return (
    <Badge variant="secondary" className="gap-1">
      <Clock className="size-3" /> Pending
    </Badge>
  )
}

function RequestStatusRow({ request: r }: { request: AnnouncementView }) {
  const [isPending, startTransition] = useTransition()
  return (
    <Card className="flex items-center gap-3 p-3">
      <div className="relative aspect-[16/9] w-20 shrink-0 overflow-hidden rounded-md bg-secondary">
        {r.flyer ? (
          <Image
            src={r.flyer || "/placeholder.svg"}
            alt=""
            fill
            className="object-cover"
            unoptimized={r.flyer.startsWith("data:")}
            sizes="80px"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-muted-foreground">
            <ImageIcon className="size-4" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium">{r.title}</p>
          <StatusBadge status={r.status} />
        </div>
        <p className="text-xs text-muted-foreground">{formatEventDate(r.eventDate, r.eventTime)}</p>
        {r.status === "declined" && r.declineReason && (
          <p className="mt-0.5 text-xs text-destructive">{r.declineReason}</p>
        )}
        {r.status === "pending" && (
          <p className="mt-0.5 text-xs text-muted-foreground">Awaiting approval — you&apos;ll be published if your date is free.</p>
        )}
      </div>
      <Button
        size="icon"
        variant="ghost"
        className="shrink-0 text-muted-foreground hover:text-destructive"
        aria-label="Remove request"
        disabled={isPending}
        onClick={() => startTransition(() => deleteAnnouncement(r.id))}
      >
        {isPending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
      </Button>
    </Card>
  )
}

function AnnouncementCard({ announcement: a }: { announcement: AnnouncementView }) {
  const [lightbox, setLightbox] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  const calEvent = {
    title: a.title,
    description: a.description,
    location: a.location,
    date: a.eventDate,
    time: a.eventTime,
  }

  return (
    <Card className="flex w-full flex-col overflow-hidden sm:flex-row sm:items-stretch">
      {/* Flyer — fixed-width thumbnail on the left at larger sizes */}
      {a.flyer ? (
        <button
          type="button"
          onClick={() => setLightbox(true)}
          className="relative aspect-[16/9] w-full shrink-0 overflow-hidden bg-secondary sm:aspect-auto sm:w-56 md:w-64"
          aria-label={`View ${a.title} flyer full screen`}
        >
          <Image
            src={a.flyer || "/placeholder.svg"}
            alt={`${a.title} flyer`}
            fill
            className="object-cover transition-transform duration-500 hover:scale-105"
            unoptimized={a.flyer.startsWith("data:")}
            sizes="256px"
          />
          <Badge className="absolute left-2 top-2 gap-1 bg-background/70 text-foreground backdrop-blur">
            <Megaphone className="size-3" /> Promoted
          </Badge>
        </button>
      ) : (
        <div className="flex aspect-[16/9] w-full shrink-0 items-center justify-center bg-secondary sm:aspect-auto sm:w-56 md:w-64">
          <Badge className="gap-1">
            <Megaphone className="size-3" /> Promoted
          </Badge>
        </div>
      )}

      {/* Info + action laid out horizontally across the remaining width */}
      <div className="flex flex-1 flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <div className="min-w-0 flex-1 space-y-1">
          <h3 className="font-semibold leading-tight text-balance">{a.title}</h3>
          {a.description && (
            <p className="line-clamp-2 text-sm text-muted-foreground leading-relaxed">{a.description}</p>
          )}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5 font-medium text-foreground">
              <CalendarPlus className="size-3.5 text-primary" />
              {formatEventDate(a.eventDate, a.eventTime)}
            </span>
            {a.location && (
              <span className="flex items-center gap-1.5">
                <MapPin className="size-3.5" /> {a.location}
              </span>
            )}
            <span>by {a.creatorName}</span>
          </div>
        </div>

        <div className="relative shrink-0 sm:w-44">
          <Button size="sm" className="w-full gap-1.5" onClick={() => setMenuOpen((o) => !o)}>
            <CalendarPlus className="size-4" /> Add to calendar
          </Button>
          {menuOpen && (
            <>
              <button
                type="button"
                className="fixed inset-0 z-10 cursor-default"
                aria-hidden="true"
                onClick={() => setMenuOpen(false)}
              />
              <div className="absolute bottom-full left-0 z-20 mb-1 w-full overflow-hidden rounded-lg border border-border bg-popover p-1 shadow-md">
                <a
                  href={googleCalendarUrl(calEvent)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setMenuOpen(false)}
                  className="block rounded-md px-3 py-2 text-sm hover:bg-secondary"
                >
                  Google Calendar
                </a>
                <button
                  type="button"
                  onClick={() => {
                    downloadIcs(calEvent)
                    setMenuOpen(false)
                  }}
                  className="block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-secondary"
                >
                  Apple / Outlook (.ics)
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {lightbox && a.flyer && (
        <ImageLightbox src={a.flyer} alt={`${a.title} flyer`} onClose={() => setLightbox(false)} />
      )}
    </Card>
  )
}

const DURATION_OPTIONS = Array.from({ length: AD_MAX_HOURS / AD_BLOCK_HOURS }, (_, i) => (i + 1) * AD_BLOCK_HOURS)

function AdvertiseForm({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [location, setLocation] = useState("")
  const [eventDate, setEventDate] = useState("")
  const [eventTime, setEventTime] = useState("")
  const [durationHours, setDurationHours] = useState(AD_BLOCK_HOURS)
  const [flyer, setFlyer] = useState<string | null>(null)
  const [cropSrc, setCropSrc] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ status: "approved" | "declined"; declineReason?: string } | null>(null)
  const [isPending, startTransition] = useTransition()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const today = new Date().toISOString().slice(0, 10)
  const price = priceForHours(durationHours)

  async function handleCropped(blob: Blob) {
    setError(null)
    setCropSrc(null)
    setUploading(true)
    try {
      const file = new File([blob], "flyer.jpg", { type: "image/jpeg" })
      const data = await uploadMedia(file, "chat")
      setFlyer(data.url)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload the flyer.")
    } finally {
      setUploading(false)
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!title.trim()) {
      setError("Please add an event title.")
      return
    }
    if (!eventDate) {
      setError("Please pick an event date.")
      return
    }
    startTransition(async () => {
      try {
        const res = await createAnnouncement({
          title,
          description,
          location,
          eventDate,
          eventTime: eventTime || null,
          durationHours,
          flyer,
        })
        setResult(res)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not submit your advert.")
      }
    })
  }

  if (typeof document === "undefined") return null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Advertise your event"
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-background/90 p-4 backdrop-blur-sm sm:items-center"
      onClick={(e) => {
        // Only close on a genuine backdrop click. Without this guard, clicks
        // inside the image cropper (a React child rendered via its own portal)
        // bubble through React's tree to here and close the form mid-crop.
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <Card className="my-auto w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Megaphone className="size-4" />
            </span>
            <div className="leading-tight">
              <h2 className="font-semibold">Advertise your event</h2>
              <p className="text-xs text-muted-foreground">Featured at the top of the feed for everyone</p>
            </div>
          </div>
          <Button size="icon" variant="ghost" className="shrink-0" aria-label="Close" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>

        {result ? (
          <ResultPanel result={result} onClose={onClose} />
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Flyer — rectangular 16:9 to match the published banner */}
            <div className="flex items-center gap-4">
              <div className="relative aspect-[16/9] w-32 shrink-0 overflow-hidden rounded-lg border border-border bg-secondary">
                {flyer ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={flyer || "/placeholder.svg"} alt="Flyer preview" className="size-full object-cover" />
                ) : (
                  <div className="flex size-full items-center justify-center text-muted-foreground">
                    <ImageIcon className="size-5" />
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                <p className="text-sm font-medium">Event flyer</p>
                <p className="text-xs text-muted-foreground">You can adjust the crop to fit the box.</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) setCropSrc(URL.createObjectURL(file))
                    if (fileInputRef.current) fileInputRef.current.value = ""
                  }}
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <ImageIcon className="size-3.5" />}
                  {flyer ? "Change flyer" : "Upload flyer"}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="ann-title" className="text-sm font-medium">
                Event title
              </label>
              <Input
                id="ann-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Summer Worship Night"
                maxLength={80}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="ann-desc" className="text-sm font-medium">
                Details
              </label>
              <Textarea
                id="ann-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Tell people what to expect, who's hosting, ticket info…"
                rows={3}
                maxLength={400}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label htmlFor="ann-date" className="text-sm font-medium">
                  Date
                </label>
                <Input
                  id="ann-date"
                  type="date"
                  min={today}
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="ann-time" className="text-sm font-medium">
                  Time <span className="text-muted-foreground">(optional)</span>
                </label>
                <Input id="ann-time" type="time" value={eventTime} onChange={(e) => setEventTime(e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="ann-loc" className="text-sm font-medium">
                Location <span className="text-muted-foreground">(optional)</span>
              </label>
              <Input
                id="ann-loc"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. Online, or 123 Main St"
              />
            </div>

            {/* Duration */}
            <div className="space-y-2">
              <label htmlFor="ann-duration" className="text-sm font-medium">
                Run time
              </label>
              <select
                id="ann-duration"
                value={durationHours}
                onChange={(e) => setDurationHours(Number(e.target.value))}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {DURATION_OPTIONS.map((h) => (
                  <option key={h} value={h}>
                    {h} hours — ${priceForHours(h)}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                $5 per {AD_BLOCK_HOURS} hours, up to {AD_MAX_HOURS} hours. Your advert auto-expires when the time is
                up.
              </p>
            </div>

            {/* Paid placement summary */}
            <div className="rounded-lg border border-border bg-secondary/50 p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Total due</span>
                <span className="text-sm font-semibold">${price}</span>
              </div>
              <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                <li className="flex items-center gap-1.5">
                  <Check className="size-3 text-primary" /> Reviewed and approved on a first-come, first-served basis
                </li>
                <li className="flex items-center gap-1.5">
                  <Check className="size-3 text-primary" /> One-tap calendar reminders for every listener
                </li>
              </ul>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex items-center justify-end gap-2">
              <Button type="button" variant="ghost" onClick={onClose} disabled={isPending}>
                Cancel
              </Button>
              <Button type="submit" className="gap-1.5" disabled={isPending || uploading}>
                {isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                {isPending ? "Submitting…" : `Pay $${price} & submit`}
              </Button>
            </div>
            <p className="text-center text-[11px] text-muted-foreground">
              Demo checkout — no real payment is processed.
            </p>
          </form>
        )}
      </Card>

      {cropSrc && (
        <ImageCropper
          src={cropSrc}
          aspect={16 / 9}
          title="Adjust your flyer"
          onCancel={() => setCropSrc(null)}
          onCropped={handleCropped}
        />
      )}
    </div>,
    document.body,
  )
}

function ResultPanel({
  result,
  onClose,
}: {
  result: { status: "approved" | "declined"; declineReason?: string }
  onClose: () => void
}) {
  const approved = result.status === "approved"
  return (
    <div className="flex flex-col items-center gap-4 py-4 text-center">
      <span
        className={cn(
          "flex size-12 items-center justify-center rounded-full",
          approved ? "bg-live/10 text-live" : "bg-destructive/10 text-destructive",
        )}
      >
        {approved ? <Check className="size-6" /> : <X className="size-6" />}
      </span>
      <div className="space-y-1">
        <h3 className="font-semibold">{approved ? "Your advert is published!" : "Request declined"}</h3>
        <p className="text-sm text-muted-foreground text-pretty">
          {approved
            ? "It's now live at the top of the feed and will disappear automatically when your run time is up."
            : result.declineReason || "Declined due to high demand for the selected date."}
        </p>
      </div>
      <Button onClick={onClose}>Done</Button>
    </div>
  )
}
