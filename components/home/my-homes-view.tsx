"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import useSWR from "swr"
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Building2,
  KeyRound,
  Plus,
  Loader2,
  LogOut,
  MoreVertical,
  Users,
} from "lucide-react"
import { getMyHomeMemberships, setActiveHome, leaveHome, type MyHomeLink } from "@/app/actions/home"
import { isHomeAdminRole } from "@/lib/home/roles"
import { Sheet, SheetClose, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

/**
 * "My Homes" — a compact, flagship-feeling switcher. A native sub-header (back,
 * title, circular +) sits above a single "YOUR HOMES" list of the member's
 * Homes. Each row carries a 3-dot menu so members can leave a Home; owners have
 * no leave option (they own it). The + reveals a premium bottom sheet with the
 * add-actions — "Join a Home" is hidden for owners, since a Home account can't
 * become a member of another Home. Admin management lives on the org profile.
 */
export function MyHomesView() {
  const router = useRouter()
  const { data, mutate, isLoading } = useSWR("my-homes-page", () => getMyHomeMemberships(), {
    revalidateOnFocus: false,
  })
  const homes = data ?? []
  const [switching, setSwitching] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  // The Home whose 3-dot actions sheet is open (null = closed).
  const [actionsFor, setActionsFor] = useState<MyHomeLink | null>(null)
  const [leaving, setLeaving] = useState(false)

  // Owners of a Home cannot join another Home (a Home can't be a member of a
  // Home), so the "Join a Home" action is hidden from their + menu.
  const isOwner = homes.some((h) => h.role === "owner")

  // Switch the active Home context. The interface stays identical — only the
  // organisation's data changes — so we land back at the root of the same UI.
  async function handleSwitch(handle: string, isActive: boolean) {
    if (isActive) {
      router.push("/")
      return
    }
    setSwitching(handle)
    await setActiveHome(handle)
    await mutate()
    router.push("/")
    router.refresh()
  }

  // Leave a Home membership. Owners never reach this (no trigger is rendered).
  async function handleLeave() {
    if (!actionsFor) return
    setLeaving(true)
    try {
      await leaveHome(actionsFor.handle)
      await mutate()
      setActionsFor(null)
      router.refresh()
    } finally {
      setLeaving(false)
    }
  }

  return (
    <div className="flex flex-col">
      {/* Native sub-header: back + title (left) · add (right). Nothing else. */}
      <header className="relative flex h-12 items-center">
        <button
          type="button"
          onClick={() => router.push("/")}
          aria-label="Back"
          className="flex size-9 items-center justify-center rounded-full text-muted-foreground transition-all hover:bg-secondary/60 hover:text-foreground active:scale-90"
        >
          <ChevronLeft className="size-5" />
        </button>

        <h1 className="ml-1 text-base font-semibold tracking-tight text-foreground">My Homes</h1>

        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-label="Add a Home"
          className="ml-auto flex size-9 items-center justify-center rounded-full border border-border bg-card text-primary transition-all hover:bg-secondary/60 active:scale-90"
        >
          <Plus className="size-5" />
        </button>
      </header>

      {/* Your Homes */}
      <p className="mt-5 mb-2.5 px-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        Your Homes
      </p>

      {isLoading ? (
        <div className="flex items-center justify-center py-10 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : homes.length === 0 ? (
        <p className="px-1 py-6 text-sm text-muted-foreground">Tap + to join or set up a Home.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {homes.map((h) => {
            const roleLabel = isHomeAdminRole(h.role) ? "Admin" : "Member"
            const busy = switching === h.handle
            const canLeave = h.role !== "owner"
            return (
              <div
                key={h.handle}
                className={cn(
                  "group flex w-full items-center rounded-xl border pr-1 transition-all",
                  h.isActive
                    ? "border-primary/50 bg-primary/[0.06]"
                    : "border-border/60 hover:border-border hover:bg-secondary/40",
                  switching && !busy && "opacity-40",
                )}
              >
                <button
                  type="button"
                  onClick={() => handleSwitch(h.handle, h.isActive)}
                  disabled={!!switching}
                  className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left active:scale-[0.99]"
                >
                  <span
                    className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-lg text-sm font-bold text-white"
                    style={{ backgroundColor: h.accent }}
                  >
                    {h.logo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={h.logo || "/placeholder.svg"} alt="" className="size-full object-cover" />
                    ) : (
                      h.initials
                    )}
                  </span>

                  <span className="min-w-0 flex-1">
                    {/* Name — always exactly one line, ellipsis on overflow. */}
                    <span className="block overflow-hidden text-ellipsis whitespace-nowrap text-[15px] font-semibold leading-tight text-foreground">
                      {h.name}
                    </span>
                    <span className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span>{roleLabel}</span>
                      {typeof h.memberCount === "number" && (
                        <>
                          <span className="text-muted-foreground/40" aria-hidden>
                            |
                          </span>
                          <Users className="size-3" aria-hidden />
                          <span>{h.memberCount}</span>
                        </>
                      )}
                    </span>
                  </span>

                  {/* Active/loading indicator, kept inside the switch button. */}
                  <span className="flex w-5 shrink-0 items-center justify-center">
                    {busy ? (
                      <Loader2 className="size-4 animate-spin text-primary" />
                    ) : h.isActive ? (
                      <Check className="size-[18px] text-primary" strokeWidth={2.5} />
                    ) : (
                      <ChevronRight className="size-4 text-muted-foreground/30 transition-colors group-hover:text-muted-foreground/60" />
                    )}
                  </span>
                </button>

                {/* 3-dot menu — members can leave; owners get no trigger. A fixed
                    slot keeps every row aligned whether or not the dots show. */}
                <span className="flex w-8 shrink-0 items-center justify-center">
                  {canLeave && (
                    <button
                      type="button"
                      onClick={() => setActionsFor(h)}
                      disabled={!!switching}
                      aria-label={`Options for ${h.name}`}
                      className="flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary/70 hover:text-foreground active:scale-90"
                    >
                      <MoreVertical className="size-[18px]" />
                    </button>
                  )}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* Add-a-Home sheet — Join (members only) / Set up a new Home. */}
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          className="rounded-t-3xl border-border/60 p-0 pb-[max(1rem,env(safe-area-inset-bottom))]"
        >
          <SheetTitle className="sr-only">Add a Home</SheetTitle>
          <div className="mx-auto mt-3 h-1 w-9 rounded-full bg-border" aria-hidden />
          <div className="flex flex-col gap-1 p-3 pt-4">
            {!isOwner && (
              <SheetClose
                render={
                  <Link
                    href="/home/join"
                    className="flex items-center gap-4 rounded-2xl px-3 py-3.5 transition-colors hover:bg-secondary/60"
                  >
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-foreground">
                      <KeyRound className="size-5" />
                    </span>
                    <span className="flex-1 text-[15px] font-medium text-foreground">Join a Home</span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground/50" />
                  </Link>
                }
              />
            )}
            <SheetClose
              render={
                <Link
                  href="/sign-up/home"
                  className="flex items-center gap-4 rounded-2xl px-3 py-3.5 transition-colors hover:bg-secondary/60"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Building2 className="size-5" />
                  </span>
                  <span className="flex-1 text-[15px] font-medium text-foreground">Set Up a New Home</span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground/50" />
                </Link>
              }
            />
          </div>
        </SheetContent>
      </Sheet>

      {/* Per-home actions sheet — currently the leave-membership confirmation. */}
      <Sheet open={!!actionsFor} onOpenChange={(open) => !open && !leaving && setActionsFor(null)}>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          className="rounded-t-3xl border-border/60 p-0 pb-[max(1rem,env(safe-area-inset-bottom))]"
        >
          <SheetTitle className="sr-only">{actionsFor ? `Options for ${actionsFor.name}` : "Home options"}</SheetTitle>
          <div className="mx-auto mt-3 h-1 w-9 rounded-full bg-border" aria-hidden />
          <div className="p-4 pt-4">
            <p className="px-1 text-sm text-muted-foreground">
              Leave <span className="font-semibold text-foreground">{actionsFor?.name}</span>? You&apos;ll lose access
              to its content and need the Home key to rejoin.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                onClick={handleLeave}
                disabled={leaving}
                className="flex h-12 items-center justify-center gap-2 rounded-full bg-destructive text-sm font-semibold text-destructive-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {leaving ? <Loader2 className="size-4 animate-spin" /> : <LogOut className="size-4" />}
                Leave Home Membership
              </button>
              <button
                type="button"
                onClick={() => setActionsFor(null)}
                disabled={leaving}
                className="flex h-12 items-center justify-center rounded-full text-sm font-semibold text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
