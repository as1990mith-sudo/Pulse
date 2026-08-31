"use client"

import useSWR from "swr"
import { CalendarClock, Clock, MapPin, Video } from "lucide-react"
import { cn } from "@/lib/utils"
import { JoinMeetingButton } from "@/components/appointments/join-meeting-button"
import { getConversationAppointment } from "@/app/actions/home-appointments"

function formatMoney(cents: number | null, currency: string) {
  if (cents == null) return "Free"
  return new Intl.NumberFormat(undefined, { style: "currency", currency: currency.toUpperCase() }).format(cents / 100)
}

/**
 * A compact card pinned to the top of an appointment's dedicated conversation.
 * It restates the booking facts and — for Frequency Live sessions — carries the
 * time-gated Join Meeting button, so the meeting is launched from inside the
 * same thread the two people are already talking in. Renders nothing for
 * ordinary DMs (the action returns null unless this is an appointment thread the
 * viewer is part of).
 */
export function AppointmentThreadBanner({ conversationId }: { conversationId: number }) {
  const { data } = useSWR(["conversation-appointment", conversationId], () =>
    getConversationAppointment(conversationId),
  )

  if (!data) return null

  const when = new Date(data.startsAt).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })

  const cancelled = data.status === "cancelled"
  const awaitingPayment = data.paymentStatus === "pending"
  const finished = data.status === "completed"
  const noShow = data.status === "no_show"
  const note = cancelled
    ? "This appointment was cancelled."
    : awaitingPayment
      ? "Awaiting payment."
      : finished
        ? "Session finished."
        : noShow
          ? "No show — the meeting window closed without both joining."
          : null

  return (
    <div className="bg-card px-3 py-3 sm:px-4">
      <div className="mx-auto flex max-w-3xl items-start justify-between gap-3 rounded-2xl border-2 border-primary/60 bg-primary/[0.06] p-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <CalendarClock className="size-4 shrink-0 text-primary" />
            <h2 className="truncate text-sm font-semibold text-foreground">{data.title}</h2>
            {data.priceCents != null && (
              <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary">
                {formatMoney(data.priceCents, data.currency)}
              </span>
            )}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1 text-foreground">{when}</span>
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3.5" />
              {data.durationMinutes} min
            </span>
            <span className="inline-flex items-center gap-1">
              {data.useFrequencyLive ? <Video className="size-3.5" /> : <MapPin className="size-3.5" />}
              {data.useFrequencyLive ? "Frequency Live" : data.location ?? "In person"}
            </span>
          </div>
          {note && (
            <p
              className={cn(
                "mt-1.5 text-xs font-medium",
                cancelled || noShow ? "text-destructive" : awaitingPayment ? "text-amber-500" : "text-muted-foreground",
              )}
            >
              {note}
            </p>
          )}
        </div>

        {data.useFrequencyLive && !cancelled && !awaitingPayment && !finished && !noShow && (
          <div className="shrink-0 self-center">
            <JoinMeetingButton
              appointmentId={data.appointmentId}
              className="rounded-2xl px-6 py-3 text-sm shadow-xl shadow-primary/25 ring-1 ring-inset ring-white/10"
            />
          </div>
        )}
      </div>
    </div>
  )
}
