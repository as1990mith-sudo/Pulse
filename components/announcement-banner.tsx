"use client"

import { useRef, useState, useTransition } from "react"
import { createPortal } from "react-dom"
import Image from "next/image"
import {
  CalendarPlus,
  Check,
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
import {
  createAnnouncement,
  deleteAnnouncement,
  type AnnouncementView,
} from "@/app/actions/announcements"
import { downloadIcs, formatEventDate, googleCalendarUrl } from "@/lib/calendar"
import type { CurrentUser } from "@/lib/session"
import { cn } from "@/lib/utils"

const PLACEMENT_FEE = "$49"

export function AnnouncementBanner({
  announcements,
  currentUser,
}: {
  announcements: AnnouncementView[]
  currentUser: CurrentUser | null
}) {
  const [showForm, setShowForm] = useState(false)

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
        <div className="-mx-1 flex snap-x snap-mandatory gap-4 overflow-x-auto px-1 pb-2">
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

      {showForm && currentUser && <AdvertiseForm onClose={() => setShowForm(false)} />}
    </section>
  )
}

function AnnouncementCard({ announcement: a }: { announcement: AnnouncementView }) {
  const [lightbox, setLightbox] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  const calEvent = {
    title: a.title,
    description: a.description,
    location: a.location,
    date: a.eventDate,
    time: a.eventTime,
  }

  return (
    <Card className="flex w-[280px] shrink-0 snap-start flex-col overflow-hidden sm:w-[340px]">
      {a.flyer ? (
        <button
          type="button"
          onClick={() => setLightbox(true)}
          className="relative aspect-[16/9] w-full overflow-hidden bg-secondary"
          aria-label={`View ${a.title} flyer full screen`}
        >
          <Image
            src={a.flyer || "/placeholder.svg"}
            alt={`${a.title} flyer`}
            fill
            className="object-cover transition-transform duration-500 hover:scale-105"
            unoptimized={a.flyer.startsWith("data:")}
            sizes="340px"
          />
          <Badge className="absolute left-2 top-2 gap-1 bg-background/70 text-foreground backdrop-blur">
            <Megaphone className="size-3" /> Promoted
          </Badge>
        </button>
      ) : (
        <div className="flex aspect-[16/9] w-full items-center justify-center bg-secondary">
          <Badge className="gap-1">
            <Megaphone className="size-3" /> Promoted
          </Badge>
        </div>
      )}

      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="space-y-1">
          <h3 className="font-semibold leading-tight text-balance">{a.title}</h3>
          {a.description && (
            <p className="line-clamp-2 text-sm text-muted-foreground leading-relaxed">{a.description}</p>
          )}
        </div>

        <div className="mt-1 space-y-1 text-xs text-muted-foreground">
          <p className="flex items-center gap-1.5 font-medium text-foreground">
            <CalendarPlus className="size-3.5 text-primary" />
            {formatEventDate(a.eventDate, a.eventTime)}
          </p>
          {a.location && (
            <p className="flex items-center gap-1.5">
              <MapPin className="size-3.5" /> {a.location}
            </p>
          )}
          <p>by {a.creatorName}</p>
        </div>

        <div className="mt-auto flex items-center gap-2 pt-2">
          <div className="relative flex-1">
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
          {a.isOwner && (
            <Button
              size="icon"
              variant="ghost"
              className="shrink-0 text-muted-foreground hover:text-destructive"
              aria-label="Remove announcement"
              disabled={isPending}
              onClick={() => startTransition(() => deleteAnnouncement(a.id))}
            >
              {isPending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
            </Button>
          )}
        </div>
      </div>

      {lightbox && a.flyer && (
        <ImageLightbox src={a.flyer} alt={`${a.title} flyer`} onClose={() => setLightbox(false)} />
      )}
    </Card>
  )
}

function AdvertiseForm({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [location, setLocation] = useState("")
  const [eventDate, setEventDate] = useState("")
  const [eventTime, setEventTime] = useState("")
  const [flyer, setFlyer] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const today = new Date().toISOString().slice(0, 10)

  async function handleFlyerPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      const res = await fetch("/api/upload-chat", { method: "POST", body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Upload failed")
      setFlyer(data.url)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload the flyer.")
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
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
        await createAnnouncement({
          title,
          description,
          location,
          eventDate,
          eventTime: eventTime || null,
          flyer,
        })
        onClose()
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not publish the announcement.")
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
      onClick={onClose}
    >
      <Card
        className="my-auto w-full max-w-lg p-6"
        onClick={(e) => e.stopPropagation()}
      >
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

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Flyer */}
          <div className="flex items-center gap-4">
            <div className="relative aspect-[16/9] w-28 shrink-0 overflow-hidden rounded-lg border border-border bg-secondary">
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
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFlyerPick} />
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
              <Input
                id="ann-time"
                type="time"
                value={eventTime}
                onChange={(e) => setEventTime(e.target.value)}
              />
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

          {/* Paid placement summary */}
          <div className="rounded-lg border border-border bg-secondary/50 p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Promoted placement</span>
              <span className="text-sm font-semibold">{PLACEMENT_FEE}</span>
            </div>
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
              <li className="flex items-center gap-1.5">
                <Check className="size-3 text-primary" /> Pinned to the top of the feed until your event date
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
              {isPending ? "Processing…" : `Pay ${PLACEMENT_FEE} & publish`}
            </Button>
          </div>
          <p className="text-center text-[11px] text-muted-foreground">
            Demo checkout — no real payment is processed.
          </p>
        </form>
      </Card>
    </div>,
    document.body,
  )
}
