"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Send, CalendarClock, FileText, Save } from "lucide-react"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { DevotionalRow } from "@/lib/admin/devotionals-types"
import { createDevotional, updateDevotional, scheduleDevotional } from "@/app/actions/admin-devotionals"

export function DevotionalEditor({
  open,
  existing,
  onClose,
  onSaved,
}: {
  open: boolean
  existing: DevotionalRow | null
  onClose: () => void
  onSaved: () => void
}) {
  const [title, setTitle] = useState(existing?.title ?? "")
  const [verseRef, setVerseRef] = useState(existing?.verseRef ?? "")
  const [verse, setVerse] = useState(existing?.verse ?? "")
  const [body, setBody] = useState(existing?.body ?? "")
  const [prayer, setPrayer] = useState(existing?.prayer ?? "")
  const [cover, setCover] = useState(existing?.cover ?? "")
  const [readingMinutes, setReadingMinutes] = useState(existing?.readingMinutes ?? 3)
  const [scheduleAt, setScheduleAt] = useState(
    existing?.scheduledFor ? toLocalInput(existing.scheduledFor) : "",
  )
  const [isPending, startTransition] = useTransition()

  const isEdit = !!existing

  function payload() {
    return { title, verseRef, verse, body, prayer, cover: cover || null, readingMinutes: Number(readingMinutes) }
  }

  function validate() {
    if (!title.trim() || !verseRef.trim() || !verse.trim() || !body.trim()) {
      toast.error("Title, reference, verse and body are required")
      return false
    }
    return true
  }

  function save(action: "draft" | "publish" | "schedule") {
    if (!validate()) return
    if (action === "schedule" && !scheduleAt) {
      toast.error("Pick a date and time to schedule")
      return
    }
    startTransition(async () => {
      try {
        if (isEdit) {
          await updateDevotional(existing.id, payload())
          if (action === "publish") {
            const { publishDevotional } = await import("@/app/actions/admin-devotionals")
            await publishDevotional(existing.id)
          } else if (action === "schedule") {
            await scheduleDevotional(existing.id, new Date(scheduleAt).toISOString())
          }
          toast.success("Devotional saved")
        } else {
          const status = action === "publish" ? "published" : action === "schedule" ? "scheduled" : "draft"
          await createDevotional(payload(), {
            status,
            scheduledFor: action === "schedule" ? new Date(scheduleAt).toISOString() : null,
          })
          toast.success(
            action === "publish"
              ? "Devotional published"
              : action === "schedule"
                ? "Devotional scheduled"
                : "Draft saved",
          )
        }
        onSaved()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Save failed")
      }
    })
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-xl p-0">
        <SheetHeader className="border-b border-border/60 px-6 py-4">
          <SheetTitle>{isEdit ? "Edit devotional" : "New devotional"}</SheetTitle>
          <SheetDescription>
            {isEdit ? "Update the content and re-publish or re-schedule." : "Compose a devotional, then publish, schedule, or save as a draft."}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-9.5rem)]">
          <div className="space-y-5 px-6 py-5">
            <Field label="Title">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Walking in faith" />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Scripture reference">
                <Input value={verseRef} onChange={(e) => setVerseRef(e.target.value)} placeholder="John 3:16" />
              </Field>
              <Field label="Reading minutes">
                <Input
                  type="number"
                  min={1}
                  value={readingMinutes}
                  onChange={(e) => setReadingMinutes(Number(e.target.value))}
                />
              </Field>
            </div>
            <Field label="Verse text">
              <Textarea value={verse} onChange={(e) => setVerse(e.target.value)} rows={2} placeholder="For God so loved the world…" />
            </Field>
            <Field label="Devotional body">
              <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={7} placeholder="Reflection…" />
            </Field>
            <Field label="Prayer">
              <Textarea value={prayer} onChange={(e) => setPrayer(e.target.value)} rows={3} placeholder="Father, we thank you…" />
            </Field>
            <Field label="Cover image URL (optional)">
              <Input value={cover} onChange={(e) => setCover(e.target.value)} placeholder="https://…" />
            </Field>
            <Field label="Schedule for (optional)">
              <Input type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} />
            </Field>
          </div>
        </ScrollArea>

        <div className="flex items-center gap-2 border-t border-border/60 px-6 py-4">
          <Button variant="outline" onClick={() => save("draft")} disabled={isPending} className="gap-2">
            <FileText className="h-4 w-4" /> Save draft
          </Button>
          {scheduleAt && (
            <Button variant="outline" onClick={() => save("schedule")} disabled={isPending} className="gap-2">
              <CalendarClock className="h-4 w-4" /> Schedule
            </Button>
          )}
          <Button onClick={() => save("publish")} disabled={isPending} className="ml-auto gap-2">
            {isEdit ? <Save className="h-4 w-4" /> : <Send className="h-4 w-4" />}
            {isEdit ? "Save & publish" : "Publish now"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}

/** Converts an ISO string to a value usable by <input type="datetime-local">. */
function toLocalInput(iso: string): string {
  const d = new Date(iso)
  const off = d.getTimezoneOffset()
  const local = new Date(d.getTime() - off * 60_000)
  return local.toISOString().slice(0, 16)
}
