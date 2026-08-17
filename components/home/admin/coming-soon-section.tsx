import { Sparkles } from "lucide-react"

// Premium placeholder for admin sections whose full functionality lands in a
// later phase (Content, Community, Rooms, Events, Live, Pastoral,
// Notifications, Analytics). Kept deliberately calm and on-brand so the
// console feels complete rather than unfinished.
export function ComingSoonSection({ label, description }: { label: string; description: string }) {
  return (
    <div className="flex min-h-[22rem] flex-col items-center justify-center rounded-3xl border border-dashed border-border/70 bg-card/40 px-6 py-16 text-center">
      <div
        className="mb-5 flex size-14 items-center justify-center rounded-2xl text-white shadow-elevated"
        style={{ backgroundColor: "var(--home-accent)" }}
      >
        <Sparkles className="size-6" />
      </div>
      <h2 className="text-lg font-semibold tracking-tight">{label} is on the way</h2>
      <p className="mt-2 max-w-md text-pretty text-sm leading-relaxed text-muted-foreground">{description}</p>
    </div>
  )
}
