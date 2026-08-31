"use client"

import { useMemo, useRef, useState, useTransition } from "react"
import { createPortal } from "react-dom"
import Image from "next/image"
import {
  Bookmark,
  CalendarDays,
  CalendarPlus,
  Check,
  ClipboardList,
  Clock,
  ImageIcon,
  Loader2,
  MapPin,
  Megaphone,
  MoreHorizontal,
  MoreVertical,
  Pencil,
  Plus,
  Share2,
  Tag,
  Trash2,
  X,
} from "lucide-react"
import Link from "next/link"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { ImageLightbox } from "@/components/image-lightbox"
import {
  adminDeleteAnnouncement,
  createAnnouncement,
  deleteAnnouncement,
  orgDeleteEvent,
  orgUpdateEvent,
  type AnnouncementView,
  type EventDeleteMode,
} from "@/app/actions/announcements"
import { type AdType } from "@/lib/ads"
import { formatEventDate } from "@/lib/calendar"
import type { CurrentUser } from "@/lib/session"
import { cn } from "@/lib/utils"
import { uploadMedia } from "@/lib/upload-media"

/* ---------------------------------------------------------------------------
 * Date grouping for the premium events list
 *
 * The feed only ever holds approved, unexpired events (see getActiveAnnouncements),
 * so there's no "past" bucket here — every card is upcoming. We group by how soon
 * the event is (Today / Tomorrow / This Week / Later), mirroring the public
 * /events/[handle] browser so the two surfaces feel like one product.
 * ------------------------------------------------------------------------- */

type FeedGroupKey = "today" | "tomorrow" | "week" | "later"

const FEED_GROUP_LABELS: Record<FeedGroupKey, string> = {
  today: "Today",
  tomorrow: "Tomorrow",
  week: "This Week",
  later: "Later",
}

const FEED_GROUP_ORDER: FeedGroupKey[] = ["today", "tomorrow", "week", "later"]

const FEED_MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]
const FEED_DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

/** Local midnight for a YYYY-MM-DD string, avoiding UTC parse drift. */
function feedMidnight(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number)
  return new Date(y, m - 1, d)
}

/** Whole days from today's midnight to the event's midnight (negative = past). */
function feedDaysFromToday(dateStr: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((feedMidnight(dateStr).getTime() - today.getTime()) / 86_400_000)
}

/** Which section an event belongs in; undated events fall to "Later". */
function feedBucket(dateStr: string | null): FeedGroupKey {
  if (!dateStr) return "later"
  const d = feedDaysFromToday(dateStr)
  if (d <= 0) return "today"
  if (d === 1) return "tomorrow"
  if (d <= 7) return "week"
  return "later"
}

/** { mon, day, dow } for the date block; a gentle placeholder when undated. */
function feedDateParts(dateStr: string | null): { mon: string; day: string; dow: string } {
  if (!dateStr) return { mon: "—", day: "··", dow: "TBC" }
  const d = feedMidnight(dateStr)
  return { mon: FEED_MONTHS[d.getMonth()], day: String(d.getDate()), dow: FEED_DOW[d.getDay()] }
}

export function AnnouncementBanner({
  announcements,
  myRequests,
  currentUser,
  isAdmin = false,
  canPublish = false,
  home = null,
}: {
  announcements: AnnouncementView[]
  myRequests: AnnouncementView[]
  currentUser: CurrentUser | null
  isAdmin?: boolean
  // Whether the viewer may publish events (organisation owner/admin). Members
  // can browse and register but never see the publish entry points.
  canPublish?: boolean
  // The active Home's organisation identity, shown in the header so members can
  // tell at a glance whose events they're looking at. Null in Personal mode or
  // when the viewer has no Home.
  home?: {
    name: string
    logo: string | null
    initials: string
    color: string
    categoryLabel: string
  } | null
}) {
  const [showForm, setShowForm] = useState(false)
  // The id of the event whose detail sheet is open (opened by tapping a card).
  const [openId, setOpenId] = useState<number | null>(null)
  // The id of the event being edited (opened from a card's "…" manage menu).
  const [editId, setEditId] = useState<number | null>(null)
  // Cosmetic saved/bookmark state per card (matches the public browser). Purely
  // client-side for now — bookmarking has no server model yet.
  const [saved, setSaved] = useState<Record<number, boolean>>({})

  // Pending/declined requests still worth surfacing to their owner.
  const trackable = myRequests.filter((r) => r.status !== "approved")

  // Every approved, unexpired event the viewer hasn't dismissed fills the grid.
  const events = announcements.filter((a) => !a.hiddenByMe)

  // Resolve the open card against the freshest server data so interactions
  // (which revalidate the feed) reflect immediately; close it if it's gone.
  const openEvent = openId != null ? announcements.find((e) => e.id === openId) ?? null : null
  const editEvent = editId != null ? announcements.find((e) => e.id === editId) ?? null : null

  // Bucket every visible event into its date section, preserving the server's
  // ascending-by-date order within each section.
  const grouped = useMemo(() => {
    const groups: Record<FeedGroupKey, AnnouncementView[]> = { today: [], tomorrow: [], week: [], later: [] }
    for (const a of events) groups[feedBucket(a.eventDate)].push(a)
    return groups
  }, [events])
  const visibleGroups = FEED_GROUP_ORDER.filter((g) => grouped[g].length > 0)

  return (
    <section aria-label="Events" className="space-y-4 pb-4">
      {/* Header: the active Home's identity, then the section title on one line */}
      <div className="px-4 sm:px-0">
        <div className="flex items-center justify-between gap-3">
          {home ? (
            <div className="flex min-w-0 items-center gap-3">
              <span
                aria-hidden="true"
                className="relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full text-sm font-bold uppercase text-white shadow-[0_0_20px_-6px] shadow-primary/60 ring-2 ring-primary/30"
                style={{ backgroundColor: home.color }}
              >
                {home.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={home.logo || "/placeholder.svg"} alt="" className="size-full object-cover" />
                ) : (
                  home.initials
                )}
              </span>
              <div className="min-w-0 leading-tight">
                <p className="truncate text-[15px] font-semibold tracking-tight">{home.name}</p>
                <p className="truncate text-xs text-muted-foreground">{home.categoryLabel}</p>
              </div>
            </div>
          ) : (
            <span className="text-sm font-medium text-muted-foreground">Your events</span>
          )}
          {canPublish && (
            <Button size="sm" className="shrink-0 gap-1.5" onClick={() => setShowForm(true)}>
              <Plus className="size-4" /> Publish
            </Button>
          )}
        </div>

        <div className="mt-4 flex items-center gap-2.5">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-[0_0_22px_-4px] shadow-primary/60">
            <CalendarDays className="size-6" />
          </span>
          <h2 className="whitespace-nowrap text-2xl font-bold tracking-tight">Upcoming events</h2>
        </div>
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

      {/* Premium grouped sections: Today / Tomorrow / This Week / Later. */}
      {events.length > 0 ? (
        <div className="space-y-7 px-4 sm:px-0">
          {visibleGroups.map((g) => (
            <section key={g} aria-label={FEED_GROUP_LABELS[g]}>
              <div className="mb-3 flex items-center gap-2">
                <CalendarDays className="size-4 text-primary" />
                <h3 className="text-base font-semibold tracking-tight">{FEED_GROUP_LABELS[g]}</h3>
                <span className="grid h-5 min-w-5 place-items-center rounded-full bg-secondary px-1.5 text-xs font-semibold tabular-nums text-muted-foreground">
                  {grouped[g].length}
                </span>
              </div>
              <ul className="grid grid-cols-1 gap-3">
                {grouped[g].map((a, i) => (
                  <li key={a.id}>
                    <EventGridCard
                      event={a}
                      index={i}
                      isAdmin={isAdmin}
                      saved={Boolean(saved[a.id])}
                      onToggleSave={() => setSaved((s) => ({ ...s, [a.id]: !s[a.id] }))}
                      onOpen={() => setOpenId(a.id)}
                      onEdit={() => setEditId(a.id)}
                    />
                  </li>
                ))}
              </ul>
            </section>
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
      {editEvent && <AdvertiseForm event={editEvent} onClose={() => setEditId(null)} />}
      {openEvent && <EventDetailSheet event={openEvent} isAdmin={isAdmin} onClose={() => setOpenId(null)} />}
    </section>
  )
}

/**
 * Premium horizontal event card: poster + date block + title/meta, with a
 * prominent Register CTA. The poster/meta region opens the full detail sheet
 * (delete, share, description, add-to-calendar); the Register button jumps
 * straight to the public registration page. Mirrors the public /events browser
 * so the in-feed tab and the shareable page feel like the same product.
 */
function EventGridCard({
  event: a,
  index = 0,
  isAdmin = false,
  saved,
  onToggleSave,
  onOpen,
  onEdit,
}: {
  event: AnnouncementView
  index?: number
  isAdmin?: boolean
  saved: boolean
  onToggleSave: () => void
  onOpen: () => void
  onEdit: () => void
}) {
  const { mon, day, dow } = feedDateParts(a.eventDate)
  // Public detail page for this event. `from=events` tells that page to send the
  // Back button to this Upcoming events preview (where this banner lives) rather
  // than the per-org public browser the viewer never visited. Universal events
  // have no host handle and thus no public page — those fall back to the in-app
  // detail sheet.
  const href = a.homeHandle ? `/events/${a.homeHandle}/${a.id}?from=events` : null
  // Members register; owners manage via the detail sheet instead.
  const canRegister = a.registrationEnabled && Boolean(href) && !a.isOwner

  // Tapping the card body (poster + meta) — everything except Register and the
  // "…" menu — opens the full cinematic detail page. Only handle-less events
  // still open the lightweight sheet, since they have no page to open.
  const bodyClassName = "flex gap-3 text-left"
  const bodyLabel = `View details for ${a.title}`
  const cardBody = (
    <>
      {/* Poster thumbnail */}
      <div className="relative aspect-[3/4] w-20 shrink-0 overflow-hidden rounded-xl border border-border/60 bg-muted">
        {a.flyer ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={a.flyer || "/placeholder.svg"}
            alt={`${a.title} flyer`}
            loading={index < 4 ? "eager" : "lazy"}
            fetchPriority={index < 4 ? "high" : "auto"}
            width={300}
            height={400}
            decoding="async"
            className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          />
        ) : (
          <div className="flex size-full items-center justify-center bg-secondary text-muted-foreground">
            <CalendarPlus className="size-6" />
          </div>
        )}
      </div>

      {/* Date block */}
      <div className="flex w-14 shrink-0 flex-col items-center justify-center rounded-xl border border-border bg-secondary/40 py-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-primary">{mon}</span>
        <span className="text-2xl font-bold leading-none">{day}</span>
        <span className="mt-0.5 text-[11px] font-medium text-muted-foreground">{dow}</span>
      </div>

      {/* Title + meta (leave room for the bookmark, top-right) */}
      <div className="flex min-w-0 flex-1 flex-col pr-7">
        <h3 className="text-[15px] font-semibold leading-snug text-balance">{a.title}</h3>
        <p className="mt-1 flex items-center gap-1.5 text-[13px] text-muted-foreground">
          <CalendarPlus className="size-3.5 shrink-0 text-primary/80" />
          <span className="truncate">{formatEventDate(a.eventDate ?? "", a.eventTime)}</span>
        </p>
        {a.location && (
          <p className="mt-1 flex items-center gap-1.5 text-[13px] text-muted-foreground">
            <MapPin className="size-3.5 shrink-0" />
            <span className="truncate">{a.location}</span>
          </p>
        )}
        <p className="mt-1 truncate text-xs text-muted-foreground">{a.creatorName}</p>
      </div>
    </>
  )

  return (
    <div
      className="group relative flex flex-col gap-3 rounded-[18px] border border-border bg-card p-3 transition-all duration-300 hover:border-primary/40 hover:shadow-[0_0_28px_-8px] hover:shadow-primary/40 animate-in fade-in slide-in-from-bottom-3 fill-mode-both"
      style={{ animationDelay: `${Math.min(index, 5) * 40}ms` }}
    >
      {href ? (
        <Link href={href} aria-label={bodyLabel} className={bodyClassName}>
          {cardBody}
        </Link>
      ) : (
        <button type="button" onClick={onOpen} aria-label={bodyLabel} className={bodyClassName}>
          {cardBody}
        </button>
      )}

      {/* Bookmark — layered above the card button, top-right */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onToggleSave()
        }}
        aria-label={saved ? `Remove ${a.title} from saved` : `Save ${a.title}`}
        aria-pressed={saved}
        className="absolute right-2 top-2 grid size-8 place-items-center rounded-full text-muted-foreground transition-colors hover:text-primary"
      >
        <Bookmark className={cn("size-[18px]", saved && "fill-primary text-primary")} />
      </button>

      {/* Action row */}
      <div className="flex items-center gap-2 border-t border-border/60 pt-3">
        <EventCardMenu event={a} isAdmin={isAdmin} onEdit={onEdit} onOpen={onOpen} />

        {canRegister && href ? (
          <Link
            href={href}
            aria-label={`View details for ${a.title}`}
            className="flex h-9 flex-1 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground shadow-[0_0_20px_-6px] shadow-primary/70 transition-all duration-200 hover:brightness-110 active:scale-[0.98]"
          >
            Info
          </Link>
        ) : href ? (
          <Link
            href={href}
            aria-label={`View details for ${a.title}`}
            className="flex h-9 flex-1 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-sm font-semibold text-primary transition-colors hover:border-primary/50 hover:bg-primary/15"
          >
            View details
          </Link>
        ) : (
          <button
            type="button"
            onClick={onOpen}
            className="flex h-9 flex-1 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-sm font-semibold text-primary transition-colors hover:border-primary/50 hover:bg-primary/15"
          >
            View details
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * The leading control on each feed card's action row.
 *
 *  • Managers (the event's creator, or a platform admin) get a "…" menu with
 *    Edit, Share, and Delete. Edit is offered only to the creator, whose
 *    membership carries `events.manage`; the server action re-verifies that
 *    permission regardless, so this gate is purely cosmetic. Delete routes to
 *    the org-scoped deletion for the creator and the platform-wide deletion for
 *    an admin, and asks for confirmation first.
 *  • Everyone else (members / guests) gets a single Share button — no menu.
 *    Handle-less events have no public link to share, so they fall back to a
 *    plain "…" that opens the detail sheet.
 */
function EventCardMenu({
  event: a,
  isAdmin,
  onEdit,
  onOpen,
}: {
  event: AnnouncementView
  isAdmin: boolean
  onEdit: () => void
  onOpen: () => void
}) {
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const { share, copied, canShare } = useEventShare(a)

  const canManage = a.isOwner || isAdmin
  const iconBtn =
    "grid size-9 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground transition-colors hover:text-foreground"

  // Members / guests: a direct Share button, or a details fallback when the
  // event has no public link to share.
  if (!canManage) {
    if (!canShare) {
      return (
        <button type="button" onClick={onOpen} aria-label={`More options for ${a.title}`} className={iconBtn}>
          <MoreHorizontal className="size-4" />
        </button>
      )
    }
    return (
      <button
        type="button"
        onClick={share}
        aria-label={copied ? "Link copied" : `Share ${a.title}`}
        className={iconBtn}
      >
        {copied ? <Check className="size-4 text-live" /> : <Share2 className="size-4" />}
      </button>
    )
  }

  function handleDelete() {
    setError(null)
    startTransition(async () => {
      try {
        if (a.isOwner) await orgDeleteEvent(a.id)
        else await adminDeleteAnnouncement(a.id)
        setOpen(false)
        setConfirming(false)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not delete this event.")
      }
    })
  }

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o)
          setConfirming(false)
          setError(null)
        }}
        aria-label={`Manage ${a.title}`}
        aria-haspopup="menu"
        aria-expanded={open}
        className={iconBtn}
      >
        <MoreHorizontal className="size-4" />
      </button>
      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-10 cursor-default"
            aria-hidden="true"
            onClick={() => {
              setOpen(false)
              setConfirming(false)
            }}
          />
          <div
            role="menu"
            className="absolute bottom-full left-0 z-20 mb-1 w-44 overflow-hidden rounded-xl border border-border bg-popover p-1 shadow-lg"
          >
            {confirming ? (
              <div className="p-1.5">
                <p className="px-1.5 pb-2 text-xs text-muted-foreground text-pretty">
                  Delete this event? This can&apos;t be undone.
                </p>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    className="flex-1 rounded-lg border border-border px-2 py-1.5 text-xs font-medium hover:bg-secondary disabled:opacity-60"
                    disabled={isPending}
                    onClick={() => setConfirming(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-destructive px-2 py-1.5 text-xs font-semibold text-destructive-foreground hover:brightness-110 disabled:opacity-60"
                    disabled={isPending}
                    onClick={handleDelete}
                  >
                    {isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                    Delete
                  </button>
                </div>
                {error && <p className="px-1.5 pt-2 text-xs text-destructive">{error}</p>}
              </div>
            ) : (
              <>
                {a.isOwner && (
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium hover:bg-secondary"
                    onClick={() => {
                      setOpen(false)
                      onEdit()
                    }}
                  >
                    <Pencil className="size-4" /> Edit
                  </button>
                )}
                {canShare && (
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium hover:bg-secondary"
                    onClick={share}
                  >
                    {copied ? <Check className="size-4 text-live" /> : <Share2 className="size-4" />}{" "}
                    {copied ? "Copied" : "Share"}
                  </button>
                )}
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10"
                  onClick={() => setConfirming(true)}
                >
                  <Trash2 className="size-4" /> Delete
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}

/**
 * Shares an event's public page. Uses the native share sheet where available
 * and falls back to copying the link (with brief "Copied" feedback). Sharing
 * needs a resolvable host handle, so `canShare` is false for Universal events.
 */
function useEventShare(a: AnnouncementView) {
  const [copied, setCopied] = useState(false)
  const canShare = Boolean(a.homeHandle)

  async function share() {
    if (!a.homeHandle || typeof window === "undefined") return
    const url = `${window.location.origin}/events/${a.homeHandle}/${a.id}`
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: a.title, text: `${a.title} — hosted by ${a.creatorName}`, url })
      } else if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(url)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }
    } catch {
      // The user dismissed the share sheet, or it was unavailable — no-op.
    }
  }

  return { share, copied, canShare }
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
  const [deleting, startDeleting] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const { share, copied, canShare } = useEventShare(a)

  // The handle is required to build the link, so an event with no resolvable
  // host renders no CTA rather than a broken href.
  const takesRegistrations = a.registrationEnabled && Boolean(a.homeHandle)

  if (typeof document === "undefined") return null

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
        {/* Members and participants share from here; platform admins share via
            the three-dot menu, so this icon is hidden for them to avoid two
            share entry points. Universal events have no public link to share. */}
        {!isAdmin && canShare && (
          <Button
            size="icon"
            variant="ghost"
            className="absolute right-3 top-3 bg-background/70 backdrop-blur hover:bg-background"
            aria-label={copied ? "Link copied" : "Share event"}
            onClick={share}
          >
            {copied ? <Check className="size-4 text-live" /> : <Share2 className="size-4" />}
          </Button>
        )}
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

          {/* Registration is the only way to attend, so this is the single CTA. */}
          {!a.isOwner && takesRegistrations && (
            <Link
              href={`/events/${a.homeHandle}/${a.id}`}
              className={cn(buttonVariants(), "w-full gap-1.5")}
            >
              <ClipboardList className="size-4" aria-hidden="true" />
              Register for this event
            </Link>
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

/** Admin-only top-right menu: share the event, or delete the advert. */
function AdminMenu({ announcement: a }: { announcement: AnnouncementView }) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const { share, copied, canShare } = useEventShare(a)

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
            {canShare && (
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium hover:bg-secondary"
                onClick={share}
              >
                {copied ? <Check className="size-4 text-live" /> : <Share2 className="size-4" />}{" "}
                {copied ? "Copied" : "Share"}
              </button>
            )}
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
    </div>
  )
}

function AdvertiseForm({ event, onClose }: { event?: AnnouncementView; onClose: () => void }) {
  // When `event` is present we're editing an existing event; otherwise publishing
  // a new one. Editing reuses the identical form, prefilled from the event.
  const isEditing = Boolean(event)
  // Product adverts were removed — this form only publishes events.
  const adType: AdType = "event"
  const [title, setTitle] = useState(event?.title ?? "")
  const [description, setDescription] = useState(event?.description ?? "")
  const [location, setLocation] = useState(event?.location ?? "")
  const [eventDate, setEventDate] = useState(event?.eventDate ?? "")
  const [eventTime, setEventTime] = useState(event?.eventTime ?? "")
  // Whether an event is free to attend or ticketed. `price` holds the ticket
  // amount when paid (and doubles as the product price for product adverts).
  const [eventPricing, setEventPricing] = useState<"free" | "paid">(event?.price ? "paid" : "free")
  const [price, setPrice] = useState(event?.price ?? "")
  // How the event should leave the feed once it's over.
  const [deleteMode, setDeleteMode] = useState<EventDeleteMode>(event?.deleteMode === "manual" ? "manual" : "auto5h")
  const [flyer, setFlyer] = useState<string | null>(event?.flyer ?? null)
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
        if (isEditing && event) {
          // Editing only rewrites the event's own content; registrations and
          // other child rows are left untouched by orgUpdateEvent. On success we
          // just close — the feed revalidates server-side.
          await orgUpdateEvent(event.id, {
            title,
            description,
            flyer,
            location,
            eventDate,
            eventTime,
            price: submittedPrice,
            deleteMode,
          })
          onClose()
          return
        }
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
        setError(err instanceof Error ? err.message : `Could not ${isEditing ? "save" : "publish"} your event.`)
      }
    })
  }

  if (typeof document === "undefined") return null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={isEditing ? "Edit event" : "Advertise"}
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
              <h2 className="font-semibold">{isEditing ? "Edit event" : "Publish an event"}</h2>
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
                {isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : isEditing ? (
                  <Check className="size-4" />
                ) : (
                  <CalendarPlus className="size-4" />
                )}
                {isPending
                  ? isEditing
                    ? "Saving…"
                    : "Publishing…"
                  : isEditing
                    ? "Save changes"
                    : "Publish event"}
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
