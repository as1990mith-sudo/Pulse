"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowRight, CornerDownLeft, Search } from "lucide-react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { ADMIN_NAV, QUICK_ACTIONS } from "@/lib/admin-nav"
import { type AdminRole, roleHasPermission } from "@/lib/rbac"

type Entry = {
  id: string
  label: string
  href: string
  group: string
  icon: React.ComponentType<{ className?: string }>
  keywords?: string
  soon?: boolean
}

export function CommandPalette({
  open,
  onOpenChange,
  role,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  role: AdminRole
}) {
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [active, setActive] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  const entries = useMemo<Entry[]>(() => {
    const nav: Entry[] = ADMIN_NAV.flatMap((g) =>
      g.items
        .filter((it) => !it.permission || roleHasPermission(role, it.permission))
        .map((it) => ({
          id: `nav:${it.href}`,
          label: it.label,
          href: it.href,
          group: g.label,
          icon: it.icon,
          keywords: it.keywords,
          soon: it.status === "soon",
        })),
    )
    const actions: Entry[] = QUICK_ACTIONS.filter(
      (a) => !a.permission || roleHasPermission(role, a.permission),
    ).map((a) => ({
      id: `action:${a.href}`,
      label: a.label,
      href: a.href,
      group: "Quick Actions",
      icon: a.icon,
    }))
    return [...actions, ...nav]
  }, [role])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return entries
    return entries.filter(
      (e) =>
        e.label.toLowerCase().includes(q) ||
        e.group.toLowerCase().includes(q) ||
        (e.keywords ?? "").toLowerCase().includes(q),
    )
  }, [entries, query])

  useEffect(() => {
    setActive(0)
  }, [query])

  // Reset query whenever the palette opens.
  useEffect(() => {
    if (open) setQuery("")
  }, [open])

  function go(href: string) {
    onOpenChange(false)
    router.push(href)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setActive((a) => Math.min(a + 1, results.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === "Enter") {
      e.preventDefault()
      const item = results[active]
      if (item) go(item.href)
    }
  }

  // Keep the active row scrolled into view.
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-index="${active}"]`)
    el?.scrollIntoView({ block: "nearest" })
  }, [active])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="overflow-hidden p-0 sm:max-w-xl"
        onKeyDown={onKeyDown}
      >
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <div className="flex items-center gap-3 border-b border-border/70 px-4">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search pages and actions…"
            className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="hidden rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline">
            ESC
          </kbd>
        </div>

        <div ref={listRef} className="max-h-80 overflow-y-auto p-2" data-scroll>
          {results.length === 0 ? (
            <div className="px-3 py-10 text-center text-sm text-muted-foreground">No results for “{query}”.</div>
          ) : (
            results.map((e, i) => {
              const Icon = e.icon
              return (
                <button
                  key={e.id}
                  data-index={i}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(e.href)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors",
                    i === active ? "bg-accent text-foreground" : "text-muted-foreground",
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  <span className="flex-1 truncate text-foreground">{e.label}</span>
                  {e.soon && <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Soon</span>}
                  <span className="text-[11px] text-muted-foreground">{e.group}</span>
                  {i === active ? (
                    <CornerDownLeft className="size-3.5 text-muted-foreground" />
                  ) : (
                    <ArrowRight className="size-3.5 opacity-0" />
                  )}
                </button>
              )
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
