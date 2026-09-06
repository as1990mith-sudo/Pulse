"use client"

import { usePush } from "@/lib/use-push"

/**
 * Mounted once, app-wide. Simply calling usePush() runs its mount-time refresh,
 * which silently registers this device for push whenever the OS notification
 * permission is already granted. That is what lets us drop the in-app on/off
 * toggle entirely: the operating system's permission is the single source of
 * truth, and this keeps the device subscription in step with it without asking
 * the user to flip a second switch. Renders nothing.
 */
export function PushAutoSubscribe() {
  usePush()
  return null
}
