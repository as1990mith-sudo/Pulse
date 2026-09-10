"use client"

import { useMemo, useState } from "react"
import useSWR from "swr"
import { toast } from "sonner"
import { Check, ChevronLeft, Loader2, Search, Users } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { GENDER_LABEL } from "@/lib/home/members"
import {
  RECIPIENT_TYPES,
  recipientTypeLabel,
  resolveRecipientCount,
  usesMemberPicker,
  type BroadcastRecipientType,
} from "@/lib/home/broadcast"
import { createBroadcast, getBroadcastAudience } from "@/app/actions/home-broadcast"

type Phase = "compose" | "confirm"

export function BroadcastComposeDialog({
  handle,
  open,
  onOpenChange,
  onSent,
}: {
  handle: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onSent: () => void
}) {
  const { data: audience, isLoading } = useSWR(
    open ? ["broadcast-audience", handle] : null,
    () => getBroadcastAudience(handle),
    { revalidateOnFocus: false },
  )

  const [type, setType] = useState<BroadcastRecipientType>("all")
  const [picked, setPicked] = useState<string[]>([])
  const [message, setMessage] = useState("")
  const [search, setSearch] = useState("")
  const [phase, setPhase] = useState<Phase>("compose")
  const [sending, setSending] = useState(false)

  const memberSet = useMemo(
    () => new Set((audience?.members ?? []).map((m) => m.userId)),
    [audience],
  )

  const recipientCount = useMemo(() => {
    if (!audience) return 0
    return resolveRecipientCount(type, audience, picked, (id) => memberSet.has(id))
  }, [audience, type, picked, memberSet])

  const filteredMembers = useMemo(() => {
    const members = audience?.members ?? []
    const q = search.trim().toLowerCase()
    if (!q) return members
    return members.filter((m) => m.name.toLowerCase().includes(q))
  }, [audience, search])

  function reset() {
    setType("all")
    setPicked([])
    setMessage("")
    setSearch("")
    setPhase("compose")
    setSending(false)
  }

  function handleOpenChange(next: boolean) {
    if (sending) return
    if (!next) reset()
    onOpenChange(next)
  }

  function togglePick(id: string) {
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const canSend = message.trim().length > 0 && recipientCount > 0 && !sending

  async function handleSend() {
    if (!canSend) return
    setSending(true)
    try {
      const res = await createBroadcast(handle, {
        message: message.trim(),
        recipientType: type,
        memberIds: usesMemberPicker(type) ? picked : undefined,
      })
      toast.success("Broadcast sent", {
        description: `${res.recipientCount} member${res.recipientCount === 1 ? "" : "s"} received the message.`,
      })
      onSent()
      handleOpenChange(false)
    } catch (err) {
      setSending(false)
      toast.error(err instanceof Error ? err.message : "Couldn't send the broadcast.")
    }
  }

  const showPicker = usesMemberPicker(type)
  const pickedValid = picked.filter((id) => memberSet.has(id))

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="border-b border-border/50 px-5 py-4">
          <DialogTitle className="flex items-center gap-2 font-display text-lg tracking-tight">
            {phase === "confirm" && (
              <button
                type="button"
                onClick={() => setPhase("compose")}
                aria-label="Back to compose"
                className="-ml-1 flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <ChevronLeft className="size-5" />
              </button>
            )}
            {phase === "confirm" ? "Send broadcast?" : "New Broadcast"}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : !audience || audience.total === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-secondary text-muted-foreground">
              <Users className="size-6" />
            </span>
            <p className="font-medium">No members yet</p>
            <p className="max-w-xs text-pretty text-sm text-muted-foreground">
              Once people join your Home, you can broadcast to them here.
            </p>
          </div>
        ) : phase === "confirm" ? (
          <div className="flex flex-col gap-5 px-5 py-6">
            <p className="text-pretty text-sm leading-relaxed text-muted-foreground">
              This message will be sent to{" "}
              <span className="font-semibold text-foreground">
                {recipientCount} member{recipientCount === 1 ? "" : "s"}
              </span>
              .
            </p>
            <div className="rounded-xl border border-border/50 bg-secondary/40 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                {recipientTypeLabel(type)}
              </p>
              <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-pretty text-sm text-foreground">{message.trim()}</p>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setPhase("compose")}
                disabled={sending}
                className="rounded-full px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSend()}
                disabled={!canSend}
                className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-transform tap-scale hover:bg-primary/90 disabled:opacity-50"
              >
                {sending && <Loader2 className="size-4 animate-spin" />}
                {sending ? "Sending…" : "Send Broadcast"}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-4">
            {/* Recipients */}
            <fieldset>
              <legend className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Recipients
              </legend>
              <div className="grid gap-1.5" role="radiogroup" aria-label="Recipients">
                {RECIPIENT_TYPES.map((opt) => {
                  const active = type === opt.id
                  const count =
                    opt.id === "all"
                      ? audience.total
                      : opt.id === "female"
                        ? audience.female
                        : opt.id === "male"
                          ? audience.male
                          : null
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setType(opt.id)}
                      className={cn(
                        "flex items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left transition-colors",
                        active
                          ? "border-primary bg-primary/[0.06] ring-1 ring-primary"
                          : "border-border/50 hover:bg-secondary/40",
                      )}
                    >
                      <span
                        className={cn(
                          "flex size-4 shrink-0 items-center justify-center rounded-full border",
                          active ? "border-primary bg-primary text-primary-foreground" : "border-border",
                        )}
                      >
                        {active && <Check className="size-3" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-foreground">{opt.label}</span>
                        <span className="block text-xs text-muted-foreground">{opt.hint}</span>
                      </span>
                      {count !== null && (
                        <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">{count}</span>
                      )}
                    </button>
                  )
                })}
              </div>
            </fieldset>

            {/* Member picker for exclude / specific */}
            {showPicker && (
              <div className="mt-4">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search members…"
                    className="w-full rounded-full border border-border/50 bg-secondary/40 py-2 pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/60 focus:bg-background"
                  />
                </div>
                <div className="mt-1.5 flex items-center justify-between px-1">
                  <span className="text-xs text-muted-foreground">
                    {type === "exclude" ? `${pickedValid.length} excluded` : `${pickedValid.length} selected`}
                  </span>
                  {pickedValid.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setPicked([])}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <ul className="mt-1.5 max-h-56 overflow-y-auto rounded-xl border border-border/50 [&>li:not(:last-child)]:border-b [&>li:not(:last-child)]:border-border/40">
                  {filteredMembers.length === 0 ? (
                    <li className="px-3.5 py-8 text-center text-sm text-muted-foreground">No members found</li>
                  ) : (
                    filteredMembers.map((m) => {
                      const checked = picked.includes(m.userId)
                      return (
                        <li key={m.userId}>
                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={checked}
                            onClick={() => togglePick(m.userId)}
                            className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-secondary/40"
                          >
                            <Avatar className="size-8 shrink-0">
                              {m.image && <AvatarImage src={m.image || "/placeholder.svg"} alt={m.name} />}
                              <AvatarFallback className={cn("text-xs", m.color)}>{m.initials}</AvatarFallback>
                            </Avatar>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium text-foreground">{m.name}</span>
                              <span className="block text-xs text-muted-foreground">
                                {m.gender ? GENDER_LABEL[m.gender] : "Not set"}
                              </span>
                            </span>
                            <span
                              className={cn(
                                "flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors",
                                checked ? "border-primary bg-primary text-primary-foreground" : "border-border",
                              )}
                            >
                              {checked && <Check className="size-3.5" />}
                            </span>
                          </button>
                        </li>
                      )
                    })
                  )}
                </ul>
              </div>
            )}

            {/* Message */}
            <div className="mt-4">
              <label
                htmlFor="broadcast-message"
                className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
              >
                Message
              </label>
              <Textarea
                id="broadcast-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Write your message…"
                rows={5}
                className="resize-none"
              />
            </div>

            {/* Live audience preview + primary action */}
            <div className="mt-4 flex items-center justify-between gap-3 border-t border-border/50 pt-4">
              <p className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground tabular-nums">{recipientCount}</span>{" "}
                member{recipientCount === 1 ? "" : "s"} will receive this
              </p>
              <button
                type="button"
                onClick={() => setPhase("confirm")}
                disabled={!canSend}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-transform tap-scale hover:bg-primary/90 disabled:opacity-50"
              >
                Continue
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
