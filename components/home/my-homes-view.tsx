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
  RotateCcw,
  Trash2,
  Users,
} from "lucide-react"
import {
  deleteHome,
  getMyDeletedHomes,
  getMyHomeMemberships,
  reactivateHome,
  setActiveHome,
  leaveHome,
  type MyHomeLink,
} from "@/app/actions/home"
import { homeRoleLabel, isHomeAdminRole } from "@/lib/home/roles"
import { Sheet, SheetClose, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

/**
 * "My Homes" — a compact, flagship-feeling switcher. A native sub-header (back,
 * title, circular +) sits above a single "YOUR HOMES" list of the member's
 * Homes. Every row carries a 3-dot menu that opens the Home's public profile,
 * plus the destructive action for the viewer's role IN THAT HOME — members can
 * leave, and an owner can permanently delete the Home (admins can do neither).
 * Each row also shows that Home's own role beneath its name, because a role is
 * per-Home: the same person can be Admin in one and Member in another.
 *
 * The + reveals a bottom sheet offering both "Join a Home" and "Set up a new
 * Home" to EVERYONE — a person is not their organisation, so owning one Home
 * never prevents joining another as an ordinary member, nor creating a second.
 * Admin management lives on the org profile, reached from the 3-dot menu — never
 * from the account avatar.
 */
export function MyHomesView() {
  const router = useRouter()
  const { data, mutate, isLoading } = useSWR("my-homes-page", () => getMyHomeMemberships(), {
    revalidateOnFocus: false,
  })
  const homes = data ?? []
  // Homes this owner deleted that are still inside the 30-day recovery window.
  // Deletion is only genuinely recoverable if the owner can SEE what's pending —
  // the backend kept the row and the countdown, but nothing surfaced it, so the
  // window silently expired and the data was purged with no way back.
  const {
    data: deletedData,
    mutate: mutateDeleted,
    isLoading: loadingDeleted,
  } = useSWR("my-deleted-homes", () => getMyDeletedHomes(), { revalidateOnFocus: false })
  const deletedHomes = deletedData ?? []
  const [restoring, setRestoring] = useState<string | null>(null)
  const [restoreError, setRestoreError] = useState<string | null>(null)
  const [switching, setSwitching] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  // The Home whose 3-dot actions sheet is open (null = closed).
  const [actionsFor, setActionsFor] = useState<MyHomeLink | null>(null)
  // Which pane the actions sheet is showing: the menu, or a confirmation for
  // one of the irreversible actions.
  const [view, setView] = useState<"menu" | "leave" | "delete">("menu")
  const [leaving, setLeaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Typed confirmation for leaving a Home. Losing access is disruptive enough
  // (rejoining needs the Home key) that it shouldn't be a single stray tap.
  const [leaveConfirm, setLeaveConfirm] = useState("")
  const canLeaveConfirm = leaveConfirm.trim().toUpperCase() === "LEAVE"
  // While a destructive action is in flight the sheet must not be dismissable.
  const busyAction = leaving || deleting

  function closeActions() {
    setActionsFor(null)
    setView("menu")
    setError(null)
    setLeaveConfirm("")
  }

  // Open the Home/Organisation's public profile directly.
  function openProfile() {
    if (!actionsFor) return
    const handle = actionsFor.handle
    closeActions()
    router.push(`/org/${handle}`)
  }


  // Switch the active Home context. The interface stays identical — only the
  // organisation's data changes — so we land on the new Home's main feed.
  // This used to push "/", which is the Daily Devotional route, so changing
  // Home dropped the member on a single article instead of the Home itself.
  async function handleSwitch(handle: string, isActive: boolean) {
    if (isActive) {
      router.push("/feed")
      return
    }
    setSwitching(handle)
    await setActiveHome(handle)
    await mutate()
    router.push("/feed")
    router.refresh()
  }

  // Leave a Home membership. Owners never reach this (no trigger is rendered).
  async function handleLeave() {
    // Re-check the typed confirmation here too, so the action can't fire from a
    // stale enabled button or an Enter keypress.
    if (!actionsFor || !canLeaveConfirm) return
    setLeaving(true)
    setError(null)
    try {
      await leaveHome(actionsFor.handle)
      await mutate()
      closeActions()
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't leave this Home.")
    } finally {
      setLeaving(false)
    }
  }

  // Permanently delete a Home the viewer owns, along with all of its content.
  // The server re-checks ownership, so this is safe even though only owners see
  // the trigger.
  async function handleDelete() {
    if (!actionsFor) return
    setDeleting(true)
    setError(null)
    try {
      await deleteHome(actionsFor.handle)
      // Refresh both lists: the Home leaves "Your Homes" and immediately appears
      // under "Recently deleted" with its countdown, so the recovery route is
      // visible at the exact moment the owner might regret the deletion.
      await Promise.all([mutate(), mutateDeleted()])
      closeActions()
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't delete this Home.")
    } finally {
      setDeleting(false)
    }
  }

  // Restore a soft-deleted Home within its window. The server re-checks
  // ownership and that the purge hasn't already run, so a stale button that the
  // cron has since overtaken fails safely rather than resurrecting a shell.
  async function handleRestore(handle: string) {
    setRestoring(handle)
    setRestoreError(null)
    try {
      await reactivateHome(handle)
      await Promise.all([mutate(), mutateDeleted()])
      router.refresh()
    } catch (e) {
      setRestoreError(e instanceof Error ? e.message : "Couldn't restore this Home.")
    } finally {
      setRestoring(null)
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
            // Show the member's ACTUAL role in this Home (Owner, Administrator,
            // Content Manager, Member, …) rather than flattening every admin
            // role to "Admin". A user's role is per-Home, so this row is also
            // the only place they can see that they're an owner in one Home and
            // an ordinary member in another.
            const roleLabel = homeRoleLabel(h.role)
            const busy = switching === h.handle
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

                {/* 3-dot menu — on every row now. It opens the Home's public
                    profile for anyone, and adds the destructive actions that
                    apply to the viewer's role (leave for members, delete for
                    the owner). */}
                <span className="flex w-8 shrink-0 items-center justify-center">
                  <button
                    type="button"
                    onClick={() => setActionsFor(h)}
                    disabled={!!switching}
                    aria-label={`Options for ${h.name}`}
                    className="flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary/70 hover:text-foreground active:scale-90"
                  >
                    <MoreVertical className="size-[18px]" />
                  </button>
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* Recently deleted — only rendered when something is actually pending, so
          it never becomes permanent furniture. Each row states the remaining
          days plainly and offers a one-tap restore; once the countdown reaches
          zero the nightly purge removes the row and it disappears from here. */}
      {!loadingDeleted && deletedHomes.length > 0 && (
        <section aria-labelledby="recently-deleted-heading" className="mt-7">
          <p
            id="recently-deleted-heading"
            className="mb-2.5 px-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground"
          >
            Recently Deleted
          </p>
          <div className="flex flex-col gap-2">
            {deletedHomes.map((d) => {
              const busy = restoring === d.handle
              // Day 0 means the purge is imminent (the cron runs at 04:00), so
              // the copy shifts from a countdown to a last-chance warning.
              const urgent = d.daysRemaining <= 3
              return (
                <div
                  key={d.handle}
                  className="flex items-center gap-3 rounded-xl border border-dashed border-border/70 bg-secondary/20 px-3 py-2.5"
                >
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
                    <Trash2 className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block overflow-hidden text-ellipsis whitespace-nowrap text-[15px] font-semibold leading-tight text-foreground">
                      {d.name}
                    </span>
                    <span
                      className={cn(
                        "mt-1 block text-xs",
                        urgent ? "font-medium text-destructive" : "text-muted-foreground",
                      )}
                    >
                      {d.daysRemaining === 0
                        ? "Erased permanently today"
                        : `${d.daysRemaining} ${d.daysRemaining === 1 ? "day" : "days"} left to restore`}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRestore(d.handle)}
                    disabled={!!restoring}
                    className="flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3.5 text-xs font-semibold text-foreground transition-all hover:bg-secondary/60 active:scale-95 disabled:opacity-60"
                  >
                    {busy ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}
                    Restore
                  </button>
                </div>
              )
            })}
          </div>
          {restoreError && <p className="mt-2 px-1 text-sm font-medium text-destructive">{restoreError}</p>}
          <p className="mt-2.5 px-1 text-xs leading-relaxed text-muted-foreground">
            Restoring brings back the Home and its members. The join key stays revoked, so generate a new one when
            you&apos;re ready to admit new members.
          </p>
        </section>
      )}

      {/* Add-a-Home sheet — Join an existing Home / Set up a new one. Both are
          offered to everyone, owners included. */}
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          className="rounded-t-3xl border-border/60 p-0 pb-[max(1rem,env(safe-area-inset-bottom))]"
        >
          <SheetTitle className="sr-only">Add a Home</SheetTitle>
          <div className="mx-auto mt-3 h-1 w-9 rounded-full bg-border" aria-hidden />
          <div className="flex flex-col gap-1 p-3 pt-4">
            {/*
              "Join a Home" is available to EVERYONE, including owners. A person
              is not their organisation: the owner of Kingdom Academy is still an
              individual who may join Grace Community as an ordinary member, and
              their role is scoped to each Home separately. This was previously
              hidden from owners, which conflated the account with the
              organisation and locked owners out of participating anywhere else.
            */}
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

      {/* Per-home actions sheet. Opens as a menu (profile + role-specific
          destructive action) and swaps to an inline confirmation for the
          irreversible steps rather than stacking a second sheet. */}
      <Sheet open={!!actionsFor} onOpenChange={(open) => !open && !busyAction && closeActions()}>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          className="rounded-t-3xl border-border/60 p-0 pb-[max(1rem,env(safe-area-inset-bottom))]"
        >
          <SheetTitle className="sr-only">{actionsFor ? `Options for ${actionsFor.name}` : "Home options"}</SheetTitle>
          <div className="mx-auto mt-3 h-1 w-9 rounded-full bg-border" aria-hidden />

          {view === "menu" ? (
            <div className="flex flex-col gap-1 p-3 pt-4">
              {/* Identity header so it's unmistakable which Home is being acted on. */}
              <div className="mb-1 flex items-center gap-3 px-3 pb-2">
                <span
                  className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg text-xs font-bold text-white"
                  style={{ backgroundColor: actionsFor?.accent }}
                >
                  {actionsFor?.logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={actionsFor.logo || "/placeholder.svg"} alt="" className="size-full object-cover" />
                  ) : (
                    actionsFor?.initials
                  )}
                </span>
                <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-sm font-semibold text-foreground">
                  {actionsFor?.name}
                </span>
              </div>

              {/* Straight to the Home/Organisation's public profile. */}
              <button
                type="button"
                onClick={openProfile}
                className="flex items-center gap-4 rounded-2xl px-3 py-3.5 text-left transition-colors hover:bg-secondary/60"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-foreground">
                  <Building2 className="size-5" />
                </span>
                <span className="flex-1 text-[15px] font-medium text-foreground">
                  {actionsFor && isHomeAdminRole(actionsFor.role) ? "Visit Profile" : "Open Profile"}
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground/50" />
              </button>

              {/* Owner: delete the whole Home. Everyone else: leave it. */}
              {actionsFor?.role === "owner" ? (
                <button
                  type="button"
                  onClick={() => setView("delete")}
                  className="flex items-center gap-4 rounded-2xl px-3 py-3.5 text-left transition-colors hover:bg-destructive/10"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
                    <Trash2 className="size-5" />
                  </span>
                  <span className="flex-1 text-[15px] font-medium text-destructive">Delete Home</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setView("leave")}
                  className="flex items-center gap-4 rounded-2xl px-3 py-3.5 text-left transition-colors hover:bg-destructive/10"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
                    <LogOut className="size-5" />
                  </span>
                  <span className="flex-1 text-[15px] font-medium text-destructive">Leave Home</span>
                </button>
              )}
            </div>
          ) : (
            <div className="p-4 pt-4">
              {view === "delete" ? (
                <>
                  <p className="px-1 text-sm text-muted-foreground">
                    Delete <span className="font-semibold text-foreground">{actionsFor?.name}</span>? It disappears for
                    everyone immediately and members lose access right away. Its content is kept for 30 days, then
                    permanently erased.
                  </p>
                  <p className="mt-2 px-1 text-sm text-muted-foreground">
                    Members keep their accounts, and anything they posted under their own name stays on their profile.
                  </p>
                  {error && <p className="mt-3 px-1 text-sm font-medium text-destructive">{error}</p>}
                  <div className="mt-4 flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={busyAction}
                      className="flex h-12 items-center justify-center gap-2 rounded-full bg-destructive text-sm font-semibold text-destructive-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
                    >
                      {deleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                      Delete Home
                    </button>
                    <button
                      type="button"
                      onClick={() => setView("menu")}
                      disabled={busyAction}
                      className="flex h-12 items-center justify-center rounded-full text-sm font-semibold text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground disabled:opacity-60"
                    >
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="px-1 text-sm text-muted-foreground">
                    Leave <span className="font-semibold text-foreground">{actionsFor?.name}</span>? You&apos;ll lose
                    access to its content and need the Home key to rejoin.
                  </p>
                  {/* Typed confirmation — deliberate friction before losing access. */}
                  <label htmlFor="leave-confirm" className="mt-4 block px-1 text-xs text-muted-foreground">
                    Type <span className="font-semibold tracking-wide text-foreground">LEAVE</span> to confirm
                  </label>
                  <input
                    id="leave-confirm"
                    value={leaveConfirm}
                    onChange={(e) => setLeaveConfirm(e.target.value)}
                    disabled={busyAction}
                    autoComplete="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                    placeholder="LEAVE"
                    aria-describedby="leave-confirm-hint"
                    className="mt-2 h-12 w-full rounded-2xl border border-border bg-secondary/40 px-4 text-center text-sm font-semibold uppercase tracking-[0.2em] text-foreground placeholder:font-normal placeholder:tracking-normal placeholder:text-muted-foreground/50 focus-visible:border-destructive/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/30 disabled:opacity-60"
                  />
                  {error && <p className="mt-3 px-1 text-sm font-medium text-destructive">{error}</p>}
                  <div className="mt-4 flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={handleLeave}
                      disabled={busyAction || !canLeaveConfirm}
                      className="flex h-12 items-center justify-center gap-2 rounded-full bg-destructive text-sm font-semibold text-destructive-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
                    >
                      {leaving ? <Loader2 className="size-4 animate-spin" /> : <LogOut className="size-4" />}
                      Leave Home Membership
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setView("menu")
                        setLeaveConfirm("")
                      }}
                      disabled={busyAction}
                      className="flex h-12 items-center justify-center rounded-full text-sm font-semibold text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground disabled:opacity-60"
                    >
                      Cancel
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
