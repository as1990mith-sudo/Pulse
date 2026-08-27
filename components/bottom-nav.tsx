"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Home, SquarePen, Radio, MessagesSquare, type LucideIcon } from "lucide-react"
import { haptic } from "@/lib/haptics"
import { useChatChromeHidden } from "@/lib/chat-chrome"
import { cn } from "@/lib/utils"

type Tab = { href: string; label: string; icon: LucideIcon }

// The four core experiences, in order. Icons are chosen to read clearly at a
// glance and to look great both outlined (inactive) and filled (active):
//   Home → Home (the homepage / daily devotional)   Feed → SquarePen (pen on paper)
//   Chatroom → MessagesSquare (community)   Live → Radio (on-air)
// Reels now lives inside the Feed as its own tab (For you / Following / Reels).
const TABS: Tab[] = [
  { href: "/", label: "Home", icon: Home },
  { href: "/feed", label: "Feed", icon: SquarePen },
  { href: "/chatrooms", label: "Chatroom", icon: MessagesSquare },
  { href: "/live", label: "Live", icon: Radio },
]

/**
 * Immersive / auth / full-screen surfaces where a tab bar would get in the way.
 * Everything else keeps the bar so users can jump between the four core
 * experiences from anywhere.
 */
function isImmersive(p: string): boolean {
  if (/^\/(login|sign-in|sign-up|reset-password)(\/|$)/.test(p)) return true
  if (/^\/admin(\/|$)/.test(p)) return true // admin console has its own full navigation
  if (/^\/live\/[^/]+/.test(p)) return true // inside a live room
  if (/^\/messages\/[^/]+/.test(p)) return true // inside a DM thread (keep the bar on the inbox list)
  if (/^\/status\/[^/]+/.test(p)) return true // full-screen status viewer
  if (/^\/library\/[^/]+\/[^/]+/.test(p)) return true // in-app reader / course player
  if (/^\/store\/[^/]+\/[^/]+/.test(p)) return true // product page (sticky CTA)
  if (/^\/studio(\/|$)/.test(p)) return true // broadcast studio
  // Inside a specific Home (org space) — the Home shell renders its own
  // org-branded navigation. The /home hub, /home/join and /home/create flows
  // keep the global bar.
  if (/^\/home\/(?!join$|create$)[^/]+/.test(p)) return true
  // A specific chat room (but keep the bar on the browse lists).
  if (/^\/chatrooms\/(?!community$|dreams$)[^/]+/.test(p)) return true
  // Public event pages. These are the one surface designed for people with no
  // Frequency account, so the member tab bar is actively unhelpful: every tab
  // would lead a non-member straight into a sign-in wall. The pages carry their
  // own lightweight public chrome instead.
  if (/^\/events(\/|$)/.test(p)) return true
  return false
}

function activeIndexFor(pathname: string): number {
  return TABS.findIndex((t) => (t.href === "/" ? pathname === "/" : pathname.startsWith(t.href)))
}

export function BottomNav() {
  const pathname = usePathname()

  // The reels tab (inside the Feed) dispatches `reels:active` so the nav can
  // vanish for a fully immersive, edge-to-edge reel experience.
  const [reelsActive, setReelsActive] = useState(false)
  useEffect(() => {
    function onReels(e: Event) {
      setReelsActive(Boolean((e as CustomEvent).detail))
    }
    window.addEventListener("reels:active", onReels as EventListener)
    return () => window.removeEventListener("reels:active", onReels as EventListener)
  }, [])

  const hidden = isImmersive(pathname) || reelsActive
  const activeIndex = activeIndexFor(pathname)

  // Hide-on-scroll-down / reveal-on-scroll-up, like Instagram & Safari.
  const [tucked, setTucked] = useState(false)
  const lastY = useRef(0)
  // Immersive inner-scroll surfaces (Chat Rooms, Community Help, chat threads)
  // scroll a nested container, not the window — so `tucked` never fires there.
  // The shared chat-chrome store carries their scroll direction, letting the
  // bottom nav tuck away and return in lockstep with the header and tab bar.
  const chatHidden = useChatChromeHidden()

  // Reserve space so page content never hides behind the fixed bar.
  useEffect(() => {
    if (hidden) return
    document.body.classList.add("has-bottom-nav")
    return () => document.body.classList.remove("has-bottom-nav")
  }, [hidden])

  useEffect(() => {
    if (hidden) return
    lastY.current = window.scrollY
    let ticking = false
    function onScroll() {
      if (ticking) return
      ticking = true
      requestAnimationFrame(() => {
        const y = window.scrollY
        const delta = y - lastY.current
        // Ignore tiny jitters and iOS rubber-band overscroll near the top.
        if (Math.abs(delta) > 6 && y > 24) {
          setTucked(delta > 0)
        } else if (y <= 24) {
          setTucked(false)
        }
        lastY.current = y
        ticking = false
      })
    }
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [hidden])

  if (hidden) return null

  function tap() {
    // Soft, reduced-motion-aware tick on tab change (see lib/haptics).
    haptic("select")
  }

  return (
    <div
      className={cn(
        "pointer-events-none fixed inset-x-0 bottom-0 z-50 flex px-3 pb-[max(env(safe-area-inset-bottom),0.5rem)] transition-[transform,opacity] duration-300 ease-out will-change-transform",
        tucked || chatHidden ? "translate-y-[150%] opacity-0" : "translate-y-0 opacity-100",
      )}
    >
      {/* Floating, glassy pill that hovers just above the very bottom edge.
          Uses translucent theme tokens + backdrop-blur so it reads as frosted
          glass in both light and dark themes, with a subtle ring + shadow to
          lift it off the page for a premium feel. */}
      <nav
        aria-label="Primary"
        className="pointer-events-auto flex w-full items-stretch justify-around gap-1 rounded-full border border-border/50 bg-background/65 p-1.5 shadow-[0_6px_24px_rgba(0,0,0,0.18)] ring-1 ring-white/5 backdrop-blur-xl supports-[backdrop-filter]:bg-background/50"
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
                "group relative flex size-12 items-center justify-center rounded-full outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/50",
                active
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
              )}
            >
              <Icon
                className={cn(
                  "size-[22px] shrink-0 transition-transform duration-300 ease-out",
                  active ? "scale-[1.08] fill-current" : "scale-100",
                )}
                strokeWidth={2}
              />
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
