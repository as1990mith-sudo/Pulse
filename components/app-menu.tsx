"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useTheme } from "next-themes"
import {
  BookOpen,
  ChevronRight,
  Contrast,
  Leaf,
  Library as LibraryIcon,
  Menu,
  Moon,
  MoonStar,
  Palette,
  ShoppingBag,
  Sun,
  Check,
  X,
  type LucideIcon,
} from "lucide-react"
import { authClient } from "@/lib/auth-client"
import { SKINS, useSkin } from "@/components/skin-provider"
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

function greetingFor(date: Date): string {
  const h = date.getHours()
  if (h < 12) return "Good morning"
  if (h < 18) return "Good afternoon"
  return "Good evening"
}

/**
 * The premium app menu: a floating, glassy hamburger button that opens a
 * half-height bottom sheet with a time-aware greeting and four large menu
 * cards (Bible, Theme, Store, Library). The Theme card expands in place to
 * expose the full appearance + skin controls.
 */
export function AppMenu() {
  const [open, setOpen] = useState(false)
  const { data: session } = authClient.useSession()

  const firstName = (session?.user?.name || "friend").trim().split(/\s+/)[0]

  // Lock background scroll + allow Escape to dismiss while the sheet is open.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener("keydown", onKey)
    }
  }, [open])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        aria-haspopup="dialog"
        aria-expanded={open}
        className="menu-fab tap-scale flex size-10 items-center justify-center rounded-2xl border border-border/60 bg-secondary/40 text-foreground shadow-soft backdrop-blur-md transition-all duration-200 hover:bg-secondary/70"
      >
        <Menu className="size-[18px]" />
      </button>

      {open && (
        <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="Menu">
          {/* Blurred scrim */}
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-background/50 backdrop-blur-md animate-in fade-in duration-300"
          />

          {/* Half-height floating sheet with a spring slide-up */}
          <div
            className="absolute inset-x-0 bottom-0 flex max-h-[86vh] min-h-[64vh] flex-col rounded-t-[2rem] border-t border-border/60 bg-popover/95 pb-safe-4 shadow-floating backdrop-blur-2xl animate-in slide-in-from-bottom-10 fade-in duration-500 [animation-timing-function:cubic-bezier(0.34,1.56,0.64,1)]"
          >
            {/* Grabber */}
            <div className="flex shrink-0 items-center justify-center pt-3">
              <span className="h-1.5 w-10 rounded-full bg-muted-foreground/40" aria-hidden />
            </div>

            <div data-scroll className="flex-1 overflow-y-auto overscroll-contain px-5 pt-4">
              <div className="mx-auto w-full max-w-md">
                {/* Greeting */}
                <div className="mb-6 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-muted-foreground">{greetingFor(new Date())}</p>
                    <h2 className="mt-0.5 truncate font-display text-2xl font-semibold tracking-tight text-foreground">
                      {firstName}
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label="Close"
                    className="tap-scale flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary/60 text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-4" />
                  </button>
                </div>

                {/* Menu cards */}
                <div className="flex flex-col gap-3 pb-4">
                  <MenuCard
                    href="/bible"
                    icon={BookOpen}
                    title="Bible"
                    subtitle="Read, study and explore God's Word."
                    onNavigate={() => setOpen(false)}
                  />

                  <ThemeCard />

                  <MenuCard
                    href="/store"
                    icon={ShoppingBag}
                    title="Store"
                    subtitle="Books, Courses & Resources"
                    onNavigate={() => setOpen(false)}
                  />

                  <MenuCard
                    href="/library"
                    icon={LibraryIcon}
                    title="Library"
                    subtitle="Your books & courses in one place"
                    onNavigate={() => setOpen(false)}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function cardClasses() {
  return "group relative flex w-full items-center gap-4 rounded-[1.75rem] border border-border/60 bg-card/70 p-4 text-left shadow-soft backdrop-blur-md transition-all duration-200 hover:border-border active:scale-[0.99]"
}

function MenuCard({
  href,
  icon: Icon,
  title,
  subtitle,
  onNavigate,
}: {
  href: string
  icon: LucideIcon
  title: string
  subtitle: string
  onNavigate: () => void
}) {
  return (
    <Link href={href} onClick={onNavigate} className={cardClasses()}>
      <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary">
        <Icon className="size-6" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-base font-semibold text-foreground">{title}</span>
        <span className="mt-0.5 block truncate text-sm text-muted-foreground">{subtitle}</span>
      </span>
      <ChevronRight className="size-5 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5" />
    </Link>
  )
}

/** The Theme card expands in place to reveal appearance + skin controls. */
function ThemeCard() {
  const { theme, setTheme } = useTheme()
  const { skin, setSkin, mounted: skinMounted } = useSkin()
  const [mounted, setMounted] = useState(false)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => setMounted(true), [])

  return (
    <div className="rounded-[1.75rem] border border-border/60 bg-card/70 shadow-soft backdrop-blur-md">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-4 p-4 text-left transition-all duration-200 active:scale-[0.99]"
      >
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary">
          <Moon className="size-6" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-semibold text-foreground">Theme</span>
          <span className="mt-0.5 block truncate text-sm text-muted-foreground">Customize your experience.</span>
        </span>
        <ChevronRight
          className={cn(
            "size-5 shrink-0 text-muted-foreground transition-transform duration-300",
            expanded && "rotate-90",
          )}
        />
      </button>

      {expanded && (
        <div className="animate-in fade-in slide-in-from-top-2 space-y-4 border-t border-border/60 px-4 py-4 duration-300">
          <div>
            <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Appearance</p>
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
