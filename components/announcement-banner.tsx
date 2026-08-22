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
  MessageSquare,
  MoreVertical,
  Plus,
  Tag,
  Trash2,
  Users,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { ImageLightbox } from "@/components/image-lightbox"
import {
  adminDeleteAnnouncement,
  adminMessageCreator,
  createAnnouncement,
  deleteAnnouncement,
  orgDeleteEvent,
  rsvpToEvent,
  type AnnouncementView,
  type EventDeleteMode,
} from "@/app/actions/announcements"
import { type AdType } from "@/lib/ads"
import { formatEventDate } from "@/lib/calendar"
import type { CurrentUser } from "@/lib/session"
import { cn } from "@/lib/utils"
import { uploadMedia } from "@/lib/upload-media"

export function AnnouncementBanner({
  announcements,
  myRequests,
  currentUser,
  isAdmin = false,
  canPublish = false,
}: {
  announcements: AnnouncementView[]
  myRequests: AnnouncementView[]
  currentUser: CurrentUser | null
  isAdmin?: boolean
  // Whether the viewer may publish events (organisation owner/admin). Members
  // can browse and RSVP but never see the publish entry points.
  canPublish?: boolean
}) {
  const [showForm, setShowForm] = useState(false)
  // The id of the event whose detail sheet is open (opened by tapping a card).
  const [openId, setOpenId] = useState<number | null>(null)

  // Pending/declined requests still worth surfacing to their owner.
  const trackable = myRequests.filter((r) => r.status !== "approved")

  // Every approved, unexpired event the viewer hasn't dismissed fills the grid.
  const events = announcements.filter((a) => !a.hiddenByMe)

  // Resolve the open card against the freshest server data so interactions
  // (which revalidate the feed) reflect immediately; close it if it's gone.
  const openEvent = openId != null ? announcements.find((e) => e.id === openId) ?? null : null

  return (
    <section aria-label="Events" className="space-y-4 pb-4">
      {/* Header + publish entry point */}
      <div className="flex items-center justify-between gap-3 px-4 sm:px-0">
        <div className="flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <CalendarPlus className="size-5" />
          </span>
          <div className="leading-tight">
            <h2 className="text-base font-semibold">Events</h2>
          </div>
        </div>
        {canPublish && (
          <Button size="sm" className="gap-1.5" onClick={() => setShowForm(true)}>
            <Plus className="size-4" /> Publish
          </Button>
        )}
      </div>

      {/* Owner's request tracker: pending / declined */}
      {trackable.length > 0 && (
        <div className="space-y-2 px-4 sm:px-0">
          <p className="text-xs font-medium text-muted-foreground">Your event requests</p>
          {trackable.map((r) => (
            <RequestStatusRow key={r.id} request={r} />
          ))}
        </div>
      )}

      {/* Two-column grid of every published event. */}
      {events.length > 0 ? (
        <div className="grid grid-cols-2 gap-x-3 gap-y-6 px-4 sm:gap-x-4 sm:px-0">
          {events.map((a, i) => (
            <EventGridCard key={a.id} event={a} index={i} onOpen={() => setOpenId(a.id)} />
          ))}
        </div>
      ) : (
        <Card className="mx-4 flex flex-col items-center gap-3 border-dashed bg-card/50 p-8 text-center sm:mx-0">
          <span className="flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <CalendarPlus className="size-6" />
          </span>
          <div className="space-y-1">
            <p className="text-sm font-medium text-balance">No events yet</p>
            <p className="text-xs text-muted-foreground text-pretty">
              {canPublish
                ? "Publish your first event and your members will be able to say if they're coming."
                : "When your organisation publishes an event, you'll see it here."}
            </p>
          </div>
        </Card>
      )}

      {showForm && currentUser && <AdvertiseForm onClose={() => setShowForm(false)} />}
      {openEvent && <EventDetailSheet event={openEvent} isAdmin={isAdmin} onClose={() => setOpenId(null)} />}
    </section>
  )
}

/**
 * Premium bookstore-style grid card: a portrait flyer/poster with a Free/paid
 * chip, then the event name and publisher beneath. Tapping opens full details.
 */
function EventGridCard({
  event: a,
  index = 0,
  onOpen,
}: {
  event: AnnouncementView
  index?: number
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex flex-col text-left animate-in fade-in slide-in-from-bottom-3 duration-500 fill-mode-both"
      style={{ animationDelay: `${Math.min(index, 5) * 40}ms` }}
    >
      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-[1.25rem] border border-border/60 bg-muted shadow-elevated transition-transform duration-300 group-active:scale-[0.98]">
        {a.flyer ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={a.flyer || "/placeholder.svg"}
            alt={`${a.title} flyer`}
            // The first row is what the user is waiting on, so it loads eagerly
            // and at high priority; everything below the fold stays lazy. Loading
            // every flyer lazily made the grid appear blank on arrival.
            loading={index < 4 ? "eager" : "lazy"}
            fetchPriority={index < 4 ? "high" : "auto"}
            // Intrinsic size gives the browser an aspect ratio before bytes
            // arrive, so the grid reserves space instead of reflowing per image.
            width={600}
            height={800}
            // Decode off the main thread so a batch of flyers resolving at once
            // can't block scrolling or the tab transition.
            decoding="async"
            className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          />
        ) : (
          <div className="flex size-full items-center justify-center bg-secondary text-muted-foreground">
            <CalendarPlus className="size-8" />
          </div>
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/45 to-transparent" />
        <span className="absolute bottom-2 left-2 rounded-full bg-background/85 px-2.5 py-1 text-xs font-semibold text-foreground shadow-soft backdrop-blur-md">
          {a.price ? `$${a.price}` : "Free"}
        </span>
      </div>
      <div className="mt-2 flex flex-col gap-0.5">
        <span className="flex items-center gap-1 text-[11px] font-medium text-primary">
          <CalendarPlus className="size-3" />
          {formatEventDate(a.eventDate ?? "", a.eventTime)}
        </span>
        <h3 className="truncate text-sm font-semibold leading-snug text-foreground">{a.title}</h3>
        <p className="truncate text-xs text-muted-foreground">{a.creatorName}</p>
        {a.comingCount > 0 && (
          <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
            <Users className="size-3" />
            {a.comingCount} {a.comingCount === 1 ? "person" : "people"} coming
          </span>
        )}
      </div>
    </button>
  )
}

/**
 * Full-screen detail sheet for a single event: large flyer, all the details,
 * add-to-calendar shortcuts, and the interest actions (for non-owners).
 */
function EventDetailSheet({
  event: a,
  isAdmin = false,
  onClose,
}: {
  event: AnnouncementView
  isAdmin?: boolean
  onClose: () => void
}) {
  const [lightbox, setLightbox] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [deleting, startDeleting] = useTransition()
  const [error, setError] = useState<string | null>(null)

  if (typeof document === "undefined") return null

  function handleRsvp(response: "coming" | "not_coming") {
    setError(null)
    startTransition(async () => {
      try {
        await rsvpToEvent({ id: a.id, response })
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.")
      }
    })
  }

  function handleOwnerDelete() {
    setError(null)
    startDeleting(async () => {
      try {
        await orgDeleteEvent(a.id)
        onClose()
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not delete this event.")
      }
    })
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={a.title}
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-background/90 p-4 backdrop-blur-sm sm:items-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <Card className="relative my-auto w-full max-w-md overflow-hidden p-0" onClick={(e) => e.stopPropagation()}>
        {/* Flyer */}
        {a.flyer ? (
          <button
            type="button"
            onClick={() => setLightbox(true)}
            className="relative block aspect-[3/4] w-full overflow-hidden bg-secondary"
            aria-label={`View ${a.title} flyer full screen`}
          >
            <Image
              src={a.flyer || "/placeholder.svg"}
              alt={`${a.title} flyer`}
              fill
              className="object-cover"
              unoptimized={a.flyer.startsWith("data:")}
              sizes="448px"
            />
          </button>
        ) : (
          <div className="flex aspect-[3/4] w-full items-center justify-center bg-secondary text-muted-foreground">
            <CalendarPlus className="size-10" />
          </div>
        )}

        {/* Overlay chrome on the flyer */}
        <Button
          size="icon"
          variant="ghost"
          className="absolute left-3 top-3 bg-background/70 backdrop-blur hover:bg-background"
          aria-label="Close"
          onClick={onClose}
        >
          <X className="size-4" />
        </Button>
        <div className="pointer-events-none absolute left-3 top-14 flex flex-col gap-1.5">
          <Badge className="w-fit gap-1 bg-background/75 text-foreground backdrop-blur">
            <CalendarPlus className="size-3" /> Event
          </Badge>
          <Badge className="w-fit gap-1 bg-background/75 text-foreground backdrop-blur">
            <Tag className="size-3" /> {a.price ? `$${a.price}` : "Free"}
          </Badge>
        </div>

        <div className="space-y-4 p-5">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold leading-tight text-balance">{a.title}</h2>
            <p className="text-sm text-muted-foreground">by {a.creatorName}</p>
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <CalendarPlus className="size-4 shrink-0 text-primary" />
              <span className="font-medium">{formatEventDate(a.eventDate ?? "", a.eventTime)}</span>
            </div>
            {a.location && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <MapPin className="size-4 shrink-0" /> {a.location}
              </div>
            )}
            <div className="flex items-center gap-2">
              <Tag className="size-4 shrink-0 text-primary" />
              <span className="font-medium">{a.price ? `$${a.price} entry` : "Free entry"}</span>
            </div>
          </div>

          {a.description && (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{a.description}</p>
          )}

          {!a.isOwner && (
            /* Members RSVP; tapping the active choice again clears it. */
            <div className="flex items-center gap-2">
              <Button
                variant={a.myRsvp === "not_coming" ? "default" : "outline"}
                className="flex-1 gap-1.5"
                disabled={isPending}
                aria-pressed={a.myRsvp === "not_coming"}
                onClick={() => handleRsvp("not_coming")}
              >
                <X className="size-4" /> I can&apos;t make it
              </Button>
              <Button
                variant={a.myRsvp === "coming" ? "default" : "outline"}
                className="flex-1 gap-1.5"
                disabled={isPending}
                aria-pressed={a.myRsvp === "coming"}
                onClick={() => handleRsvp("coming")}
              >
                {isPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                I&apos;m coming
              </Button>
            </div>
          )}

          {/* The publishing org admin can remove their event straight from here. */}
          {a.isOwner && (
            <Button
              variant="outline"
              className="w-full gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10"
              disabled={deleting}
              onClick={handleOwnerDelete}
            >
              {deleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              Delete event
            </Button>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        {/* Platform-admin three-dot menu (delete / message creator) */}
        {isAdmin && <AdminMenu announcement={a} />}
      </Card>

      {lightbox && a.flyer && (
        <ImageLightbox src={a.flyer} alt={`${a.title} flyer`} onClose={() => setLightbox(false)} />
      )}
    </div>,
    document.body,
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
        <p className="text-xs text-muted-foreground">
          {r.adType === "product" ? `$${r.price}` : formatEventDate(r.eventDate ?? "", r.eventTime)}
        </p>
        {r.status === "declined" && r.declineReason && (
          <p className="mt-0.5 text-xs text-destructive">{r.declineReason}</p>
        )}
        {r.status === "pending" && (
          <p className="mt-0.5 text-xs text-muted-foreground">Awaiting approval.</p>
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

/** Admin-only top-right menu: delete the advert, or DM the creator as Frequency Team. */
function AdminMenu({ announcement: a }: { announcement: AnnouncementView }) {
  const [open, setOpen] = useState(false)
  const [composing, setComposing] = useState(false)
  const [isPending, startTransition] = useTransition()

  return (
    <div className="absolute right-2 top-2 z-20">
      <Button
        size="icon"
        variant="ghost"
        className="size-8 bg-background/70 backdrop-blur hover:bg-background"
        aria-label="Advert options"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <MoreVertical className="size-4" />
      </Button>
      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-10 cursor-default"
            aria-hidden="true"
            onClick={() => setOpen(false)}
          />
          <div
            role="menu"
            className="absolute right-0 top-full z-20 mt-1 w-44 overflow-hidden rounded-xl border border-border bg-popover p-1 shadow-lg"
          >
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium hover:bg-secondary"
              onClick={() => {
                setOpen(false)
                setComposing(true)
              }}
            >
              <MessageSquare className="size-4" /> Message
            </button>
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-60"
              disabled={isPending}
              onClick={() => startTransition(() => adminDeleteAnnouncement(a.id))}
            >
              {isPending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />} Delete
            </button>
          </div>
        </>
      )}
      {composing && <AdminMessageDialog announcement={a} onClose={() => setComposing(false)} />}
    </div>
  )
}

function AdminMessageDialog({ announcement: a, onClose }: { announcement: AnnouncementView; onClose: () => void }) {
  const [body, setBody] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [isPending, startTransition] = useTransition()

  if (typeof document === "undefined") return null

  function handleSend() {
    setError(null)
    startTransition(async () => {
      try {
        await adminMessageCreator({ announcementId: a.id, body })
        setSent(true)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not send the message.")
      }
    })
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Message the advert creator"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-background/90 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <Card className="w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <MessageSquare className="size-4" />
            </span>
            <div className="leading-tight">
              <h2 className="font-semibold">Message {a.creatorName}</h2>
              <p className="text-xs text-muted-foreground">Sent as Frequency Team · priority in their inbox</p>
            </div>
          </div>
          <Button size="icon" variant="ghost" className="shrink-0" aria-label="Close" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>

        {sent ? (
          <div className="flex flex-col items-center gap-4 py-4 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-live/10 text-live">
              <Check className="size-6" />
            </span>
            <p className="text-sm text-muted-foreground">
              Your message was delivered to {a.creatorName} as Frequency Team.
            </p>
            <Button onClick={onClose}>Done</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={`Re: "${a.title}" — your message to the creator…`}
              rows={4}
              maxLength={1000}
              autoFocus
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex items-center justify-end gap-2">
              <Button type="button" variant="ghost" onClick={onClose} disabled={isPending}>
                Cancel
              </Button>
              <Button className="gap-1.5" disabled={isPending || !body.trim()} onClick={handleSend}>
                {isPending ? <Loader2 className="size-4 animate-spin" /> : <MessageSquare className="size-4" />} Send
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>,
    document.body,
  )
}

function AdvertiseForm({ onClose }: { onClose: () => void }) {
  // Product adverts were removed — this form only publishes events.
  const adType: AdType = "event"
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [location, setLocation] = useState("")
  const [eventDate, setEventDate] = useState("")
  const [eventTime, setEventTime] = useState("")
  // Whether an event is free to attend or ticketed. `price` holds the ticket
  // amount when paid (and doubles as the product price for product adverts).
  const [eventPricing, setEventPricing] = useState<"free" | "paid">("free")
  const [price, setPrice] = useState("")
  // How the event should leave the feed once it's over.
  const [deleteMode, setDeleteMode] = useState<EventDeleteMode>("auto5h")
  const [flyer, setFlyer] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ status: "approved" | "declined"; declineReason?: string } | null>(null)
  const [isPending, startTransition] = useTransition()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const today = new Date().toISOString().slice(0, 10)

  // Upload the original, full-size flyer untouched (like cover art in the audio
  // studio). The feed only crops it visually via object-cover; the stored file
  // stays whole so the lightbox shows the complete, uncropped flyer on click.
  async function handleFile(file: File) {
    setError(null)
    setUploading(true)
    try {
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
    if (!eventDate) return setError("Please pick an event date.")
    if (!eventTime) return setError("Please pick an event time.")
    if (!location.trim()) return setError("Please add the event venue.")
    if (eventPricing === "paid" && !price.trim()) {
      return setError("Please add the ticket price, or mark the event as free.")
    }
    // Send the ticket price only when the event is paid (free → null).
    const submittedPrice = eventPricing === "paid" ? price : null
    startTransition(async () => {
      try {
        const res = await createAnnouncement({
          adType,
          title,
          description,
          flyer,
          location,
          eventDate,
          eventTime,
          price: submittedPrice,
          deleteMode,
        })
        setResult(res)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not publish your event.")
      }
    })
  }

  if (typeof document === "undefined") return null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Advertise"
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-background/90 p-4 backdrop-blur-sm sm:items-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <Card className="my-auto w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Megaphone className="size-4" />
            </span>
            <div className="leading-tight">
              <h2 className="font-semibold">Publish an event</h2>
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
            {/* Flyer */}
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
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) void handleFile(file)
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
                  {flyer ? "Change image" : "Upload image"}
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
                rows={3}
                maxLength={400}
              />
            </div>

            {/* Date, time, venue (all required) */}
            <div className="space-y-4">
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
                      Time
                    </label>
                    <Input id="ann-time" type="time" value={eventTime} onChange={(e) => setEventTime(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-2">
                  <label htmlFor="ann-loc" className="text-sm font-medium">
                    Venue
                  </label>
                  <Input
                    id="ann-loc"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                  />
                </div>

                {/* Free vs paid entry. Paid reveals a ticket-price field. */}
                <div className="space-y-2">
                  <span className="text-sm font-medium">Entry</span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setEventPricing("free")}
                      aria-pressed={eventPricing === "free"}
                      className={cn(
                        "flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors",
                        eventPricing === "free"
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:bg-secondary",
                      )}
                    >
                      <Check className="size-4" /> Free
                    </button>
                    <button
                      type="button"
                      onClick={() => setEventPricing("paid")}
                      aria-pressed={eventPricing === "paid"}
                      className={cn(
                        "flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors",
                        eventPricing === "paid"
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:bg-secondary",
                      )}
                    >
                      <Tag className="size-4" /> Paid
                    </button>
                  </div>
                  {eventPricing === "paid" && (
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">
                        $
                      </span>
                      <Input
                        inputMode="decimal"
                        value={price}
                        onChange={(e) => setPrice(e.target.value)}
                        placeholder="Ticket price, e.g. 20"
                        className="pl-7"
                        maxLength={20}
                        aria-label="Ticket price"
                      />
                    </div>
                  )}
                </div>
            </div>

            {/* When should this event be removed from the feed? */}
            <div className="space-y-2">
              <span className="text-sm font-medium">Delete event</span>
              <div className="grid gap-2">
                <button
                  type="button"
                  onClick={() => setDeleteMode("auto5h")}
                  aria-pressed={deleteMode === "auto5h"}
                  className={cn(
                    "flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
                    deleteMode === "auto5h"
                      ? "border-primary bg-primary/10"
                      : "border-border hover:bg-secondary",
                  )}
                >
                  <Clock className={cn("mt-0.5 size-4 shrink-0", deleteMode === "auto5h" ? "text-primary" : "text-muted-foreground")} />
                  <span className="space-y-0.5">
                    <span className="block text-sm font-medium">5 hours after it starts</span>
                    <span className="block text-xs text-muted-foreground">Removed automatically once the event is over.</span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteMode("manual")}
                  aria-pressed={deleteMode === "manual"}
                  className={cn(
                    "flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
                    deleteMode === "manual"
                      ? "border-primary bg-primary/10"
                      : "border-border hover:bg-secondary",
                  )}
                >
                  <Trash2 className={cn("mt-0.5 size-4 shrink-0", deleteMode === "manual" ? "text-primary" : "text-muted-foreground")} />
                  <span className="space-y-0.5">
                    <span className="block text-sm font-medium">Keep until I delete it</span>
                    <span className="block text-xs text-muted-foreground">Stays on the feed until you remove it yourself.</span>
                  </span>
                </button>
              </div>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex items-center justify-end gap-2">
              <Button type="button" variant="ghost" onClick={onClose} disabled={isPending}>
                Cancel
              </Button>
              <Button type="submit" className="gap-1.5" disabled={isPending || uploading}>
                {isPending ? <Loader2 className="size-4 animate-spin" /> : <CalendarPlus className="size-4" />}
                {isPending ? "Publishing…" : "Publish event"}
              </Button>
            </div>
          </form>
        )}
      </Card>
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
        <h3 className="font-semibold">{approved ? "Your event is published!" : "Couldn't publish"}</h3>
        <p className="text-sm text-muted-foreground text-pretty">
          {approved
            ? "It's now live in the Events feed and your members can say whether they're coming."
            : result.declineReason || "Something went wrong publishing your event. Please try again."}
        </p>
      </div>
      <Button onClick={onClose}>Done</Button>
    </div>
  )
}
