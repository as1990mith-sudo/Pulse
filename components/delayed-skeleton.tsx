"use client"

import { useEffect, useState, type ReactNode } from "react"

/**
 * Defers rendering its skeleton until a load has genuinely stalled.
 *
 * Next.js shows a route's `loading.tsx` the instant navigation starts, so a
 * heavy full-screen skeleton flashes on EVERY visit — even when the prefetched
 * server render arrives a few frames later. That made tabs like Feed and
 * Chatroom look like they always "load", while the devotional/home tab (which
 * has no loading.tsx) swapped in smoothly.
 *
 * Wrapping the skeleton here holds a blank frame for `delay` ms. A fast
 * navigation resolves and unmounts this boundary before the timer fires, so no
 * skeleton is ever shown and the transition feels as instant as the in-page
 * For you → Admin tab switch. Only a genuinely slow load survives long enough to
 * reveal the skeleton — exactly the intended behaviour.
 */
export function DelayedSkeleton({ children, delay = 350 }: { children: ReactNode; delay?: number }) {
  const [show, setShow] = useState(false)

  useEffect(() => {
    const t = window.setTimeout(() => setShow(true), delay)
    return () => window.clearTimeout(t)
  }, [delay])

  if (!show) return null
  // Gentle fade so the skeleton doesn't pop in harshly on the slow path.
  return <div className="animate-in fade-in duration-200">{children}</div>
}
