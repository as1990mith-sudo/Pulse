/* Pulse service worker — push receipt and notification deep linking.
 *
 * Deliberately minimal: no asset precaching or offline shell, because the app
 * shell is server-rendered and a stale cached shell would be worse than a
 * network fetch. This worker exists only so notifications can arrive while the
 * app is closed, which is the one thing a page cannot do for itself.
 */

// Take over immediately on install rather than waiting for every tab to close,
// so a notification fix does not sit behind a user's long-lived tab.
self.addEventListener("install", () => self.skipWaiting())
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()))

self.addEventListener("push", (event) => {
  if (!event.data) return

  let payload
  try {
    payload = event.data.json()
  } catch {
    // A payload we cannot parse is not worth a blank notification.
    return
  }

  const { title, body, link, tag, type, homeName } = payload

  event.waitUntil(
    self.registration.showNotification(title || "Pulse", {
      body: body || "",
      icon: "/apple-icon.png",
      badge: "/apple-icon.png",
      // The tag is unique per event (see lib/push.ts), so two simultaneous
      // lives from the same Home stay as two separate notifications instead of
      // the second silently replacing the first.
      tag: tag || undefined,
      // With a unique tag this is belt-and-braces, but it also means a genuine
      // re-send of the same event alerts again rather than updating silently.
      renotify: Boolean(tag),
      // Everything needed to route the tap, carried on the notification itself:
      // the worker may be restarted between display and click.
      data: { link: link || "/", type: type || null, homeName: homeName || null },
      // A live is time-critical and should survive an unattended screen; the
      // rest can be dismissed by the system.
      requireInteraction: type === "live",
    }),
  )
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()

  const link = (event.notification.data && event.notification.data.link) || "/"
  const target = new URL(link, self.location.origin)

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({ type: "window", includeUncontrolled: true })

      // Prefer an already-open tab on the exact destination.
      for (const client of clientList) {
        if (client.url === target.href && "focus" in client) return client.focus()
      }

      // Otherwise reuse any open tab and navigate it, so tapping notifications
      // repeatedly does not litter the user with duplicate windows.
      for (const client of clientList) {
        if ("focus" in client && "navigate" in client) {
          await client.focus()
          try {
            return await client.navigate(target.href)
          } catch {
            // Cross-origin or blocked navigation — fall through to open below.
          }
        }
      }

      // Nothing open: cold-start straight onto the destination, never the home
      // screen, so the notification always lands where it promised.
      return self.clients.openWindow(target.href)
    })(),
  )
})
