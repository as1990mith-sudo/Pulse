// TEMPORARY verification route — deleted after use. Dev-only.
import { NextResponse } from "next/server"
import { resolveAudience, type AudienceKind, type BroadcastPurpose } from "@/lib/events/audiences"

const HOME = "809dc239-9d17-479e-9cca-130d7609323e"

export async function GET() {
  if (process.env.NODE_ENV === "production") return NextResponse.json({ error: "nope" }, { status: 404 })

  const cases: { name: string; homeId: string; kind: AudienceKind; purpose: BroadcastPurpose; announcementId: number | null }[] = [
    { name: "event/registrants", homeId: HOME, kind: "event_registrants", purpose: "event", announcementId: 9 },
    { name: "marketing/registrants", homeId: HOME, kind: "event_registrants", purpose: "marketing", announcementId: 9 },
    { name: "event/attended", homeId: HOME, kind: "event_attended", purpose: "event", announcementId: 9 },
    { name: "event/no_show", homeId: HOME, kind: "event_no_show", purpose: "event", announcementId: 9 },
    { name: "CROSS-HOME(should be 0)", homeId: "00000000-0000-0000-0000-000000000000", kind: "event_registrants", purpose: "event", announcementId: 9 },
    { name: "event-scoped w/o event(should be 0)", homeId: HOME, kind: "event_registrants", purpose: "event", announcementId: null },
    { name: "marketing/non_member_contacts", homeId: HOME, kind: "non_member_registrants", purpose: "marketing", announcementId: null },
    { name: "event/non_member_contacts", homeId: HOME, kind: "non_member_registrants", purpose: "event", announcementId: null },
    { name: "event/home_members", homeId: HOME, kind: "home_members", purpose: "event", announcementId: null },
    { name: "marketing/home_members", homeId: HOME, kind: "home_members", purpose: "marketing", announcementId: null },
  ]

  const out: Record<string, string[]> = {}
  for (const c of cases) {
    const r = await resolveAudience({ homeId: c.homeId, kind: c.kind, announcementId: c.announcementId, purpose: c.purpose })
    out[c.name] = r.map((x) => x.email).sort()
  }
  return NextResponse.json(out)
}
