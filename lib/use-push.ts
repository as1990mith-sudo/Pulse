"use client"

import { useCallback, useEffect, useState } from "react"
import { deletePushSubscription, savePushSubscription } from "@/app/actions/push"

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

/**
 * The push service expects the VAPID key as a Uint8Array, but it travels as
 * base64url. Browsers give us `atob` only, which needs standard base64.
 */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4)
  const normalised = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/")
  const raw = window.atob(normalised)
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

export type PushStatus =
  /** Still reading the browser's current registration/permission state. */
  | "loading"
  /** No Notification/PushManager API, or an iOS Safari tab that is not installed. */
  | "unsupported"
  /** Supported and permitted, but this device has no subscription yet. */
  | "off"
  /** Subscribed on this device. */
  | "on"
  /** Permission explicitly denied — only recoverable in browser settings. */
  | "blocked"

/**
 * Owns everything device-specific about push: capability detection, the service
 * worker registration, and keeping the browser's subscription and our database
 * in agreement.
 *
 * Deliberately does NOT prompt on mount. A permission prompt fired without a
 * user gesture is the fastest way to get permanently blocked, and iOS ignores
 * it outright, so `enable()` must be called from a real tap.
 */
export function usePush() {
  const [status, setStatus] = useState<PushStatus>("loading")
  const [busy, setBusy] = useState(false)

  const supported =
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window &&
    Boolean(PUBLIC_KEY)

  // Read the true current state from the browser rather than trusting the DB:
  // the user can revoke permission in browser settings at any time, and only
  // the browser knows.
  const refresh = useCallback(async () => {
    if (!supported) {
      setStatus("unsupported")
      return
    }
    if (Notification.permission === "denied") {
      setStatus("blocked")
      return
    }
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js")
      const existing = await reg?.pushManager.getSubscription()
      setStatus(existing ? "on" : "off")
    } catch {
      setStatus("off")
    }
  }, [supported])

  useEffect(() => {
    void refresh()
  }, [refresh])

  /** Requests permission (must be called from a user gesture) and subscribes. */
  const enable = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    if (!supported) return { ok: false, error: "This device can't receive notifications." }
    setBusy(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "blocked" : "off")
        return { ok: false, error: "Notifications weren't allowed." }
      }

      const reg = await navigator.serviceWorker.register("/sw.js")
      // A registration that is still installing has no usable pushManager yet.
      await navigator.serviceWorker.ready

      // Reuse the existing subscription when there is one: re-subscribing
      // rotates the endpoint and would orphan the previous database row.
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          // Required by every browser: silent pushes are not permitted.
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(PUBLIC_KEY as string),
        }))

      const json = sub.toJSON()
      if (!json.keys?.p256dh || !json.keys?.auth) {
        return { ok: false, error: "Couldn't read the subscription keys." }
      }

      const res = await savePushSubscription({
        endpoint: sub.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        userAgent: navigator.userAgent,
      })
      if (!res.ok) return { ok: false, error: res.error }

      setStatus("on")
      return { ok: true }
    } catch (err) {
      console.error("[v0] push enable failed:", err)
      return { ok: false, error: "Couldn't turn on notifications." }
    } finally {
      setBusy(false)
    }
  }, [supported])

  /** Unsubscribes this device only; other devices keep receiving. */
  const disable = useCallback(async () => {
    setBusy(true)
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js")
      const sub = await reg?.pushManager.getSubscription()
      if (sub) {
        // Forget it server-side first: if unsubscribe succeeds but the action
        // fails, we would keep pushing to a dead endpoint.
        await deletePushSubscription(sub.endpoint)
        await sub.unsubscribe()
      }
      setStatus("off")
    } catch (err) {
      console.error("[v0] push disable failed:", err)
    } finally {
      setBusy(false)
    }
  }, [])

  return { status, busy, enable, disable, refresh, supported }
}

/**
 * True on an iOS/iPadOS browser tab that has not been added to the home screen.
 * Such a device reports Notification support but will never grant permission, so
 * the honest thing to show is install instructions rather than a dead button.
 */
export function isIosNeedingInstall(): boolean {
  if (typeof window === "undefined") return false
  const ua = navigator.userAgent
  const isIos = /iPad|iPhone|iPod/.test(ua) || (ua.includes("Macintosh") && "ontouchend" in document)
  if (!isIos) return false
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  return !standalone
}
