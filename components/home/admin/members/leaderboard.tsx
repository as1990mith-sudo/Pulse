"use client"

import { LEADERBOARD_RANKINGS, type EngagementLeader, type LeaderboardRanking } from "@/lib/home/members"
import { MemberAvatar, Segmented } from "./shared"

// Admin-only engagement insight — an analytical view of who contributes most,
// never a public competition. Ranking switches instantly (recomputed server-side
// and re-sorted on refresh).
export function Leaderboard({
  leaders,
  ranking,
  onRankingChange,
  onSelect,
}: {
  leaders: EngagementLeader[]
  ranking: LeaderboardRanking
  onRankingChange: (r: LeaderboardRanking) => void
  onSelect: (membershipId: string) => void
}) {
  return (
    <section className="rounded-2xl border border-border/50 bg-card/50 p-3.5 backdrop-blur-xl lg:p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Most engaged</h2>
        <Segmented
          size="sm"
          ariaLabel="Leaderboard ranking"
          options={LEADERBOARD_RANKINGS}
          value={ranking}
          onChange={onRankingChange}
        />
      </div>

      {leaders.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">No engagement data yet</p>
      ) : (
        <ol className="flex flex-col gap-0.5">
          {leaders.map((l, i) => (
            <li key={l.membershipId}>
              <button
                type="button"
                onClick={() => onSelect(l.membershipId)}
                className="tap-scale group flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-foreground/[0.04]"
              >
                <span
                  className="w-4 shrink-0 text-center font-display text-sm font-semibold tabular-nums"
                  style={{ color: i === 0 ? "var(--home-accent)" : undefined }}
                >
                  {i + 1}
                </span>
                <MemberAvatar name={l.name} image={l.image} initials={l.initials} color={l.color} className="size-9" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{l.name}</p>
                  <p className="truncate text-[11px] tabular-nums text-muted-foreground">
                    {l.posts} posts · {l.comments} comments · {l.likes} likes
                  </p>
                </div>
                <span className="shrink-0 text-right">
                  <span className="block font-display text-sm font-semibold tabular-nums">{l.score.toLocaleString()}</span>
                  <span className="block text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Score
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
