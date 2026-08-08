"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Calendar, CalendarPlus, Clock, MapPin, Trash2, Video } from "lucide-react"
import type { OrganizationView } from "@/lib/org-types"
import { createEvent, deleteEvent, type EventView } from "@/app/actions/org-content"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"

/**
 * The organisation Events tab. Everyone sees upcoming events first (soonest
 * first) then past events. Owners get a "New event" action and per-event
 * delete controls.
 */
export function OrgEventsTab({
  org,
  events,
}: {
  org: OrganizationView
  events: { upcoming: EventView[]; past: EventView[] }
}) {
  const isEmpty = events.upcoming.length === 0 && events.past.length === 0

  return (
    <div className="flex flex-col gap-5">
      {org.isOwner && (
        <div className="flex justify-end">
          <NewEventDialog organizationId={org.id} />
        </div>
      )}

      {isEmpty ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-muted/30 px-6 py-16 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-secondary text-muted-foreground">
            <Calendar className="size-6" />
          </span>
          <p className="font-medium">No events yet</p>
          <p className="max-w-sm text-pretty text-sm text-muted-foreground">
            {org.isOwner
              ? "Create conferences, services, prayer meetings and gatherings. Upcoming events show here first."
              : `${org.name} hasn't scheduled any events yet. Subscribe to be notified when they do.`}
          </p>
        </div>
      ) : (
        <>
          {events.upcoming.length > 0 && (
            <Section title="Upcoming">
              {events.upcoming.map((e) => (
                <EventCard key={e.id} event={e} orgId={org.id} isOwner={org.isOwner} />
              ))}
            </Section>
          )}
          {events.past.length > 0 && (
            <Section title="Past">
              {events.past.map((e) => (
                <EventCard key={e.id} event={e} orgId={org.id} isOwner={org.isOwner} />
              ))}
            </Section>
          )}
        </>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
      {children}
    </div>
  )
}

function EventCard({ event, orgId, isOwner }: { event: EventView; orgId: string; isOwner: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function remove() {
    startTransition(async () => {
      await deleteEvent({ id: event.id, organizationId: orgId })
      router.refresh()
    })
  }

  return (
    <article className={`overflow-hidden rounded-2xl border border-border/60 bg-card ${event.isPast ? "opacity-70" : ""}`}>
      {event.cover && (
        <div className="relative aspect-[2/1] w-full overflow-hidden bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={event.cover || "/placeholder.svg"} alt="" className="size-full object-cover" />
        </div>
      )}
      <div className="flex gap-3 p-4">
        <div className="flex w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-primary/10 py-2 text-primary">
          <Calendar className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="text-pretty font-semibold leading-snug">{event.title}</h4>
          <div className="mt-1.5 flex flex-col gap-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Clock className="size-3.5 shrink-0" /> {event.dateLabel} · {event.timeLabel}
            </span>
            {event.locationName && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="size-3.5 shrink-0" /> <span className="truncate">{event.locationName}</span>
              </span>
            )}
            {event.onlineUrl && (
              <a
                href={event.onlineUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-primary hover:underline"
              >
                <Video className="size-3.5 shrink-0" /> Join online
              </a>
            )}
          </div>
          {event.description && (
            <p className="mt-2 whitespace-pre-wrap text-pretty text-sm leading-relaxed text-muted-foreground">
              {event.description}
            </p>
          )}
          {isOwner && (
            <button
              type="button"
              onClick={remove}
              disabled={pending}
              className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-destructive transition hover:underline disabled:opacity-50"
            >
              <Trash2 className="size-3.5" /> {pending ? "Removing..." : "Delete"}
            </button>
          )}
        </div>
      </div>
    </article>
  )
}

function NewEventDialog({ organizationId }: { organizationId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [startsAt, setStartsAt] = useState("")
  const [endsAt, setEndsAt] = useState("")
  const [locationName, setLocationName] = useState("")
  const [onlineUrl, setOnlineUrl] = useState("")

  function submit() {
    setError(null)
    startTransition(async () => {
      try {
        await createEvent({
          organizationId,
          title,
          description: description || undefined,
          startsAt,
          endsAt: endsAt || undefined,
          locationName: locationName || undefined,
          onlineUrl: onlineUrl || undefined,
        })
        setOpen(false)
        setTitle("")
        setDescription("")
        setStartsAt("")
        setEndsAt("")
        setLocationName("")
        setOnlineUrl("")
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't create the event.")
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button className="rounded-full" size="sm">
            <CalendarPlus className="size-4" /> New event
          </Button>
        }
      />
      <DialogContent className="max-h-[90svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create event</DialogTitle>
          <DialogDescription>Schedule a gathering, service or activity for your community.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <Field label="Title">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Sunday Celebration Service" />
          </Field>
          <Field label="Description">
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Optional details" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Starts">
              <Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
            </Field>
            <Field label="Ends (optional)">
              <Input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
            </Field>
          </div>
          <Field label="Location (optional)">
            <Input value={locationName} onChange={(e) => setLocationName(e.target.value)} placeholder="Venue name or address" />
          </Field>
          <Field label="Online join link (optional)">
            <Input value={onlineUrl} onChange={(e) => setOnlineUrl(e.target.value)} placeholder="zoom.us/… or youtube.com/…" />
          </Field>
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-full" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button className="rounded-full" onClick={submit} disabled={pending}>
            {pending ? "Creating..." : "Create event"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">{label}</label>
      {children}
    </div>
  )
}
