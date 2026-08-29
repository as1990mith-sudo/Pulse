"use client"

import { useEffect, useState } from "react"
import { Video } from "lucide-react"
import { cn } from "@/lib/utils"
import { getMeetingState, type AppointmentMeetingState } from "@/app/actions/home-appointments"
import { AppointmentMeeting } from "@/components/appointments/appointment-meeting"

/**
 * "Join Meeting" for an appointment. Polls the server-computed meeting window so
 * it enables exactly when the room opens (10 min before start) and disables once
 * it closes — the member never types a room id or hunts for a link. Launches the
 * private LiveKit room in place. Only rendered for Frequency Live appointments.
 */
export function JoinMeetingButton({
  appointmentId,
  className,
  size = "default",
}: {
  appointmentId: string
  className?: string
  size?: "default" | "sm"
}) {
  const [state, setState] = useState<AppointmentMeetingState | null>(null)
  const [inMeeting, setInMeeting] = useState(false)

  useEffect(() => {
    let alive = true
    const load = () =>
      getMeetingState(appointmentId)
        .then((s) => alive && setState(s))
        .catch(() => {})
    load()
    // Re-check every 30s so the button flips on/off around the window edges.
    const id = setInterval(load, 30_000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [appointmentId])

  if (!state || state.window === "closed") return null

  const isOpen = state.window === "open"
  const opensAt = new Date(state.opensAtISO)
  const label = isOpen
    ? "Join Meeting"
    : `Opens ${opensAt.toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })}`

  return (
    <>
      <button
        type="button"
        disabled={!isOpen}
        onClick={() => setInMeeting(true)}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-all",
          size === "sm" ? "px-3.5 py-1.5 text-xs" : "px-5 py-2.5 text-sm",
          isOpen
            ? "bg-primary text-primary-foreground shadow-lg shadow-primary/30 hover:brightness-110 active:scale-95"
            : "cursor-not-allowed bg-muted text-muted-foreground",
          className,
        )}
      >
        <Video className={size === "sm" ? "size-3.5" : "size-4"} />
        {label}
      </button>
      {inMeeting && <AppointmentMeeting appointmentId={appointmentId} onClose={() => setInMeeting(false)} />}
    </>
  )
}
