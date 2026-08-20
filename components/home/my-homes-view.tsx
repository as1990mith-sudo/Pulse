"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import useSWR from "swr"
import { Check, ChevronLeft, ChevronRight, Building2, KeyRound, Plus, Loader2, Users } from "lucide-react"
import { getMyHomeMemberships, setActiveHome } from "@/app/actions/home"
import { isHomeAdminRole } from "@/lib/home/roles"
import { Sheet, SheetClose, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

/**
 * "My Homes" — a compact, flagship-feeling switcher. A native sub-header (back,
 * title, circular +) sits above a single "YOUR HOMES" list of the member's
 * Homes. The + reveals a premium bottom sheet with the only two add-actions
 * (Join / Set up), so the main screen stays quiet and free of helper text.
 * Admin management lives on the organisation profile, not here.
 */
export function MyHomesView() {
  const router = useRouter()
  const { data, mutate, isLoading } = useSWR("my-homes-page", () => getMyHomeMemberships(), {
    revalidateOnFocus: false,
  })
  const homes = data ?? []
  const [switching, setSwitching] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)

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

        <h1 className="ml-1 text-base font-semibold tracking-tight text-foreground">
          My Homes
        </h1>

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
            return (
              <button
                key={h.handle}
                type="button"
                onClick={() => handleSwitch(h.handle, h.isActive)}
                disabled={!!switching}
                className={cn(
                  "group flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all active:scale-[0.99]",
                  h.isActive
                    ? "border-primary/50 bg-primary/[0.06]"
                    : "border-border/60 hover:border-border hover:bg-secondary/40",
                  switching && !busy && "opacity-40",
                )}
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

                {/* Fixed-width right slot — reserved so the name never steals it. */}
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
            )
          })}
        </div>
      )}

      {/* Add-a-Home sheet — the only path to Join / Set up. */}
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          className="rounded-t-3xl border-border/60 p-0 pb-[max(1rem,env(safe-area-inset-bottom))]"
        >
          <SheetTitle className="sr-only">Add a Home</SheetTitle>
          <div className="mx-auto mt-3 h-1 w-9 rounded-full bg-border" aria-hidden />
          <div className="flex flex-col gap-1 p-3 pt-4">
            <SheetClose
              render={
                <Link href="/home/join" className="flex items-center gap-4 rounded-2xl px-3 py-3.5 transition-colors hover:bg-secondary/60">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-foreground">
                    <KeyRound className="size-5" />
                  </span>
                  <span className="flex-1 text-[15px] font-medium text-foreground">Join a Home</span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground/50" />
                </Link>
              }
            />
            <SheetClose
              render={
                <Link href="/sign-up/home" className="flex items-center gap-4 rounded-2xl px-3 py-3.5 transition-colors hover:bg-secondary/60">
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
    </div>
  )
}
