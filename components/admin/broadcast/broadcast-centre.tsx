"use client"

import { useState, useTransition } from "react"
import useSWR from "swr"
import { toast } from "sonner"
import {
  Megaphone,
  Send,
  CalendarClock,
  FileText,
  Bell,
  Users,
  Trash2,
  CheckCircle2,
  Radio,
} from "lucide-react"
import { PageHeader, StatCard, StatusBadge, EmptyState, AdminCard } from "@/components/admin/kit"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { AUDIENCES, type Audience, type BroadcastRow } from "@/lib/admin/broadcast-types"
import {
  fetchBroadcasts,
  composeBroadcast,
  sendBroadcastNow,
  deleteBroadcast,
} from "@/app/actions/admin-broadcast"

type Analytics = { totalSent: number; scheduled: number; drafts: number; totalRecipients: number }

const STATUS_TONE = { sent: "success", scheduled: "warning", draft: "info" } as const

export function BroadcastCentre({
  initialRows,
  analytics,
  audienceSizes,
  canPush,
  defaultChannel = "in_app",
}: {
  initialRows: BroadcastRow[]
  analytics: Analytics
  audienceSizes: Record<Audience, number>
  canPush: boolean
  defaultChannel?: "in_app" | "push"
}) {
  const [channel, setChannel] = useState<"in_app" | "push">(defaultChannel)
  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [audience, setAudience] = useState<Audience>("everyone")
  const [scheduleAt, setScheduleAt] = useState("")
  const [isPending, startTransition] = useTransition()

  const { data, mutate } = useSWR("broadcasts", fetchBroadcasts, {
    fallbackData: initialRows,
    revalidateOnFocus: false,
  })
  const rows = data ?? []

  const targetSize = audienceSizes[audience] ?? 0

  function reset() {
    setTitle("")
    setBody("")
    setScheduleAt("")
  }

  function compose(action: "send" | "schedule" | "draft") {
    if (!title.trim() || !body.trim()) {
      toast.error("Title and message are required")
      return
    }
    if (action === "schedule" && !scheduleAt) {
      toast.error("Pick a date and time to schedule")
      return
    }
    startTransition(async () => {
      try {
        const res = await composeBroadcast(
          {
            channel,
            title,
            body,
            audience,
            scheduledFor: action === "schedule" ? new Date(scheduleAt).toISOString() : null,
          },
          action,
        )
        toast.success(
          action === "send"
            ? `Delivered to ${res.recipientCount} ${res.recipientCount === 1 ? "member" : "members"}`
            : action === "schedule"
              ? "Scheduled"
              : "Saved as draft",
        )
        reset()
        mutate()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to send")
      }
    })
  }

  function rowAction(fn: () => Promise<unknown>, msg: string) {
    startTransition(async () => {
      try {
        await fn()
        toast.success(msg)
        mutate()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Action failed")
      }
    })
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Broadcast Centre"
        description="Send announcements and push notifications to targeted groups of members."
        icon={Megaphone}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={Send} label="Sent" value={analytics.totalSent} accent="success" />
        <StatCard icon={CalendarClock} label="Scheduled" value={analytics.scheduled} accent="warning" />
        <StatCard icon={FileText} label="Drafts" value={analytics.drafts} accent="primary" />
        <StatCard icon={Users} label="Total reached" value={analytics.totalRecipients} />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Composer */}
        <div className="lg:col-span-3">
          <AdminCard title="Compose message">
            <div className="space-y-5">
              {/* Channel toggle */}
              <div className="flex gap-2">
                <ChannelButton
                  active={channel === "in_app"}
                  onClick={() => setChannel("in_app")}
                  icon={Bell}
                  label="In-app announcement"
                />
                <ChannelButton
                  active={channel === "push"}
                  onClick={() => canPush && setChannel("push")}
                  icon={Radio}
                  label="Push notification"
                  disabled={!canPush}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Title</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Announcement title" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Message</Label>
                <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} placeholder="What do you want to tell your members?" />
              </div>

              {/* Audience */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Audience</Label>
                <div className="grid grid-cols-2 gap-2">
                  {AUDIENCES.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => setAudience(a.id)}
                      className={`flex flex-col items-start rounded-xl border p-3 text-left transition-colors ${
                        audience === a.id
                          ? "border-primary bg-primary/5"
                          : "border-border/70 hover:border-primary/40"
                      }`}
                    >
                      <span className="text-sm font-medium text-foreground">{a.label}</span>
                      <span className="text-xs text-muted-foreground">{a.description}</span>
                      <span className="mt-1 text-xs font-semibold tabular-nums text-primary">
                        {(audienceSizes[a.id] ?? 0).toLocaleString()} members
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Schedule for (optional)</Label>
                <Input type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} />
              </div>

              <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-4">
                <Button variant="outline" onClick={() => compose("draft")} disabled={isPending} className="gap-2">
                  <FileText className="h-4 w-4" /> Save draft
                </Button>
                {scheduleAt && (
                  <Button variant="outline" onClick={() => compose("schedule")} disabled={isPending} className="gap-2">
                    <CalendarClock className="h-4 w-4" /> Schedule
                  </Button>
                )}
                <Button onClick={() => compose("send")} disabled={isPending} className="ml-auto gap-2">
                  <Send className="h-4 w-4" /> Send to {targetSize.toLocaleString()} now
                </Button>
              </div>
            </div>
          </AdminCard>
        </div>

        {/* History */}
        <div className="lg:col-span-2">
          <AdminCard title="History">
            {rows.length === 0 ? (
              <EmptyState icon={Megaphone} title="No messages yet" description="Sent and scheduled messages appear here." />
            ) : (
              <div className="space-y-3">
                {rows.map((r) => (
                  <div key={`${r.channel}-${r.id}`} className="rounded-xl border border-border/60 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {r.channel === "push" ? (
                          <Radio className="h-4 w-4 text-primary" />
                        ) : (
                          <Bell className="h-4 w-4 text-primary" />
                        )}
                        <span className="truncate text-sm font-medium text-foreground">{r.title}</span>
                      </div>
                      <StatusBadge tone={STATUS_TONE[r.status]}>{r.status}</StatusBadge>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{r.body}</p>
                    <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                      <span className="capitalize">
                        {r.audience}
                        {r.recipientCount != null && ` · ${r.recipientCount} reached`}
                      </span>
                      <div className="flex items-center gap-2">
                        {r.status !== "sent" && (
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 text-primary hover:underline"
                            onClick={() => rowAction(() => sendBroadcastNow(r.id, r.channel), "Sent")}
                            disabled={isPending}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" /> Send now
                          </button>
                        )}
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 text-destructive hover:underline"
                          onClick={() => rowAction(() => deleteBroadcast(r.id, r.channel), "Deleted")}
                          disabled={isPending}
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </AdminCard>
        </div>
      </div>
    </div>
  )
}

function ChannelButton({
  active,
  onClick,
  icon: Icon,
  label,
  disabled,
}: {
  active: boolean
  onClick: () => void
  icon: typeof Bell
  label: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-1 items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-40 ${
        active ? "border-primary bg-primary/5 text-foreground" : "border-border/70 text-muted-foreground hover:text-foreground"
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  )
}
