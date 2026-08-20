"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { ExternalLink, LogOut, Menu, Search, User } from "lucide-react"
import { authClient } from "@/lib/auth-client"
import { cn } from "@/lib/utils"
import { ADMIN_NAV } from "@/lib/admin-nav"
import { ROLE_META } from "@/lib/rbac"
import type { AdminActor } from "@/lib/admin-auth"
import { Button } from "@/components/ui/button"
import { ThemeSwitcher } from "@/components/theme-switcher"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

/** Resolve a friendly "Group / Page" crumb from the current path. */
function useCrumb(pathname: string): { group: string; label: string } {
  for (const group of ADMIN_NAV) {
    for (const item of group.items) {
      const base = item.href.split("?")[0]
      if (base === "/admin" ? pathname === "/admin" : pathname === base || pathname.startsWith(base + "/")) {
        return { group: group.label, label: item.label }
      }
    }
  }
  return { group: "Admin", label: "Console" }
}

export function AdminTopbar({
  actor,
  onMenuClick,
  onSearchClick,
}: {
  actor: AdminActor
  onMenuClick: () => void
  onSearchClick: () => void
}) {
  const pathname = usePathname()
  const router = useRouter()
  const crumb = useCrumb(pathname)

  async function handleSignOut() {
    await authClient.signOut()
    router.push("/sign-in")
    router.refresh()
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border/70 bg-background/80 px-4 backdrop-blur-xl sm:px-6">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={onMenuClick} aria-label="Open navigation">
        <Menu className="size-5" />
      </Button>

      {/* Breadcrumb */}
      <div className="hidden min-w-0 items-center gap-2 text-sm md:flex">
        <span className="truncate text-muted-foreground">{crumb.group}</span>
        <span className="text-muted-foreground/40">/</span>
        <span className="truncate font-medium">{crumb.label}</span>
      </div>

      {/* Search trigger */}
      <button
        type="button"
        onClick={onSearchClick}
        className="ml-auto flex h-9 w-full max-w-xs items-center gap-2 rounded-lg border border-border/70 bg-card/60 px-3 text-sm text-muted-foreground transition-colors hover:bg-accent md:ml-8"
      >
        <Search className="size-4" />
        <span className="flex-1 text-left">Search…</span>
        <kbd className="hidden rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium sm:inline">
          ⌘K
        </kbd>
      </button>

      <div className="flex items-center gap-1 md:ml-2">
        <Button
          variant="ghost"
          size="icon"
          render={<Link href="/" target="_blank" />}
          nativeButton={false}
          aria-label="Open public app"
          className="hidden sm:inline-flex"
        >
          <ExternalLink className="size-4" />
        </Button>

        <ThemeSwitcher />

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                aria-label="Account menu"
                className="flex items-center gap-2 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            }
          >
            <span
              className={cn(
                "flex size-8 items-center justify-center overflow-hidden rounded-full text-xs font-semibold",
                actor.color,
              )}
            >
              {actor.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={actor.image || "/placeholder.svg"} alt="" className="size-full object-cover" />
              ) : (
                actor.initials
              )}
            </span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="flex flex-col gap-0.5">
                <span className="truncate font-medium text-foreground">{actor.name}</span>
                <span className="truncate text-xs font-normal text-muted-foreground">{actor.email}</span>
                <span className="mt-1 inline-flex w-fit rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                  {ROLE_META[actor.role].label}
                </span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem render={<Link href={`/u/${actor.userId}`} />} className="gap-2">
                <User className="size-4" />
                Your profile
              </DropdownMenuItem>
              <DropdownMenuItem render={<Link href="/" />} className="gap-2">
                <ExternalLink className="size-4" />
                Public app
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut} className="gap-2 text-destructive">
                <LogOut className="size-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
