"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Radio } from "lucide-react"
import { cn } from "@/lib/utils"
import { ADMIN_NAV } from "@/lib/admin-nav"
import { type AdminRole, ROLE_META, roleHasPermission } from "@/lib/rbac"
import { Badge } from "@/components/ui/badge"

/** Is `href` the active route for `pathname`? Exact for /admin, prefix otherwise. */
function isActive(pathname: string, href: string): boolean {
  const [base] = href.split("?")
  if (base === "/admin") return pathname === "/admin"
  return pathname === base || pathname.startsWith(base + "/")
}

export function AdminSidebar({
  role,
  onNavigate,
}: {
  role: AdminRole
  onNavigate?: () => void
}) {
  const pathname = usePathname()

  return (
    <div className="flex h-full flex-col">
      {/* Brand */}
      <div className="flex items-center gap-3 px-5 py-5">
        <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-soft">
          <Radio className="size-5" />
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold tracking-tight">Frequency</div>
          <div className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">Admin Console</div>
        </div>
      </div>

      {/* Role chip */}
      <div className="px-5 pb-3">
        <Badge variant="secondary" className="w-full justify-center rounded-lg py-1 text-[11px] font-medium">
          {ROLE_META[role].label}
        </Badge>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-6" data-scroll>
        {ADMIN_NAV.map((group) => {
          const items = group.items.filter((it) => !it.permission || roleHasPermission(role, it.permission))
          if (items.length === 0) return null
          return (
            <div key={group.label}>
              <div className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
                {group.label}
              </div>
              <div className="space-y-0.5">
                {items.map((item) => {
                  const active = isActive(pathname, item.href)
                  const Icon = item.icon
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onNavigate}
                      className={cn(
                        "group flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors",
                        active
                          ? "bg-primary/10 font-medium text-foreground ring-1 ring-inset ring-primary/20"
                          : "text-muted-foreground hover:bg-accent hover:text-foreground",
                      )}
                    >
                      <Icon
                        className={cn(
                          "size-4 shrink-0",
                          active ? "text-primary" : "text-muted-foreground group-hover:text-foreground",
                        )}
                      />
                      <span className="flex-1 truncate">{item.label}</span>
                      {item.status === "soon" && (
                        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
                          Soon
                        </span>
                      )}
                    </Link>
                  )
                })}
              </div>
            </div>
          )
        })}
      </nav>
    </div>
  )
}
