"use client"

import { ChevronLeft, ChevronRight, Users } from "lucide-react"
import { cn } from "@/lib/utils"
import type { MemberDirectoryRow } from "@/lib/home/members"
import { ActivityDot, GenderTag, MemberAvatar, RoleBadge, formatJoined } from "./shared"

export function Directory({
  rows,
  total,
  page,
  pageSize,
  loading,
  onSelect,
  onPage,
}: {
  rows: MemberDirectoryRow[]
  total: number
  page: number
  pageSize: number
  loading: boolean
  onSelect: (id: string) => void
  onPage: (page: number) => void
}) {
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1
  const end = Math.min(total, page * pageSize)
  const lastPage = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-border/50 bg-card/40 backdrop-blur-xl transition-opacity",
        loading && "opacity-60",
      )}
    >
      {rows.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="divide-y divide-border/40">
          {rows.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => onSelect(m.id)}
                className="tap-scale group grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-foreground/[0.04] lg:px-4"
              >
                <MemberAvatar
                  name={m.name}
                  image={m.image}
                  initials={m.initials}
                  color={m.color}
                  className="size-10 lg:size-11"
                />

                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-sm font-medium">{m.name}</p>
                    {m.isViewer && <span className="text-[11px] font-normal text-muted-foreground">(you)</span>}
                    <RoleBadge role={m.role} status={m.status} />
                  </div>
                  <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                    <GenderTag gender={m.gender} />
                    <span aria-hidden>·</span>
                    <span>Joined {formatJoined(m.joinedAt)}</span>
                  </p>
                </div>

                <div className="flex items-center gap-2 lg:gap-3">
                  <div className="flex flex-col items-end gap-0.5 text-right">
                    <ActivityDot level={m.engagement.level} withLabel />
                    <span className="text-[11px] tabular-nums text-muted-foreground">
                      <span className="lg:hidden">
                        {m.engagement.posts} · {m.engagement.comments} · {m.engagement.likes}
                      </span>
                      <span className="hidden lg:inline">
                        {m.engagement.posts} posts · {m.engagement.comments} comments · {m.engagement.likes} likes
                      </span>
                    </span>
                  </div>
                  <ChevronRight className="hidden size-4 shrink-0 text-muted-foreground/40 transition-colors group-hover:text-muted-foreground sm:block" />
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {total > pageSize && (
        <div className="flex items-center justify-between gap-3 border-t border-border/40 px-4 py-2.5">
          <p className="text-[11px] tabular-nums text-muted-foreground">
            {start.toLocaleString()}–{end.toLocaleString()} of {total.toLocaleString()}
          </p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onPage(page - 1)}
              disabled={page <= 1}
              className="tap-scale flex size-7 items-center justify-center rounded-lg border border-border/60 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
              aria-label="Previous page"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => onPage(page + 1)}
              disabled={page >= lastPage}
              className="tap-scale flex size-7 items-center justify-center rounded-lg border border-border/60 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
              aria-label="Next page"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <span className="flex size-11 items-center justify-center rounded-full bg-muted/40 text-muted-foreground">
        <Users className="size-5" />
      </span>
      <p className="text-sm font-medium">No members found</p>
    </div>
  )
}
