"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Radio, Search } from "lucide-react"
import { AppMenu } from "@/components/app-menu"
import { MessagesBell } from "@/components/messages-bell"
import { NotificationBell } from "@/components/notification-bell"
import { useChatChromeHidden } from "@/lib/chat-chrome"
import { cn } from "@/lib/utils"

/**
 * The global app header.
 *
 * `collapsible` enables the immersive chat behavior: instead of reacting to the
 * window scroll, the header listens to the shared chat-chrome store (driven by
 * the inner conversation scroll container) and smoothly collapses its height to
 * zero — so the chat area expands to fill the freed space with no blank gap.
 */
export function SiteHeader({ collapsible = false }: { collapsible?: boolean } = {}) {
  const pathname = usePathname()
  // Hide the header when scrolling down, reveal it when scrolling back up.
  const [windowHidden, setWindowHidden] = useState(false)
  const chatHidden = useChatChromeHidden()
  const lastY = useRef(0)

  useEffect(() => {
    // In collapsible (chat) mode the window doesn't scroll — the store drives it.
    if (collapsible) return
    lastY.current = window.scrollY
    let frame = 0
    function onScroll() {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        const y = window.scrollY
        const delta = y - lastY.current
        // Only auto-hide on pages with meaningful scroll distance. On short
        // pages the small scroll from mobile browser-chrome show/hide would
        // otherwise make the sticky header re-pin over the top of the content
        // (e.g. tucking the first Chatrooms card under the header).
        const scrollable = document.documentElement.scrollHeight - window.innerHeight
        if (scrollable < 240) {
          setWindowHidden(false)
          lastY.current = y
          return
        }
        // Ignore tiny jitters; always show near the very top.
        if (Math.abs(delta) > 6) {
          setWindowHidden(delta > 0 && y > 72)
          lastY.current = y
        } else if (y <= 72) {
          setWindowHidden(false)
        }
      })
    }
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      window.removeEventListener("scroll", onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [collapsible])

  function isActive(href: string) {
    if (href === "/") return pathname === "/"
    return pathname.startsWith(href)
  }

  const hidden = collapsible ? chatHidden : windowHidden

  const bar = (
      <div className="relative mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-2 pl-[max(1.25rem,env(safe-area-inset-left))] pr-[max(1.25rem,env(safe-area-inset-right))] sm:gap-4 sm:pl-[max(2rem,env(safe-area-inset-left))] sm:pr-[max(2rem,env(safe-area-inset-right))]">
        {/* Left: menu-flow Back/Close controls (when arrived via the side menu),
            otherwise the hamburger — then the brand. `min-w-0` lets the brand
            wordmark truncate on narrow screens so the right-side icons are never
            pushed off-frame (and clipped by the body's overflow-x guard). */}
        <div className="flex min-w-0 items-center gap-2.5">
          {/* The hamburger menu is always the left-most control — even on pages
              reached via the side menu. The device/browser back gesture handles
              returning, so we never swap in an in-app back arrow here. */}
          <AppMenu />
          <Link href="/" className="flex min-w-0 items-center gap-2">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Radio className="size-4" />
            </span>
            <span className="shrink-0 whitespace-nowrap text-lg font-semibold tracking-tight">Frequency</span>
          </Link>
        </div>

        {/* Right, iOS-aligned: Messages · Notifications · Search. Larger, premium
            chip-style icons (profile now lives in the side menu). */}
        <div className="flex shrink-0 items-center gap-1.5">
          <MessagesBell />
          <NotificationBell />
          <Link
            href="/search"
            aria-label="Search"
            className={cn(
              "relative flex size-11 items-center justify-center rounded-2xl border border-border/50 bg-secondary/40 shadow-soft outline-none backdrop-blur-md transition-all duration-200 hover:bg-secondary/70 active:scale-95 focus-visible:ring-2 focus-visible:ring-ring",
              isActive("/search") ? "text-primary" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Search className="size-[22px]" strokeWidth={2} />
          </Link>
        </div>
      </div>
  )

  // Immersive chat variant: collapse the header's height to zero (no blank gap)
  // while sliding it up, so the conversation expands to full screen.
  if (collapsible) {
    return (
      <div
        className={cn(
          // Gentle, longer collapse on a soft ease-in-out curve so the height
          // reclaim glides rather than snaps.
          "z-40 grid transition-[grid-template-rows] duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none",
          hidden ? "grid-rows-[0fr]" : "grid-rows-[1fr]",
        )}
      >
        <div className="overflow-hidden">
          <header
            className={cn(
              // Primarily an opacity fade (barely any slide) so it dissolves
              // away smoothly instead of sliding out abruptly.
              "border-b border-border/60 bg-background/80 pt-safe backdrop-blur-xl transition-[transform,opacity] duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] will-change-[transform,opacity] motion-reduce:transition-none",
              hidden ? "-translate-y-1 opacity-0" : "translate-y-0 opacity-100",
            )}
          >
            {bar}
          </header>
        </div>
      </div>
    )
  }

  return (
    <header
      className={cn(
        // Longer, softer ease-in-out so the header gently fades/glides out of
        // view on scroll-down and eases back in on scroll-up.
        "sticky top-0 z-40 border-b border-border/60 bg-background/80 pt-safe backdrop-blur-xl transition-[transform,opacity] duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] will-change-[transform,opacity] motion-reduce:transition-none",
        hidden ? "-translate-y-full opacity-0" : "translate-y-0 opacity-100",
      )}
    >
      {bar}
    </header>
  )
}
