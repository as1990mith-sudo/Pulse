"use client"

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Sparkles, BookOpen, RadioTower, MessageCircle, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

type Tab = { href: string; label: string; icon: LucideIcon }

// The four core experiences, in order. Icons per the flagship spec.
const TABS: Tab[] = [
  { href: "/", label: "Devotional", icon: Sparkles },
  { href: "/feed", label: "Feed", icon: BookOpen },
  { href: "/live", label: "Live", icon: RadioTower },
  { href: "/chatrooms", label: "Chatroom", icon: MessageCircle },
]

/**
 * Immersive / auth / full-screen surfaces where a floating tab bar would get in
 * the way. Everything else keeps the bar so users can jump between the four core
 * experiences from anywhere.
 */
function isImmersive(p: string): boolean {
  if (/^\/(login|sign-in|sign-up|reset-password)(\/|$)/.test(p)) return true
  if (/^\/live\/[^/]+/.test(p)) return true // inside a live room
  if (/^\/messages(\/|$)/.test(p)) return true // DM inbox + threads
  if (/^\/status\/[^/]+/.test(p)) return true // full-screen status viewer
  if (/^\/store\/[^/]+\/[^/]+/.test(p)) return true // product page (sticky CTA)
  if (/^\/bible(\/|$)/.test(p)) return true // immersive reader
  if (/^\/studio(\/|$)/.test(p)) return true // broadcast studio
  // A specific chat room (but keep the bar on the browse lists).
  if (/^\/chatrooms\/(?!community$|dreams$)[^/]+/.test(p)) return true
  return false
}

function activeIndexFor(pathname: string): number {
  return TABS.findIndex((t) => (t.href === "/" ? pathname === "/" : pathname.startsWith(t.href)))
}

export function BottomNav() {
  const pathname = usePathname()
  const hidden = isImmersive(pathname)
  const activeIndex = activeIndexFor(pathname)

  const navRef = useRef<HTMLDivElement>(null)
  const tabRefs = useRef<(HTMLAnchorElement | null)[]>([])
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null)
  // Prevents the capsule from animating from (0,0) on first paint.
  const [ready, setReady] = useState(false)

  const measure = useCallback(() => {
    const nav = navRef.current
    const el = tabRefs.current[activeIndex]
    if (!nav || !el) {
      setPill(null)
      return
    }
    const navBox = nav.getBoundingClientRect()
    const box = el.getBoundingClientRect()
    setPill({ left: box.left - navBox.left, width: box.width })
  }, [activeIndex])

  // Re-measure after layout settles (label expand changes the active width).
  useLayoutEffect(() => {
    measure()
    const raf = requestAnimationFrame(() => {
      measure()
      setReady(true)
    })
    return () => cancelAnimationFrame(raf)
  }, [measure, hidden])

  useEffect(() => {
    if (hidden) return
    const onResize = () => measure()
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [measure, hidden])

  // Reserve space so page content never hides behind the floating bar.
  useEffect(() => {
    if (hidden) return
    document.body.classList.add("has-bottom-nav")
    return () => document.body.classList.remove("has-bottom-nav")
  }, [hidden])

  if (hidden) return null

  function tap() {
    // Soft haptic feedback where supported (Android / some browsers).
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate(8)
      } catch {}
    }
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center pb-[max(0.75rem,env(safe-area-inset-bottom))] px-4">
      <nav
        ref={navRef}
        aria-label="Primary"
        className="bottom-nav-bar pointer-events-auto relative flex w-full max-w-sm items-center justify-between gap-1 rounded-[30px] border border-border/60 bg-background/70 p-1.5 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.6)] backdrop-blur-2xl"
      >
        {/* Shared capsule that morphs (slides + stretches) between tabs. */}
        {pill && activeIndex >= 0 && (
          <span
            aria-hidden="true"
            className="bottom-nav-pill absolute top-1.5 bottom-1.5 -z-0 rounded-full"
            style={{
              transform: `translateX(${pill.left}px)`,
              width: pill.width,
              transition: ready
                ? "transform 340ms cubic-bezier(0.34, 1.4, 0.5, 1), width 340ms cubic-bezier(0.34, 1.4, 0.5, 1)"
                : "none",
            }}
          />
        )}

        {TABS.map((tab, i) => {
          const active = i === activeIndex
          const Icon = tab.icon
          return (
            <Link
              key={tab.href}
              href={tab.href}
              ref={(el) => {
                tabRefs.current[i] = el
              }}
              onClick={tap}
              aria-current={active ? "page" : undefined}
              aria-label={tab.label}
              className={cn(
                "relative z-10 flex min-h-12 items-center justify-center rounded-full outline-none transition-[color,transform] duration-300 focus-visible:ring-2 focus-visible:ring-ring active:scale-90",
                active
                  ? "gap-2 px-4 text-primary"
                  : "px-3 text-foreground/70 hover:text-foreground",
              )}
            >
              <Icon
                className={cn(
                  "size-6 shrink-0 transition-transform duration-300",
                  active ? "scale-105" : "scale-100",
                )}
                strokeWidth={active ? 2.4 : 2}
              />
              {/* Label lives only in the active tab and slides/fades in. */}
              <span
                className={cn(
                  // Width snaps instantly so the capsule can measure final
                  // geometry; only opacity/transform animate for the fade+slide.
                  "overflow-hidden whitespace-nowrap text-sm font-semibold transition-[opacity,transform] duration-300 ease-out",
                  active ? "max-w-28 translate-x-0 opacity-100" : "max-w-0 -translate-x-1 opacity-0",
                )}
              >
                {tab.label}
              </span>
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
