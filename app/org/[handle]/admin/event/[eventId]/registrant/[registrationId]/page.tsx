import { notFound } from "next/navigation"
import Link from "next/link"
import { ChevronLeft, Mail, Phone, Users } from "lucide-react"
import { getEventRegistrationDetail } from "@/app/actions/event-admin"
import { EYEBROW, formatDay, genderLabel, MemberBadge } from "@/components/home/admin/events/shared"
import { cn } from "@/lib/utils"

export default async function RegistrantDetailPage({
  params,
}: {
  params: Promise<{ handle: string; eventId: string; registrationId: string }>
}) {
  const { handle, eventId, registrationId } = await params
  const regId = Number(registrationId)
  if (!Number.isInteger(regId)) notFound()

  const data = await getEventRegistrationDetail({ handle, registrationId: regId })
  if (!data) notFound()

  const { row, event, history } = data
  const answered = event.questions.filter(
    (q) => row.answers && row.answers[q.id] !== undefined && row.answers[q.id] !== "",
  )

  return (
    <div className="flex flex-col gap-5">
      <Link
        href={`/org/${handle}/admin/event/${event.id}`}
        className="tap-scale inline-flex w-fit max-w-full items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-4 shrink-0" aria-hidden="true" />
        <span className="truncate">{event.title}</span>
      </Link>

      {/* Identity */}
      <div>
        <h1 className="flex flex-wrap items-center gap-2 font-display text-xl font-bold tracking-tight">
          {row.fullName}
          <MemberBadge isMember={row.isMember} />
        </h1>
        <p className={cn(EYEBROW, "mt-1.5 text-muted-foreground")}>
          Registered {formatDay(row.createdAt)} · {row.source === "member" ? "in the app" : "public page"}
        </p>
      </div>

      {/* Contact */}
      <section className="overflow-hidden rounded-2xl border border-border/50 bg-card/50 backdrop-blur-xl">
        <InfoRow label="Gender" value={genderLabel(row.gender)} />
        <LinkRow href={`mailto:${row.email}`} icon={<Mail className="size-4 shrink-0 text-muted-foreground" />} label="Email" value={row.email} />
        {row.phone ? (
          <LinkRow href={`tel:${row.phone}`} icon={<Phone className="size-4 shrink-0 text-muted-foreground" />} label="Phone" value={row.phone} />
        ) : null}
        {row.guests > 1 ? (
          <div className="flex items-center justify-between gap-3 border-t border-border/40 px-4 py-3 first:border-t-0">
            <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
              <Users className="size-4 shrink-0" /> Party size
            </span>
            <span className="text-sm font-medium tabular-nums">{row.guests}</span>
          </div>
        ) : null}
      </section>

      {/* Marketing consent — the one fact most easily got wrong when composing a
          broadcast, so it is stated explicitly rather than implied. */}
      <p className="text-xs text-muted-foreground">
        {row.marketingOptIn ? "Opted in to news and updates." : "Event emails only — has not opted in to marketing."}
      </p>

      {/* Answers to this event's questions */}
      {answered.length > 0 ? (
        <section>
          <h2 className={cn(EYEBROW, "mb-2 text-muted-foreground")}>Registration answers</h2>
          <dl className="flex flex-col gap-2 rounded-2xl border border-border/50 bg-card/50 p-4 backdrop-blur-xl">
            {answered.map((q) => (
              <div key={q.id}>
                <dt className={cn(EYEBROW, "text-muted-foreground")}>{q.label}</dt>
                <dd className="mt-0.5 text-sm">{String(row.answers?.[q.id])}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      {/* Event history within this Home */}
      <section>
        <h2 className={cn(EYEBROW, "mb-2 text-muted-foreground")}>Event history</h2>
        {history.length <= 1 ? (
          <p className="rounded-2xl border border-border/50 bg-card/50 px-4 py-4 text-xs text-muted-foreground backdrop-blur-xl">
            First event with this church.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border/40 overflow-hidden rounded-2xl border border-border/50 bg-card/50 backdrop-blur-xl">
            {history.map((h) => (
              <li key={h.registrationId} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="min-w-0">
                  <span className="block truncate text-sm">{h.title}</span>
                  {h.eventDate ? (
                    <span className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">{h.eventDate}</span>
                  ) : null}
                </span>
                <span className="shrink-0 text-[10px] uppercase tracking-[0.1em] tabular-nums text-muted-foreground">
                  {h.status === "cancelled" ? "Cancelled" : "Registered"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-border/40 px-4 py-3 first:border-t-0">
      <span className={cn(EYEBROW, "text-muted-foreground")}>{label}</span>
      <span className="truncate text-right text-sm font-medium">{value}</span>
    </div>
  )
}

function LinkRow({
  href,
  icon,
  label,
  value,
}: {
  href: string
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <a
      href={href}
      className="tap-scale flex items-center justify-between gap-3 border-t border-border/40 px-4 py-3 transition-colors first:border-t-0 hover:bg-foreground/[0.04]"
    >
      <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
        {icon} {label}
      </span>
      <span className="truncate text-right text-sm font-medium">{value}</span>
    </a>
  )
}
