"use client"

import { useState, useTransition } from "react"
import { AtSign, Bell, BellOff, Heart, MessageCircle, MessageSquare, Radio, Share2, ShieldAlert, Smartphone } from "lucide-react"
import { toast } from "sonner"
import { NOTIFICATION_CATEGORIES, type NotificationCategory } from "@/lib/notification-categories"
import { updateNotificationPreference } from "@/app/actions/push"
import { isIosNeedingInstall, usePush } from "@/lib/use-push"
import { haptic } from "@/lib/haptics"
import { Card } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const CATEGORY_ICONS: Record<NotificationCategory, typeof Bell> = {
  live: Radio,
  messages: MessageSquare,
  mentions: AtSign,
  replies: MessageCircle,
  home: Bell,
  reactions: Heart,
}

export function NotificationSettings({
  initialPreferences,
  initialDeviceCount,
}: {
  initialPreferences: Record<NotificationCategory, boolean>
  initialDeviceCount: number
}) {
  const { status, busy, enable } = usePush()
  const [prefs, setPrefs] = useState(initialPreferences)
  const [deviceCount, setDeviceCount] = useState(initialDeviceCount)
  const [isPending, startTransition] = useTransition()

  // Categories are only meaningful once the OS is actually allowed to interrupt,
  // so they read as disabled until this device is subscribed.
  const categoriesActive = status === "on"

  function toggle(category: NotificationCategory, next: boolean) {
    const previous = prefs[category]
    setPrefs((p) => ({ ...p, [category]: next })) // optimistic
    haptic("light")
    startTransition(async () => {
      const res = await updateNotificationPreference(category, next)
      if (!res.ok) {
        setPrefs((p) => ({ ...p, [category]: previous }))
        toast.error(res.error)
      }
    })
  }

  async function handleEnable() {
    const res = await enable()
    if (!res.ok) {
      toast.error(res.error ?? "Couldn't turn on notifications.")
      return
    }
    setDeviceCount((c) => c + 1)
    haptic("medium")
    toast.success("Notifications are on for this device")
  }

  return (
    <div className="flex flex-col gap-4">
      <PermissionCard status={status} busy={busy} deviceCount={deviceCount} onEnable={handleEnable} />

      <Card className="p-5">
        <div className="mb-1 flex items-center justify-between gap-3">
          <h2 className="font-semibold leading-tight">What you get notified about</h2>
        </div>
        <p className="mb-4 text-pretty text-sm leading-relaxed text-muted-foreground">
          {categoriesActive
            ? "These apply to every device where you've allowed notifications."
            : "Allow notifications above to start receiving these."}
        </p>

        <ul className={cn("flex flex-col divide-y divide-border/60", !categoriesActive && "opacity-50")}>
          {NOTIFICATION_CATEGORIES.map((cat) => {
            const Icon = CATEGORY_ICONS[cat.key] ?? Bell
            return (
              <li key={cat.key} className="flex items-start gap-3 py-3.5 first:pt-0 last:pb-0">
                <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-foreground">
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <label
                    htmlFor={`notif-${cat.key}`}
                    className="block cursor-pointer font-medium leading-tight"
                  >
                    {cat.label}
                  </label>
                  <p className="mt-0.5 text-pretty text-sm leading-relaxed text-muted-foreground">
                    {cat.description}
                  </p>
                </div>
                <Switch
                  id={`notif-${cat.key}`}
                  checked={prefs[cat.key]}
                  disabled={!categoriesActive || isPending}
                  onCheckedChange={(checked) => toggle(cat.key, checked)}
                  className="mt-1 shrink-0"
                />
              </li>
            )
          })}
        </ul>
      </Card>
    </div>
  )
}

/**
 * The device permission card. Frequency has NO in-app on/off toggle: the
 * operating system owns whether notifications are allowed. This card only
 * reflects that OS state and, when permission has never been asked for, offers
 * the one-time prompt (which browsers require to fire from a tap). Turning
 * notifications off is done in the device's own settings.
 */
function PermissionCard({
  status,
  busy,
  deviceCount,
  onEnable,
}: {
  status: ReturnType<typeof usePush>["status"]
  busy: boolean
  deviceCount: number
  onEnable: () => void
}) {
  // Computed on render rather than in state: it depends on `display-mode`, which
  // changes when the user installs the app, and we want the fresh answer.
  const needsIosInstall = status === "unsupported" && isIosNeedingInstall()

  if (status === "loading") {
    return (
      <Card className="flex items-center gap-3 p-5">
        <span className="size-9 shrink-0 animate-pulse rounded-full bg-secondary" />
        <span className="h-4 w-40 animate-pulse rounded bg-secondary" />
      </Card>
    )
  }

  if (needsIosInstall) {
    return (
      <Card className="p-5">
        <div className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-foreground">
            <Smartphone className="size-4" />
          </span>
          <div>
            <h2 className="font-semibold leading-tight">Add Frequency to your home screen</h2>
            <p className="text-sm text-muted-foreground">Required before iPhone will allow notifications.</p>
          </div>
        </div>
        <ol className="mt-4 flex flex-col gap-2 text-sm leading-relaxed text-muted-foreground">
          <li className="flex gap-2">
            <span className="font-semibold text-foreground">1.</span>
            <span className="inline-flex flex-wrap items-center gap-1">
              Tap <Share2 className="inline size-4 shrink-0" aria-label="Share" /> in the Safari toolbar
            </span>
          </li>
          <li className="flex gap-2">
            <span className="font-semibold text-foreground">2.</span>
            <span>Choose &ldquo;Add to Home Screen&rdquo;</span>
          </li>
          <li className="flex gap-2">
            <span className="font-semibold text-foreground">3.</span>
            <span>Open Frequency from your home screen, then come back here</span>
          </li>
        </ol>
      </Card>
    )
  }

  if (status === "unsupported") {
    return (
      <Card className="flex items-start gap-3 p-5">
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground">
          <BellOff className="size-4" />
        </span>
        <div>
          <h2 className="font-semibold leading-tight">Notifications aren&apos;t available here</h2>
          <p className="mt-0.5 text-pretty text-sm leading-relaxed text-muted-foreground">
            This browser can&apos;t receive push notifications. Try Chrome, Edge, or Safari on a recent
            device.
          </p>
        </div>
      </Card>
    )
  }

  if (status === "blocked") {
    return (
      <Card className="flex items-start gap-3 p-5">
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <ShieldAlert className="size-4" />
        </span>
        <div>
          <h2 className="font-semibold leading-tight">Notifications are blocked</h2>
          <p className="mt-0.5 text-pretty text-sm leading-relaxed text-muted-foreground">
            Frequency uses your device&apos;s notification settings, and this device is currently set to
            block them. Open the padlock or site settings next to the address bar and set Notifications to
            Allow.
          </p>
        </div>
      </Card>
    )
  }

  const on = status === "on"

  return (
    <Card className="p-5">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full",
            on ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground",
          )}
        >
          {on ? <Bell className="size-4" /> : <BellOff className="size-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold leading-tight">
            {on ? "Notifications are on for this device" : "Turn on notifications"}
          </h2>
          <p className="mt-0.5 text-pretty text-sm leading-relaxed text-muted-foreground">
            {on
              ? "You'll hear about lives, replies and messages even when Frequency is closed. To stop them, turn notifications off for Frequency in your device settings."
              : "Get told when a Home goes live, someone replies to you, or you get a message — even when the app is closed. Frequency uses your device's notification permission."}
          </p>
        </div>
      </div>

      {!on && (
        <div className="mt-4">
          <Button disabled={busy} onClick={onEnable}>
            {busy ? "Turning on…" : "Turn on notifications"}
          </Button>
        </div>
      )}

      {on && deviceCount > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          {deviceCount === 1 ? "1 device registered" : `${deviceCount} devices registered`}
        </p>
      )}
    </Card>
  )
}
