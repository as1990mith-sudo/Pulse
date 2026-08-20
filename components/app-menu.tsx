"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import useSWR from "swr"
import {
  AlignLeft,
  BookOpen,
  Bookmark,
  ChevronDown,
  ChevronRight,
  Contrast,
  Home as HomeIcon,
  Info,
  Leaf,
  Library as LibraryIcon,
  LifeBuoy,
  LogOut,
  MessageCircle,
  Moon,
  MoonStar,
  Newspaper,
  NotebookPen,
  Palette,
  Radio,
  Bell,
  ShieldCheck,
  Sun,
  Trash2,
  UserPlus,
  Check,
  X,
  type LucideIcon,
} from "lucide-react"
import { authClient } from "@/lib/auth-client"
import { getUnreadCount } from "@/app/actions/notifications"
import { AvatarUploadButton } from "@/components/profile/avatar-upload-button"
import { DeleteAccountDialog } from "@/components/profile/delete-account-dialog"
import { SKINS, useSkin } from "@/components/skin-provider"
import { getAvatarColor, getHandle, getInitials } from "@/lib/identity"
import { startMenuFlow } from "@/lib/menu-flow"
import { haptic } from "@/lib/haptics"
import { cn } from "@/lib/utils"

const themes = [
  { value: "mid", label: "Mid", icon: Contrast },
  { value: "charcoal", label: "Charcoal", icon: MoonStar },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "light", label: "Light", icon: Sun },
  { value: "grass", label: "Grass", icon: Leaf },
] as const

const SKIN_SWATCH: Record<string, string> = {
  orange: "linear-gradient(to top right, oklch(0.79 0.16 62), oklch(0.66 0.23 22), oklch(0.6 0.26 350))",
  white: "linear-gradient(to top right, oklch(1 0 0), oklch(0.9 0.002 285), oklch(0.78 0.004 285))",
  black: "linear-gradient(to top right, oklch(0.34 0.006 285), oklch(0.22 0.006 285), oklch(0.14 0.006 285))",
  yellow: "linear-gradient(to top right, oklch(0.9 0.16 95), oklch(0.84 0.17 85), oklch(0.76 0.16 68))",
}

// How far (px) the drawer must be dragged left before release dismisses it.
const CLOSE_THRESHOLD = 90
const ANIM_MS = 300

// Module-level open intent. `AppMenu` lives inside the per-page header, so it
// unmounts/remounts on every navigation — plain component state can't survive
// the Close-returns-to-menu flow (the instance that reopens the drawer unmounts
// immediately after). This module variable persists across those remounts
// (within the same document lifetime) so the freshly mounted instance can
// restore the drawer. It resets naturally on a full page reload.
let drawerOpenIntent = false

/**
 * Facebook-style left navigation drawer. The hamburger opens a full-height
 * sheet that slides in from the left edge, covering ~85% of the width and
 * dimming + gently pushing the page behind it (micro-parallax). It closes via
 * tap-outside, swipe-left, Escape, or the browser back gesture.
 */
export function AppMenu() {
  const router = useRouter()
  const { data: session } = authClient.useSession()
  const signedIn = !!session?.user

  // Live unread-notification count, mirroring the header bell.
  const { data: unread } = useSWR(signedIn ? "notifications-unread" : null, () => getUnreadCount(), {
    refreshInterval: 20000,
  })
  const notificationCount = unread ?? 0

  const [mounted, setMounted] = useState(false)
  const [open, setOpen] = useState(false) // portal present (enter + exit)
  const [active, setActive] = useState(false) // slid fully into view
  const [deleteOpen, setDeleteOpen] = useState(false) // account-deletion dialog

  // Live drag state for swipe-to-close.
  const [dragX, setDragX] = useState(0)
  const [dragging, setDragging] = useState(false)
  const drag = useRef<{ startX: number; startY: number; horizontal: boolean | null }>({
    startX: 0,
    startY: 0,
    horizontal: null,
  })

  useEffect(() => {
    setMounted(true)
    // Restore the drawer if it was open before this instance mounted (e.g. the
    // previous instance opened it then unmounted during navigation). We show it
    // without pushing a fresh history entry — the original one is still on the
    // stack from when it first opened.
    if (drawerOpenIntent) {
      setOpen(true)
      requestAnimationFrame(() => requestAnimationFrame(() => setActive(true)))
    }
  }, [])

  const name = session?.user?.name || "Guest"
  const firstName = name.trim().split(/\s+/)[0]
  const initials = getInitials(name)
  const avatarColor = getAvatarColor(session?.user?.id || name)

  const close = useCallback(() => {
    drawerOpenIntent = false
    setActive(false)
    setDragX(0)
    window.setTimeout(() => setOpen(false), ANIM_MS)
  }, [])

  const openDrawer = useCallback(() => {
    drawerOpenIntent = true
    // Subtle tactile cue as the navigation drawer opens.
    haptic("light")
    setOpen(true)
    // Next frame: flip to active so the transform transition plays.
    requestAnimationFrame(() => requestAnimationFrame(() => setActive(true)))
    // Push a history entry so the Android back gesture/button closes the drawer.
    try {
      window.history.pushState({ frequencyDrawer: true }, "")
    } catch {
      /* no-op */
    }
  }, [])

  // Lock scroll, toggle the page parallax shift, and wire Escape + back button.
  useEffect(() => {
    if (!open) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    document.body.classList.add("drawer-open")

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close()
    }
    function onPop() {
      close()
    }
    window.addEventListener("keydown", onKey)
    window.addEventListener("popstate", onPop)
    return () => {
      document.body.style.overflow = prevOverflow
      document.body.classList.remove("drawer-open")
      window.removeEventListener("keydown", onKey)
      window.removeEventListener("popstate", onPop)
    }
  }, [open, close])

  function navigate() {
    // Record where we came from so the destination page can offer a Back control
    // that steps back to where the menu was opened.
    startMenuFlow(window.location.pathname)
    close()
  }

  function navigateHome() {
    // The user profile is a home base, not a menu-flow page: don't start a flow,
    // so it shows the normal hamburger instead of Back/Close controls.
    close()
  }

  async function handleSignOut() {
    close()
    await authClient.signOut()
    router.refresh()
  }

  function handleInvite() {
    const shareData = {
      title: "Frequency",
      text: "Join me on Frequency — live worship, teaching, and community.",
      url: typeof window !== "undefined" ? window.location.origin : "https://frequency.app",
    }
    if (typeof navigator !== "undefined" && navigator.share) {
      navigator.share(shareData).catch(() => {})
    } else if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(shareData.url).catch(() => {})
    }
    close()
  }

  // ---- Swipe-to-close handlers -------------------------------------------
  function onPointerDown(e: React.PointerEvent) {
    drag.current = { startX: e.clientX, startY: e.clientY, horizontal: null }
  }
  function onPointerMove(e: React.PointerEvent) {
    if (e.buttons === 0) return
    const dx = e.clientX - drag.current.startX
    const dy = e.clientY - drag.current.startY
    if (drag.current.horizontal === null) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return
      drag.current.horizontal = Math.abs(dx) > Math.abs(dy)
    }
    if (!drag.current.horizontal) return // vertical → let the list scroll
    if (dx < 0) {
      if (!dragging) setDragging(true)
      setDragX(dx)
    }
  }
  function onPointerUp() {
    if (drag.current.horizontal && dragX <= -CLOSE_THRESHOLD) {
      close()
    } else {
      setDragX(0)
    }
    setDragging(false)
    drag.current.horizontal = null
  }

  const profileHref = session?.user ? `/u/${session.user.id}` : "/sign-in"

  // Drawer transform: fully in view = 0; hidden = -100%; plus live drag offset.
  const drawerStyle: React.CSSProperties = {
    transform: active ? `translateX(${dragX}px)` : "translateX(-100%)",
    transition: dragging ? "none" : `transform ${ANIM_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`,
  }
  // Fade the scrim out as the drawer is dragged away.
  const dragFade = dragging ? Math.max(0, 1 + dragX / 320) : 1
  const scrimStyle: React.CSSProperties = {
    opacity: active ? dragFade : 0,
    transition: dragging ? "none" : `opacity ${ANIM_MS}ms ease`,
  }

  return (
    <>
      <button
        type="button"
        onClick={openDrawer}
        aria-label="Open menu"
        aria-haspopup="dialog"
        aria-expanded={open}
        className="menu-fab tap-scale flex size-11 items-center justify-center rounded-2xl border border-border/60 bg-secondary/40 text-foreground shadow-soft backdrop-blur-md transition-all duration-200 hover:bg-secondary/70"
      >
        <AlignLeft className="size-[22px]" strokeWidth={2.25} />
      </button>

      {open &&
        mounted &&
        createPortal(
          <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label="Navigation menu">
            {/* Dimming + blurred scrim */}
            <button
              type="button"
              aria-label="Close menu"
              onClick={close}
              style={scrimStyle}
              className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
            />

            {/* The drawer */}
            <aside
              style={drawerStyle}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              className="drawer-panel absolute inset-y-0 left-0 flex w-[85%] max-w-sm flex-col rounded-r-3xl border-r border-border/60 bg-popover shadow-floating"
            >
              {/* Pinned header */}
              <div className="shrink-0 px-5 pt-[max(1.25rem,env(safe-area-inset-top))]">
                <div className="flex items-center justify-end pb-1">
                  <button
                    type="button"
                    onClick={close}
                    aria-label="Close"
                    className="tap-scale flex size-9 items-center justify-center rounded-full bg-secondary/60 text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-4" />
                  </button>
                </div>

                <div className="flex items-center gap-3 rounded-2xl p-2">
                  {session?.user ? (
                    // Signed in: the avatar is an inline uploader so any member —
                    // including admins redirected away from /u/[id] — can set a
                    // personal profile picture instead of a blank initials tile.
                    <AvatarUploadButton
                      image={session.user.image ?? null}
                      initials={initials}
                      color={avatarColor}
                      name={name}
                    />
                  ) : (
                    <span
                      className={cn(
                        "flex size-14 items-center justify-center overflow-hidden rounded-full text-lg font-semibold ring-2 ring-border/60",
                        avatarColor,
                      )}
                    >
                      {initials}
                    </span>
                  )}
                  <Link
                    href={profileHref}
                    onClick={navigateHome}
                    className="tap-scale flex min-w-0 flex-1 items-center gap-3 rounded-xl px-1 py-1 transition-colors hover:bg-secondary/50"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-display text-lg font-semibold text-foreground">{name}</span>
                      <span className="block truncate text-sm text-muted-foreground">
                        {session?.user ? getHandle(name) : "Sign in to your account"}
                      </span>
                    </span>
                    <ChevronDown className="size-5 shrink-0 text-muted-foreground" />
                  </Link>
                </div>
              </div>

              {/* Scrollable menu body */}
              <div className="mt-2 flex-1 overflow-y-auto overscroll-contain px-3 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
                {signedIn && (
                  <>
                    <Section>
                      <DrawerItem href="/homes" icon={HomeIcon} label="My Homes" onNavigate={navigate} />
                    </Section>
                    <Divider />
                  </>
                )}

                <Section>
                  <DrawerItem href="/bible" icon={BookOpen} label="Bible" onNavigate={navigate} />
                  <DrawerItem href="/live-notes" icon={NotebookPen} label="Live Notes" onNavigate={navigate} />
                  <DrawerItem href="/articles" icon={Newspaper} label="Articles" onNavigate={navigate} />
                  {/* Book Store hidden from the front end for now — restore this item to re-enable. */}
                  {/* <DrawerItem href="/store" icon={ShoppingBag} label="Book Store" onNavigate={navigate} /> */}
                  <DrawerItem href="/library" icon={LibraryIcon} label="Library" onNavigate={navigate} />
                </Section>

                <Divider />

                <Section label="Activity">
                  <DrawerItem
                    href="/notifications"
                    icon={Bell}
                    label="Notifications"
                    onNavigate={navigate}
                    badge={notificationCount}
                  />
                  <DrawerItem href="/messages" icon={MessageCircle} label="Messages" onNavigate={navigate} />
                  <DrawerItem href="/saved" icon={Bookmark} label="Saved" onNavigate={navigate} />
                </Section>

                <Divider />

                <Section label="Preferences">
                  <AppearanceItem />
                  {signedIn && (
                    <DrawerItem href="/settings/privacy" icon={ShieldCheck} label="Privacy" onNavigate={navigate} />
                  )}
                  <DrawerItem href="/live#go-live" icon={Radio} label="Creator Studio" onNavigate={navigate} />
                </Section>

                <Divider />

                <Section label="Support">
                  <DrawerButton icon={UserPlus} label="Invite Friends" onClick={handleInvite} />
                  <DrawerItem
                    href="mailto:support@frequency.app"
                    icon={LifeBuoy}
                    label="Help & Support"
                    onNavigate={navigate}
                    external
                  />
                  <AboutItem />
                </Section>

                <Divider />

                {session?.user && (
                  <div className="pt-1">
                    <DrawerButton icon={LogOut} label="Sign Out" onClick={handleSignOut} destructive />
                    <DrawerButton
                      icon={Trash2}
                      label="Delete Account"
                      onClick={() => {
                        close()
                        setDeleteOpen(true)
                      }}
                      destructive
                    />
                  </div>
                )}
              </div>
            </aside>
          </div>,
          document.body,
        )}

      {session?.user && <DeleteAccountDialog open={deleteOpen} onOpenChange={setDeleteOpen} />}
    </>
  )
}

function Section({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <div className="py-1">
      {label && (
        <p className="px-4 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      )}
      <div className="flex flex-col">{children}</div>
    </div>
  )
}

function Divider() {
  return <div className="mx-4 my-1 h-px bg-border/50" aria-hidden />
}

const itemClasses =
  "group flex min-h-[56px] w-full items-center gap-4 rounded-2xl px-3 text-left transition-colors duration-150 hover:bg-secondary/60 active:bg-secondary/80"

function IconBubble({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary/70 text-foreground transition-transform duration-150 group-active:scale-105">
      <Icon className="size-[22px]" />
    </span>
  )
}

function CountBadge({ count }: { count: number }) {
  if (count <= 0) return null
  return (
    <span className="flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold leading-5 text-primary-foreground">
      {count > 99 ? "99+" : count}
    </span>
  )
}

function DrawerItem({
  href,
  icon,
  label,
  onNavigate,
  external,
  badge = 0,
}: {
  href: string
  icon: LucideIcon
  label: string
  onNavigate: () => void
  external?: boolean
  badge?: number
}) {
  if (external) {
    return (
      <a href={href} onClick={onNavigate} className={itemClasses}>
        <IconBubble icon={icon} />
        <span className="flex-1 text-[15px] font-medium text-foreground">{label}</span>
        <CountBadge count={badge} />
        <ChevronRight className="size-5 shrink-0 text-muted-foreground/60" />
      </a>
    )
  }
  return (
    <Link href={href} onClick={onNavigate} className={itemClasses}>
      <IconBubble icon={icon} />
      <span className="flex-1 text-[15px] font-medium text-foreground">{label}</span>
      <CountBadge count={badge} />
      <ChevronRight className="size-5 shrink-0 text-muted-foreground/60" />
    </Link>
  )
}

function DrawerButton({
  icon,
  label,
  onClick,
  destructive,
}: {
  icon: LucideIcon
  label: string
  onClick: () => void
  destructive?: boolean
}) {
  return (
    <button type="button" onClick={onClick} className={itemClasses}>
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-xl transition-transform duration-150 group-active:scale-105",
          destructive ? "bg-destructive/15 text-destructive" : "bg-secondary/70 text-foreground",
        )}
      >
        {(() => {
          const Icon = icon
          return <Icon className="size-[22px]" />
        })()}
      </span>
      <span className={cn("flex-1 text-[15px] font-medium", destructive ? "text-destructive" : "text-foreground")}>
        {label}
      </span>
    </button>
  )
}

/** Appearance row expands in place to reveal theme + skin controls. */
function AppearanceItem() {
  const { theme, setTheme } = useTheme()
  const { skin, setSkin, mounted: skinMounted } = useSkin()
  const [mounted, setMounted] = useState(false)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => setMounted(true), [])

  return (
    <div>
      <button type="button" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded} className={itemClasses}>
        <IconBubble icon={Moon} />
        <span className="flex-1 text-[15px] font-medium text-foreground">Appearance</span>
        <ChevronDown
          className={cn("size-5 shrink-0 text-muted-foreground/60 transition-transform duration-300", expanded && "rotate-180")}
        />
      </button>

      {expanded && (
        <div className="animate-in fade-in slide-in-from-top-2 space-y-4 px-3 py-3 duration-300">
          <div>
            <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Theme</p>
            <div className="grid grid-cols-2 gap-2">
              {themes.map((t) => {
                const Icon = t.icon
                const isActive = mounted && theme === t.value
                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setTheme(t.value)}
                    className={cn(
                      "flex items-center gap-2.5 rounded-2xl border px-3 py-2.5 text-sm font-medium transition-colors",
                      isActive
                        ? "border-primary/50 bg-primary/10 text-primary"
                        : "border-border/60 bg-secondary/40 text-foreground hover:bg-secondary/70",
                    )}
                  >
                    <Icon className="size-4 shrink-0" />
                    <span className="flex-1 text-left">{t.label}</span>
                    {isActive && <Check className="size-4 shrink-0" />}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <p className="mb-2 flex items-center gap-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Palette className="size-3.5" />
              Skin
            </p>
            <div className="grid grid-cols-2 gap-2">
              {SKINS.map((s) => {
                const isActive = skinMounted && skin === s.value
                return (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setSkin(s.value)}
                    className={cn(
                      "flex items-center gap-2.5 rounded-2xl border px-3 py-2.5 text-sm font-medium transition-colors",
                      isActive
                        ? "border-primary/50 bg-primary/10 text-primary"
                        : "border-border/60 bg-secondary/40 text-foreground hover:bg-secondary/70",
                    )}
                  >
                    <span
                      className="size-4 shrink-0 rounded-full ring-1 ring-inset ring-black/10"
                      style={{ backgroundImage: SKIN_SWATCH[s.value] }}
                      aria-hidden
                    />
                    <span className="flex-1 text-left">{s.label}</span>
                    {isActive && <Check className="size-4 shrink-0" />}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/** About row expands to show a short blurb + version. */
function AboutItem() {
  const [expanded, setExpanded] = useState(false)
  return (
    <div>
      <button type="button" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded} className={itemClasses}>
        <IconBubble icon={Info} />
        <span className="flex-1 text-[15px] font-medium text-foreground">About Frequency</span>
        <ChevronDown
          className={cn("size-5 shrink-0 text-muted-foreground/60 transition-transform duration-300", expanded && "rotate-180")}
        />
      </button>
      {expanded && (
        <div className="animate-in fade-in slide-in-from-top-2 px-4 py-3 text-sm leading-relaxed text-muted-foreground duration-300">
          <p>Frequency is a flagship Christian platform for live worship, teaching, community, and resources.</p>
          <p className="mt-2 text-xs text-muted-foreground/70">Version 1.0.0</p>
        </div>
      )}
    </div>
  )
}
