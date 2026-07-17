"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { createPortal } from "react-dom"
import Image from "next/image"
import {
  CalendarPlus,
  Check,
  Clock,
  Eye,
  EyeOff,
  ImageIcon,
  Loader2,
  MapPin,
  Megaphone,
  MessageSquare,
  MoreVertical,
  Plus,
  Sparkles,
  Tag,
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
  adminDeleteAnnouncement,
  adminMessageCreator,
  createAnnouncement,
  deleteAnnouncement,
  interactWithAnnouncement,
  setAnnouncementHidden,
  setOwnAnnouncementHidden,
  type AnnouncementView,
} from "@/app/actions/announcements"
import { AD_BLOCK_HOURS, AD_MAX_HOURS, priceForHours, type AdType } from "@/lib/ads"
import { formatEventDate } from "@/lib/calendar"
import type { CurrentUser } from "@/lib/session"
import { cn } from "@/lib/utils"
import { uploadMedia } from "@/lib/upload-media"

/** localStorage key for the collapsed-promo viewer preference. */
const AD_PROMO_HIDDEN_KEY = "freq:ad-promo-hidden"

export function AnnouncementBanner({
  announcements,
  myRequests,
  currentUser,
  isAdmin = false,
}: {
  announcements: AnnouncementView[]
  myRequests: AnnouncementView[]
  currentUser: CurrentUser | null
  isAdmin?: boolean
}) {
  const [showForm, setShowForm] = useState(false)

  // Hide/unhide only applies to the empty promo (i.e. when no advert is
  // running). It's a lightweight viewer preference kept in localStorage so the
  // collapsed state sticks across reloads.
  const [promoHidden, setPromoHidden] = useState(false)
  useEffect(() => {
    try {
      setPromoHidden(localStorage.getItem(AD_PROMO_HIDDEN_KEY) === "1")
    } catch {
      /* localStorage unavailable — fall back to shown */
    }
  }, [])
  function setHidden(hidden: boolean) {
    setPromoHidden(hidden)
    try {
      localStorage.setItem(AD_PROMO_HIDDEN_KEY, hidden ? "1" : "0")
    } catch {
      /* ignore */
    }
  }

  // Pending/declined requests still worth surfacing to their owner (approved
  // ones already appear in the public list above).
  const trackable = myRequests.filter((r) => r.status !== "approved")

  // Only one live advert is allowed at a time. When one is already running, the
  // "Advertise" entry point is hidden so a second cannot be created.
  const slotTaken = announcements.length > 0

  // When there's no advert and the viewer collapsed the promo, show a slim bar
  // with a control to bring it back.
  if (!slotTaken && promoHidden) {
    return (
      <section aria-label="Announcements" className="space-y-3">
        <div className="mx-4 flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-card/50 px-4 py-2.5 sm:mx-0">
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <Megaphone className="size-3.5" /> Announcements hidden
          </span>
          <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => setHidden(false)}>
            <Eye className="size-3.5" /> Show
          </Button>
        </div>
        {trackable.length > 0 && (
          <div className="space-y-2 px-4 sm:px-0">
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

  return (
    <section aria-label="Announcements" className="space-y-3">
      <div className="flex items-center justify-between gap-3 px-4 sm:px-0">
        <div className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-md bg-foreground/10 text-foreground">
            <Megaphone className="size-4" />
          </span>
          <div className="leading-tight">
            <h2 className="text-sm font-semibold">Announcements</h2>
            <p className="text-xs text-muted-foreground">Promoted events &amp; products from creators</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {currentUser && !slotTaken && (
            <Button size="sm" variant="secondary" className="gap-1.5" onClick={() => setShowForm(true)}>
              <Plus className="size-4" /> Advertise here
            </Button>
          )}
          {!slotTaken && (
            <Button
              size="icon"
              variant="ghost"
              className="text-muted-foreground"
              aria-label="Hide announcements"
              onClick={() => setHidden(true)}
            >
              <EyeOff className="size-4" />
            </Button>
          )}
        </div>
      </div>

      {announcements.length > 0 ? (
        <>
          <div className="flex flex-col">
            {announcements.map((a) => (
              <AnnouncementCard key={a.id} announcement={a} isAdmin={isAdmin} />
            ))}
          </div>
        </>
      ) : (
        <Card className="mx-4 flex flex-col items-center gap-3 border-dashed bg-card/50 p-6 text-center sm:mx-0">
          <Sparkles className="size-6 text-primary" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-balance">Promote your event or product to the whole community</p>
            <p className="text-xs text-muted-foreground text-pretty">
              Feature your flyer here. Interested listeners can reach out to you directly.
            </p>
          </div>
          {currentUser ? (
            <Button size="sm" className="gap-1.5" onClick={() => setShowForm(true)}>
              <Megaphone className="size-4" /> Advertise here
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">Sign in to advertise.</p>
          )}
        </Card>
      )}

      {/* Owner's request tracker: pending + declined */}
      {trackable.length > 0 && (
        <div className="space-y-2 px-4 sm:px-0">
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

/** A short, type-aware summary line (date/venue for events, price for products). */
function AdMeta({ a }: { a: AnnouncementView }) {
  if (a.adType === "product") {
    return (
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5 font-semibold text-foreground">
          <Tag className="size-3.5 text-primary" />${a.price}
        </span>
      </div>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5 font-medium text-foreground">
        <CalendarPlus className="size-3.5 text-primary" />
        {formatEventDate(a.eventDate ?? "", a.eventTime)}
      </span>
      {a.location && (
        <span className="flex items-center gap-1.5">
          <MapPin className="size-3.5" /> {a.location}
        </span>
      )}
      {/* Free vs ticketed entry. A null price means the event is free. */}
      <span className="flex items-center gap-1.5 font-semibold text-foreground">
        <Tag className="size-3.5 text-primary" />
        {a.price ? `$${a.price}` : "Free"}
      </span>
    </div>
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

function AnnouncementCard({ announcement: a, isAdmin = false }: { announcement: AnnouncementView; isAdmin?: boolean }) {
  const [lightbox, setLightbox] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // Hidden state: collapsed bar with a control to bring the advert back. The
  // creator can always toggle their own; a viewer can toggle only after they've
  // interacted with one of the buttons.
  if (a.hiddenByMe) {
    return (
      <div className="mx-4 flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-card/40 px-5 py-4 sm:mx-0">
        <span className="flex items-center gap-3 whitespace-nowrap text-base text-muted-foreground">
          <Megaphone className="size-5 shrink-0" /> Announcements hidden
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="h-auto shrink-0 gap-2 p-0 text-base font-semibold text-foreground hover:bg-transparent"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              if (a.isOwner) await setOwnAnnouncementHidden({ id: a.id, hidden: false })
              else await setAnnouncementHidden({ id: a.id, hidden: false })
            })
          }
        >
          {isPending ? <Loader2 className="size-5 animate-spin" /> : <Eye className="size-5" />} Show
        </Button>
      </div>
    )
  }

  function handleInteract(action: "interested" | "not_interested") {
    setError(null)
    startTransition(async () => {
      try {
        await interactWithAnnouncement({ id: a.id, action })
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.")
      }
    })
  }

  function handleHide() {
    startTransition(async () => {
      if (a.isOwner) await setOwnAnnouncementHidden({ id: a.id, hidden: true })
      else await setAnnouncementHidden({ id: a.id, hidden: true })
    })
  }

  // The creator never sees the interest buttons. Viewers see them only until
  // they've interacted; after that (or for the creator) we show a hide toggle.
  const showInterestButtons = !a.isOwner && a.myAction === null

  return (
    <div className="relative flex w-full flex-col overflow-hidden border-y border-border/60 bg-card sm:flex-row sm:items-stretch">
      {/* Flyer */}
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
            <Megaphone className="size-3" /> {a.adType === "product" ? "Product" : "Event"}
          </Badge>
        </button>
      ) : (
        <div className="flex aspect-[16/9] w-full shrink-0 items-center justify-center bg-secondary sm:aspect-auto sm:w-56 md:w-64">
          <Badge className="gap-1">
            <Megaphone className="size-3" /> {a.adType === "product" ? "Product" : "Event"}
          </Badge>
        </div>
      )}

      {/* Info + actions */}
      <div className="flex flex-1 flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <div className="min-w-0 flex-1 space-y-1">
          {/* Reserve room so the admin menu never overlaps the title */}
          <h3 className="font-semibold leading-tight text-balance sm:pr-0 pr-8">{a.title}</h3>
          {a.description && (
            <p className="line-clamp-2 text-sm text-muted-foreground leading-relaxed">{a.description}</p>
          )}
          <AdMeta a={a} />
        </div>

        <div className="shrink-0 sm:w-56">
          {showInterestButtons ? (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="flex-1 gap-1.5"
                disabled={isPending}
                onClick={() => handleInteract("not_interested")}
              >
                <X className="size-4" /> Not interested
              </Button>
              <Button
                size="sm"
                className="flex-1 gap-1.5"
                disabled={isPending}
                onClick={() => handleInteract("interested")}
              >
                {isPending ? <Loader2 className="size-4 animate-spin" /> : <MessageSquare className="size-4" />}
                Want to know more
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="secondary" className="w-full gap-1.5" disabled={isPending} onClick={handleHide}>
              {isPending ? <Loader2 className="size-4 animate-spin" /> : <EyeOff className="size-4" />} Hide advert
            </Button>
          )}
          {error && <p className="mt-1.5 text-xs text-destructive">{error}</p>}
        </div>
      </div>

      {/* Platform-admin three-dot menu (delete / message creator) */}
      {isAdmin && <AdminMenu announcement={a} />}

      {lightbox && a.flyer && (
        <ImageLightbox src={a.flyer} alt={`${a.title} flyer`} onClose={() => setLightbox(false)} />
      )}
    </div>
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
            <span className="flex size-8 items-center justify-center rounded-md bg-primary/10 text-primary">
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

const DURATION_OPTIONS = Array.from({ length: AD_MAX_HOURS / AD_BLOCK_HOURS }, (_, i) => (i + 1) * AD_BLOCK_HOURS)

function AdvertiseForm({ onClose }: { onClose: () => void }) {
  const [adType, setAdType] = useState<AdType>("event")
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [location, setLocation] = useState("")
  const [eventDate, setEventDate] = useState("")
  const [eventTime, setEventTime] = useState("")
  // Whether an event is free to attend or ticketed. `price` holds the ticket
  // amount when paid (and doubles as the product price for product adverts).
  const [eventPricing, setEventPricing] = useState<"free" | "paid">("free")
  const [price, setPrice] = useState("")
  const [durationHours, setDurationHours] = useState(AD_BLOCK_HOURS)
  const [flyer, setFlyer] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ status: "approved" | "declined"; declineReason?: string } | null>(null)
  const [isPending, startTransition] = useTransition()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const today = new Date().toISOString().slice(0, 10)
  const totalPrice = priceForHours(durationHours)
  const isEvent = adType === "event"

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
      setError(isEvent ? "Please add an event title." : "Please add a product name.")
      return
    }
    if (isEvent) {
      if (!eventDate) return setError("Please pick an event date.")
      if (!eventTime) return setError("Please pick an event time.")
      if (!location.trim()) return setError("Please add the event venue.")
      if (eventPricing === "paid" && !price.trim()) {
        return setError("Please add the ticket price, or mark the event as free.")
      }
    } else if (!price.trim()) {
      return setError("Please add the product price.")
    }
    // Events: send the ticket price only when paid (free → null). Products
    // always send their price.
    const submittedPrice = isEvent ? (eventPricing === "paid" ? price : null) : price
    startTransition(async () => {
      try {
        const res = await createAnnouncement({
          adType,
          title,
          description,
          flyer,
          location: isEvent ? location : null,
          eventDate: isEvent ? eventDate : null,
          eventTime: isEvent ? eventTime : null,
          price: submittedPrice,
          durationHours,
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
      aria-label="Advertise"
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-background/90 p-4 backdrop-blur-sm sm:items-center"
      onClick={(e) => {
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
              <h2 className="font-semibold">Create an advert</h2>
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
            {/* Mandatory advert-type choice */}
            <div className="space-y-2">
              <span className="text-sm font-medium">What are you advertising?</span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setAdType("event")}
                  aria-pressed={isEvent}
                  className={cn(
                    "flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors",
                    isEvent
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-secondary",
                  )}
                >
                  <CalendarPlus className="size-4" /> Event
                </button>
                <button
                  type="button"
                  onClick={() => setAdType("product")}
                  aria-pressed={!isEvent}
                  className={cn(
                    "flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors",
                    !isEvent
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-secondary",
                  )}
                >
                  <Tag className="size-4" /> Product
                </button>
              </div>
            </div>

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
                <p className="text-sm font-medium">{isEvent ? "Event flyer" : "Product image"}</p>
                <p className="text-xs text-muted-foreground">
                  The box shows a preview; your full flyer is kept and shown when tapped.
                </p>
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
                {isEvent ? "Event title" : "Product name"}
              </label>
              <Input
                id="ann-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={isEvent ? "e.g. Summer Worship Night" : "e.g. Hand-bound Study Journal"}
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
                placeholder={
                  isEvent
                    ? "Tell people what to expect, who's hosting, ticket info…"
                    : "Describe your product, what's included, how to buy…"
                }
                rows={3}
                maxLength={400}
              />
            </div>

            {/* Event-only: date, time, venue (all required) */}
            {isEvent ? (
              <>
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
                    placeholder="e.g. Online, or 123 Main St"
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
              </>
            ) : (
              /* Product-only: price (required) */
              <div className="space-y-2">
                <label htmlFor="ann-price" className="text-sm font-medium">
                  Price
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">
                    $
                  </span>
                  <Input
                    id="ann-price"
                    inputMode="decimal"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="49.99"
                    className="pl-7"
                    maxLength={20}
                  />
                </div>
              </div>
            )}

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
                $5 per {AD_BLOCK_HOURS} hours, up to {AD_MAX_HOURS} hours. Your advert auto-expires when the time is up.
              </p>
            </div>

            {/* Paid placement summary */}
            <div className="rounded-lg border border-border bg-secondary/50 p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Total due</span>
                <span className="text-sm font-semibold">${totalPrice}</span>
              </div>
              <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                <li className="flex items-center gap-1.5">
                  <Check className="size-3 text-primary" /> Reviewed on a first-come, first-served basis
                </li>
                <li className="flex items-center gap-1.5">
                  <Check className="size-3 text-primary" /> Interested listeners message you directly
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
                {isPending ? "Submitting…" : `Pay $${totalPrice} & submit`}
              </Button>
            </div>
            <p className="text-center text-[11px] text-muted-foreground">Demo checkout — no real payment is processed.</p>
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
        <h3 className="font-semibold">{approved ? "Your advert is published!" : "Request declined"}</h3>
        <p className="text-sm text-muted-foreground text-pretty">
          {approved
            ? "It's now live at the top of the feed and will disappear automatically when your run time is up."
            : result.declineReason || "Declined due to high demand for the selected slot."}
        </p>
      </div>
      <Button onClick={onClose}>Done</Button>
    </div>
  )
}
