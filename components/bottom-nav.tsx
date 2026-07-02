"use client"

import { useEffect } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Sparkles, BookOpen, RadioTower, MessageCircle, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

type Tab = { href: string; label: string; icon: LucideIcon }

// The four core experiences, in order.
const TABS: Tab[] = [
  { href: "/", label: "Rhema", icon: Sparkles },
  { href: "/feed", label: "Feed", icon: BookOpen },
  { href: "/live", label: "Live", icon: RadioTower },
  { href: "/chatrooms", label: "Chatroom", icon: MessageCircle },
]

/**
 * Immersive / auth / full-screen surfaces where a tab bar would get in the way.
 * Everything else keeps the bar so users can jump between the four core
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

  // Reserve space so page content never hides behind the fixed bar.
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
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50">
      {/* Soft gradient fade where page content meets the navigation bar. */}
      <div
        aria-hidden="true"
        className="h-6 w-full bg-gradient-to-t from-[#0B0B0D] to-transparent"
      />
      <nav
        aria-label="Primary"
        className="bottom-nav-bar pointer-events-auto flex items-stretch border-t border-white/10 bg-[#0B0B0D]/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl"
      >
        {TABS.map((tab, i) => {
          const active = i === activeIndex
          const Icon = tab.icon
          return (
            <Link
              key={tab.href}
              href={tab.href}
              onClick={tap}
              aria-current={active ? "page" : undefined}
              aria-label={tab.label}
              className={cn(
                "group flex h-[68px] flex-1 items-center justify-center gap-2 outline-none transition-colors focus-visible:bg-white/5",
                active ? "text-primary" : "text-white/75 hover:text-white",
              )}
            >
              <Icon
                className={cn(
                  "size-[25px] shrink-0 transition-transform duration-300 ease-out",
                  active ? "scale-[1.08] fill-current" : "scale-100",
                )}
                strokeWidth={active ? 1.8 : 2}
              />
              {/* Label lives only in the active tab and slides/fades in. */}
              <span
                className={cn(
                  "overflow-hidden whitespace-nowrap text-[15px] font-semibold tracking-tight transition-[max-width,opacity,transform] duration-300 ease-out",
                  active ? "max-w-28 translate-x-0 opacity-100" : "max-w-0 translate-x-[-8px] opacity-0",
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
