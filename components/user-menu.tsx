"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import useSWR from "swr"
import { LogOut, Radio, LayoutDashboard, User, ShieldCheck } from "lucide-react"
import { authClient } from "@/lib/auth-client"
import { checkIsAdmin } from "@/app/actions/admin"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { getAvatarColor, getHandle, getInitials } from "@/lib/identity"
import { cn } from "@/lib/utils"

export function UserMenu() {
  const router = useRouter()
  const { data: session, isPending } = authClient.useSession()
  const { data: isAdmin } = useSWR(session?.user ? "is-admin" : null, () => checkIsAdmin())

  if (isPending) {
    return <div className="size-8 animate-pulse rounded-full bg-muted" aria-hidden />
  }

  if (!session?.user) {
    return (
      <>
        <Button
          render={<Link href="/sign-in" />}
          nativeButton={false}
          variant="ghost"
          size="sm"
          className="hidden sm:inline-flex"
        >
          Sign in
        </Button>
        <Button render={<Link href="/sign-up" />} nativeButton={false} size="sm">
          Join
        </Button>
      </>
    )
  }

  const name = session.user.name || "Listener"
  const initials = getInitials(name)
  const color = getAvatarColor(session.user.id)

  async function handleSignOut() {
    await authClient.signOut()
    router.push("/sign-in")
    router.refresh()
  }

  return (
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
            color,
          )}
        >
          {session.user.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={session.user.image || "/placeholder.svg"} alt="" className="size-full object-cover" />
          ) : (
            initials
          )}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex flex-col gap-0.5">
            <span className="truncate font-medium text-foreground">{name}</span>
            <span className="truncate text-xs font-normal text-muted-foreground">{getHandle(name)}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem render={<Link href={`/u/${session.user.id}`} />} className="gap-2">
            <User className="size-4" />
            Your profile
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link href="/studio" />} className="gap-2">
            <Radio className="size-4" />
            Open studio
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link href="/settings/privacy" />} className="gap-2">
            <ShieldCheck className="size-4" />
            Privacy &amp; mentions
          </DropdownMenuItem>
          {isAdmin && (
            <DropdownMenuItem render={<Link href="/admin" />} className="gap-2">
              <LayoutDashboard className="size-4" />
              Content dashboard
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={handleSignOut} className="gap-2 text-destructive">
            <LogOut className="size-4" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
