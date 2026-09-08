"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion } from "motion/react"
import { CalendarClock, Video } from "lucide-react"
import { cn } from "@/lib/utils"
import { getMeetingState, type AppointmentMeetingState } from "@/app/actions/home-appointments"
import { useAppointmentCall } from "@/components/appointments/appointment-call-provider"

/**
 * "Join Meeting" for an appointment. Polls the server-computed meeting window so
 * it launches the room exactly when it opens (10 min before start) and disables
 * once it closes — the member never types a room id or hunts for a link. Before
 * the window opens the button still reads "Join Meeting" but, instead of
 * launching, it surfaces a premium popup telling the member exactly when joining
 * becomes active (auto-dismissing after 5s). Launches the private LiveKit room
 * via the persistent call provider (so it survives navigation and can minimize
 * to PiP). Only rendered for Frequency Live appointments.
 */
export function JoinMeetingButton({
  appointmentId,
  title = "Appointment",
  counterpartName = "Guest",
  className,
  size = "default",
}: {
  appointmentId: string
  title?: string
  counterpartName?: string
  className?: string
  size?: "default" | "sm"
}) {
  const { startCall } = useAppointmentCall()
  const [state, setState] = useState<AppointmentMeetingState | null>(null)
  const [info, setInfo] = useState(false)

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
  const opensLabel = opensAt.toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  })

  return (
    <>
      <button
        type="button"
        onClick={() =>
          isOpen ? startCall({ appointmentId, title, counterpartName, startWithVideo: true }) : setInfo(true)
        }
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-all",
          size === "sm" ? "px-3.5 py-1.5 text-xs" : "px-5 py-2.5 text-sm",
          isOpen
            ? "bg-primary text-primary-foreground shadow-lg shadow-primary/30 hover:brightness-110 active:scale-95"
            : "bg-primary/15 text-primary ring-1 ring-inset ring-primary/40 shadow-sm hover:bg-primary/20 active:scale-95",
          className,
        )}
      >
        <Video className="size-4" />
        Join Meeting
      </button>

      <JoiningInfoPopup open={info} onClose={() => setInfo(false)} whenLabel={opensLabel} title={title} />
    </>
  )
}

/**
 * A premium, self-dismissing popup shown when a member taps Join Meeting before
 * the room opens. Centered, glass-backed card with a warm brand glow, a live
 * countdown bar, and a soft spring entrance. Closes on backdrop tap or after 5s.
 */
function JoiningInfoPopup({
  open,
  onClose,
  whenLabel,
  title,
}: {
  open: boolean
  onClose: () => void
  whenLabel: string
  title: string
}) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (!open) return
    const t = setTimeout(onClose, 5000)
    return () => clearTimeout(t)
  }, [open, onClose])

  if (!mounted) return null

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[120] flex items-center justify-center p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <motion.button
            type="button"
            aria-label="Dismiss"
            onClick={onClose}
            className="absolute inset-0 bg-black/55 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          <motion.div
            role="status"
            className="relative w-full max-w-xs overflow-hidden rounded-[26px] border border-white/10 bg-neutral-900/90 p-6 text-center shadow-[0_30px_80px_-24px_rgba(0,0,0,0.9)] backdrop-blur-xl"
            initial={{ opacity: 0, scale: 0.9, y: 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ type: "spring", stiffness: 320, damping: 26 }}
          >
            {/* Warm brand glow bleeding from the top */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-32"
              style={{
                background:
                  "radial-gradient(80% 100% at 50% 0%, color-mix(in oklch, var(--primary) 34%, transparent), transparent 70%)",
              }}
            />
            <div className="relative">
              <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary/15 text-primary ring-1 ring-inset ring-primary/30">
                <CalendarClock className="size-7" />
              </div>
              <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.22em] text-primary/90">Not open yet</p>
              <h2 className="mt-1 text-pretty text-base font-semibold leading-snug text-white">Joining becomes active</h2>
              <p className="mt-2 text-sm leading-relaxed text-white/60">
                <span className="font-semibold text-white">{title}</span> opens on
              </p>
              <p className="mt-1 text-[15px] font-semibold text-primary">{whenLabel}</p>
            </div>

            {/* Auto-dismiss countdown bar */}
            <div className="relative mt-5 h-1 overflow-hidden rounded-full bg-white/10">
              <motion.div
                key={open ? "run" : "idle"}
                className="h-full rounded-full bg-primary"
                initial={{ width: "100%" }}
                animate={{ width: "0%" }}
                transition={{ duration: 5, ease: "linear" }}
              />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
