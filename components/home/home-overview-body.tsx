import { Calendar, Lock, MessageSquare, Radio, Rss, Users2 } from "lucide-react"
import type { HomeView } from "@/lib/home/types"
import { homeAccentStyle } from "@/lib/home/accent"

// The private member landing inside a Home. Surfaces (feed, community, rooms,
// events, live) are presented as branded entry points. They're placeholders in
// this phase — later phases populate each with member-scoped content. Nothing
// here is ever visible to non-members.
const SURFACES: { key: string; label: string; icon: React.ReactNode }[] = [
  { key: "feed", label: "Feed", icon: <Rss className="size-5" /> },
  { key: "community", label: "Community", icon: <MessageSquare className="size-5" /> },
  { key: "rooms", label: "Rooms", icon: <Radio className="size-5" /> },
  { key: "events", label: "Events", icon: <Calendar className="size-5" /> },
  { key: "members", label: "Members", icon: <Users2 className="size-5" /> },
]

export function HomeOverviewBody({ home }: { home: HomeView }) {
  return (
    <div className="mt-6 space-y-8" style={homeAccentStyle(home)}>
      {/* Privacy assurance strip */}
      <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-muted/40 px-4 py-2.5 text-xs text-muted-foreground">
        <Lock className="size-3.5 shrink-0" style={{ color: "var(--home-accent)" }} />
        <span className="text-pretty">
          This is a private Home. Everything here is visible only to members of {home.orgName}.
        </span>
      </div>

      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Explore your Home</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {SURFACES.map((s) => (
            <div
              key={s.key}
              className="group relative flex flex-col gap-2.5 rounded-2xl border border-border/60 bg-card p-4 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md"
            >
              <span
                className="flex size-11 items-center justify-center rounded-xl text-white"
                style={{ backgroundColor: "var(--home-accent)" }}
              >
                {s.icon}
              </span>
              <p className="text-sm font-semibold">{s.label}</p>
              <span className="absolute right-3 top-3 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Soon
              </span>
            </div>
          ))}
        </div>
      </section>

    </div>
  )
}
