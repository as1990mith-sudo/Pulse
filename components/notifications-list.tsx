"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import useSWR, { useSWRConfig } from "swr"
import { Bell, Heart, Radio, UserPlus, Megaphone, Repeat2, Trash2, X, CheckCircle2, Circle, AtSign } from "lucide-react"
import { CommentIcon } from "@/components/comment-icon"
import {
  getNotifications,
  markNotificationsRead,
  deleteNotifications,
  type NotificationType,
  type NotificationView,
} from "@/app/actions/notifications"
import { haptic } from "@/lib/haptics"
import { cn } from "@/lib/utils"

const ICONS: Record<NotificationType, React.ComponentType<{ className?: string }>> = {
  like: Heart,
  comment: CommentIcon,
  live: Radio,
  post: Megaphone,
  follow: UserPlus,
  repost: Repeat2,
  mention: AtSign,
}

function verb(type: NotificationType) {
  switch (type) {
    case "like":
      return "liked your post"
    case "comment":
      return "replied to your post"
    case "live":
      return "is live now"
    case "post":
      return "posted"
    case "follow":
      return "followed you"
    case "repost":
      return "reposted your post"
    case "mention":
      return "mentioned you"
  }
}

// Drag further left than this (px) to trigger swipe-to-delete on release.
const SWIPE_DELETE_THRESHOLD = 96
// Hold a row still for this long (ms) to enter multi-select mode.
const LONG_PRESS_MS = 450

export function NotificationsList({ initial }: { initial: NotificationView[] }) {
  const router = useRouter()
  const { mutate } = useSWRConfig()
  const { data, mutate: mutateList } = useSWR("notifications-page", () => getNotifications(), {
    fallbackData: initial,
    refreshInterval: 20000,
  })

  // Multi-select state. Entering selection mode (via long-press) turns taps
  // into selection toggles instead of navigation.
  const [selectionMode, setSelectionMode] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(new Set())

  // Opening the page marks everything read so the header badge clears.
  useEffect(() => {
    void markNotificationsRead().then(() => mutate("notifications-unread"))
  }, [mutate])

  const notifications = data ?? []

  const exitSelection = useCallback(() => {
    setSelectionMode(false)
    setSelected(new Set())
  }, [])

  const enterSelection = useCallback((id: number) => {
    setSelectionMode(true)
    setSelected(new Set([id]))
  }, [])

  const toggleSelected = useCallback((id: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  // Optimistically remove the given ids from the cached list, then persist.
  const removeIds = useCallback(
    async (ids: number[]) => {
      if (ids.length === 0) return
      const idSet = new Set(ids)
      await mutateList((current) => (current ?? []).filter((n) => !idSet.has(n.id)), { revalidate: false })
      await deleteNotifications(ids)
      void mutate("notifications-unread")
    },
    [mutateList, mutate],
  )

  const clearSelected = useCallback(async () => {
    const ids = [...selected]
    exitSelection()
    await removeIds(ids)
  }, [selected, exitSelection, removeIds])

  if (notifications.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card/50 py-16 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-secondary text-muted-foreground">
          <Bell className="size-6" />
        </span>
        <div className="space-y-1">
          <p className="font-medium">You&apos;re all caught up</p>
          <p className="text-sm text-muted-foreground">
            When people like or reply to your posts — or someone you follow goes live — it&apos;ll show up here.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Selection action bar — shown only while picking multiple to clear. */}
      {selectionMode && (
        <div className="sticky top-2 z-10 flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-card/95 px-3 py-2 shadow-sm backdrop-blur">
          <button
            type="button"
            onClick={exitSelection}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="size-4" /> Cancel
          </button>
          <span className="text-sm font-medium tabular-nums">{selected.size} selected</span>
          <button
            type="button"
            onClick={() => void clearSelected()}
            disabled={selected.size === 0}
            className="flex items-center gap-1.5 rounded-lg bg-destructive px-3 py-1.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            <Trash2 className="size-4" /> Clear
          </button>
        </div>
      )}

      <ul className="flex flex-col gap-1.5">
        {notifications.map((n) => (
          <NotificationRow
            key={n.id}
            n={n}
            selectionMode={selectionMode}
            selected={selected.has(n.id)}
            onOpen={() => router.push(n.link)}
            onLongPress={() => enterSelection(n.id)}
            onToggle={() => toggleSelected(n.id)}
            onSwipeDelete={() => void removeIds([n.id])}
          />
        ))}
      </ul>

      {!selectionMode && (
        <p className="px-1 text-center text-xs text-muted-foreground">
          Swipe a notification left to delete, or press and hold to select several.
        </p>
      )}
    </div>
  )
}

function NotificationRow({
  n,
  selectionMode,
  selected,
  onOpen,
  onLongPress,
  onToggle,
  onSwipeDelete,
}: {
  n: NotificationView
  selectionMode: boolean
  selected: boolean
  onOpen: () => void
  onLongPress: () => void
  onToggle: () => void
  onSwipeDelete: () => void
}) {
  const Icon = ICONS[n.type] ?? Bell
  const [dx, setDx] = useState(0)
  const [removing, setRemoving] = useState(false)

  const startX = useRef(0)
  const startY = useRef(0)
  const draggingAxis = useRef<null | "x" | "y">(null)
  const moved = useRef(false)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressed = useRef(false)

  const clearLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  const onPointerDown = (e: React.PointerEvent) => {
    // Ignore secondary buttons / multi-touch gestures.
    if (e.pointerType === "mouse" && e.button !== 0) return
    startX.current = e.clientX
    startY.current = e.clientY
    draggingAxis.current = null
    moved.current = false
    longPressed.current = false
    if (!selectionMode) {
      longPressTimer.current = setTimeout(() => {
        longPressed.current = true
        // Snap back any swipe offset before entering selection mode.
        setDx(0)
        onLongPress()
        haptic("medium")
      }, LONG_PRESS_MS)
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const deltaX = e.clientX - startX.current
    const deltaY = e.clientY - startY.current

    // Lock the gesture to an axis once movement is meaningful.
    if (draggingAxis.current === null) {
      if (Math.abs(deltaX) > 8 || Math.abs(deltaY) > 8) {
        draggingAxis.current = Math.abs(deltaX) > Math.abs(deltaY) ? "x" : "y"
        if (draggingAxis.current === "x") {
          moved.current = true
          clearLongPress()
          try {
            ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
          } catch {
            // ignore unsupported capture
          }
        } else {
          // Vertical scroll — abandon any pending long-press.
          clearLongPress()
        }
      }
    }

    // Swipe-to-delete only when not in selection mode and dragging horizontally.
    if (!selectionMode && draggingAxis.current === "x") {
      // Allow left swipe (negative); resist right past origin.
      setDx(Math.min(0, deltaX))
    }
  }

  const onPointerUp = () => {
    clearLongPress()
    if (longPressed.current) {
      longPressed.current = false
      return
    }
    if (draggingAxis.current === "x" && !selectionMode) {
      if (dx <= -SWIPE_DELETE_THRESHOLD) {
        // Animate out to the left, then delete.
        setRemoving(true)
        setDx(-window.innerWidth)
        setTimeout(onSwipeDelete, 180)
        return
      }
      setDx(0)
      return
    }
    // A clean tap (no axis lock / no drag).
    if (!moved.current) {
      if (selectionMode) onToggle()
      else onOpen()
    }
  }

  const onPointerCancel = () => {
    clearLongPress()
    setDx(0)
  }

  return (
    <li className="relative">
      {/* Red delete affordance revealed as the row slides left. */}
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-0 flex items-center justify-end rounded-xl bg-destructive pr-5 text-white transition-opacity",
          dx < -8 ? "opacity-100" : "opacity-0",
        )}
      >
        <Trash2 className="size-5" />
      </div>

      <div
        role="button"
        tabIndex={0}
        aria-label={`${n.actorName} ${verb(n.type)}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            if (selectionMode) onToggle()
            else onOpen()
          }
        }}
        style={{ transform: `translateX(${dx}px)` }}
        className={cn(
          "relative flex select-none items-start gap-3 rounded-xl border border-border/60 bg-background p-3 transition-colors hover:bg-secondary/60",
          // No CSS transition mid-drag (follows the finger); animate the snap-back/out.
          (dx === 0 || removing) && "transition-transform duration-200",
          !n.read && "bg-primary/5",
          selectionMode && selected && "ring-2 ring-primary",
          "touch-pan-y",
        )}
      >
        {selectionMode && (
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center text-muted-foreground">
            {selected ? <CheckCircle2 className="size-5 text-primary" /> : <Circle className="size-5" />}
          </span>
        )}
        {!selectionMode && (
          <span
            className={cn(
              "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full",
              n.type === "live"
                ? "bg-live/15 text-live"
                : n.type === "like"
                  ? "bg-destructive/10 text-destructive"
                  : "bg-secondary text-foreground",
            )}
          >
            <Icon className={cn("size-4", n.type === "like" && "fill-current")} />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block text-sm leading-snug">
            <span className="font-semibold">{n.actorName}</span>{" "}
            <span className="text-muted-foreground">{verb(n.type)}</span>
          </span>
          {n.message && <span className="mt-0.5 block truncate text-sm text-muted-foreground">{n.message}</span>}
          <span className="mt-0.5 block text-xs text-muted-foreground">{n.postedAt}</span>
        </span>
        {!n.read && !selectionMode && (
          <span className="mt-2 size-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />
        )}
      </div>
    </li>
  )
}
