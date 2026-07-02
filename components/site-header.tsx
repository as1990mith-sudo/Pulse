"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ArrowLeft, Radio, Search, X } from "lucide-react"
import { AppMenu } from "@/components/app-menu"
import { MessagesBell } from "@/components/messages-bell"
import { NotificationBell } from "@/components/notification-bell"
import { useMenuFlow } from "@/lib/menu-flow"
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
  // When the user reached this page via the side menu, offer Back/Close controls
  // that return to where they were before opening the menu.
  const { active: inMenuFlow, back, close } = useMenuFlow()
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
      <div className="relative mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 pl-[max(1.25rem,env(safe-area-inset-left))] pr-[max(1.25rem,env(safe-area-inset-right))] sm:pl-[max(2rem,env(safe-area-inset-left))] sm:pr-[max(2rem,env(safe-area-inset-right))]">
        {/* Left: menu-flow Back/Close controls (when arrived via the side menu),
            otherwise the hamburger — then the brand. */}
        <div className="flex items-center gap-2.5">
          {inMenuFlow ? (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={back}
                aria-label="Go back"
                className="menu-fab tap-scale flex size-10 items-center justify-center rounded-2xl border border-border/60 bg-secondary/40 text-foreground shadow-soft backdrop-blur-md transition-all duration-200 hover:bg-secondary/70"
              >
                <ArrowLeft className="size-[18px]" />
              </button>
              <button
                type="button"
                onClick={close}
                aria-label="Close and return"
                className="tap-scale flex size-10 items-center justify-center rounded-2xl text-muted-foreground transition-colors duration-200 hover:bg-secondary/70 hover:text-foreground"
              >
                <X className="size-[18px]" />
              </button>
            </div>
          ) : (
            <AppMenu />
          )}
          <Link href="/" className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Radio className="size-4" />
            </span>
            <span className="text-lg font-semibold tracking-tight">Frequency</span>
          </Link>
        </div>

        {/* Right, iOS-aligned: Messages · Notifications · Search. Larger, premium
            chip-style icons (profile now lives in the side menu). */}
        <div className="flex items-center gap-1.5">
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
          "z-40 grid transition-[grid-template-rows] duration-[260ms] ease-out motion-reduce:transition-none",
          hidden ? "grid-rows-[0fr]" : "grid-rows-[1fr]",
        )}
      >
        <div className="overflow-hidden">
          <header
            className={cn(
              "border-b border-border/60 bg-background/80 pt-safe backdrop-blur-xl transition-[transform,opacity] duration-[260ms] ease-out will-change-transform motion-reduce:transition-none",
              hidden ? "-translate-y-2 opacity-0" : "translate-y-0 opacity-100",
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
        "sticky top-0 z-40 border-b border-border/60 bg-background/80 pt-safe backdrop-blur-xl transition-[transform,opacity] duration-300 ease-out",
        hidden ? "-translate-y-full opacity-0" : "translate-y-0 opacity-100",
      )}
    >
      {bar}
    </header>
  )
}
