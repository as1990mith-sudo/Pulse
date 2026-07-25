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
import { CoverUpload, SQUARE_PORTRAIT_RATIOS } from "@/components/admin/cover-upload"
import type { QotdQuestionRow } from "@/lib/qotd-types"
import { createQuestion, updateQuestion, scheduleQuestion, publishQuestion } from "@/app/actions/admin-qotd"

export function QotdEditor({
  open,
  existing,
  onClose,
  onSaved,
}: {
  open: boolean
  existing: QotdQuestionRow | null
  onClose: () => void
  onSaved: () => void
}) {
  const [questionText, setQuestionText] = useState(existing?.questionText ?? "")
  const [image, setImage] = useState(existing?.image ?? "")
  const [activeDate, setActiveDate] = useState(existing?.activeDate ?? todayLabel())
  const [scheduleAt, setScheduleAt] = useState(
    existing?.scheduledFor ? toLocalInput(existing.scheduledFor) : "",
  )
  const [isPending, startTransition] = useTransition()

  const isEdit = !!existing

  function payload() {
    return { questionText, image: image || null, activeDate }
  }

  function validate() {
    if (!questionText.trim()) {
      toast.error("The question text is required")
      return false
    }
    if (!activeDate.trim()) {
      toast.error("An active date is required")
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
          await updateQuestion(existing.id, payload())
          if (action === "publish") {
            await publishQuestion(existing.id)
          } else if (action === "schedule") {
            await scheduleQuestion(existing.id, new Date(scheduleAt).toISOString())
          }
          toast.success("Question saved")
        } else {
          const status = action === "publish" ? "published" : action === "schedule" ? "scheduled" : "draft"
          await createQuestion(payload(), {
            status,
            scheduledFor: action === "schedule" ? new Date(scheduleAt).toISOString() : null,
          })
          toast.success(
            action === "publish"
              ? "Question published"
              : action === "schedule"
                ? "Question scheduled"
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
      <SheetContent side="right" className="w-full p-0 sm:max-w-xl">
        <SheetHeader className="shrink-0 border-b border-border/60 px-6 py-4">
          <SheetTitle>{isEdit ? "Edit question" : "New Question of the Day"}</SheetTitle>
          <SheetDescription>
            {isEdit
              ? "Update the question, then re-publish or re-schedule."
              : "Write a question, add an optional image, then publish, schedule, or save as a draft."}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-5 px-6 py-5">
            <Field label="Question">
              <Textarea
                value={questionText}
                onChange={(e) => setQuestionText(e.target.value)}
                rows={4}
                maxLength={500}
                placeholder="What does it mean to you to walk by faith and not by sight?"
              />
              <p className="text-right text-xs text-muted-foreground">{questionText.length}/500</p>
            </Field>
            <Field label="Active date label">
              <Input
                value={activeDate}
                onChange={(e) => setActiveDate(e.target.value)}
                placeholder="Friday, 25 July"
              />
              <p className="text-xs text-muted-foreground">
                Shown to users as the day this question is featured (e.g. &ldquo;Friday, 25 July&rdquo;).
              </p>
            </Field>
            <CoverUpload
              label="Image (optional)"
              value={image || null}
              onChange={(url) => setImage(url ?? "")}
              ratios={SQUARE_PORTRAIT_RATIOS}
            />
            <Field label="Schedule for (optional)">
              <Input type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} />
              <p className="text-xs text-muted-foreground">
                A scheduled question automatically goes live at this time and replaces the current one.
              </p>
            </Field>
          </div>
        </ScrollArea>

        {/* Draft, Schedule and Publish share a single equal-width row. Schedule
            is always available (like the devotional editor's scheduling); it
            uses the "Schedule for" date field above and prompts if it's empty. */}
        <div className="grid shrink-0 grid-cols-3 gap-2 border-t border-border/60 px-4 py-4 sm:px-6">
          <Button variant="outline" size="sm" onClick={() => save("draft")} disabled={isPending} className="gap-1.5">
            <FileText className="h-4 w-4" /> Draft
          </Button>
          <Button variant="outline" size="sm" onClick={() => save("schedule")} disabled={isPending} className="gap-1.5">
            <CalendarClock className="h-4 w-4" /> Schedule
          </Button>
          <Button size="sm" onClick={() => save("publish")} disabled={isPending} className="gap-1.5">
            {isEdit ? <Save className="h-4 w-4" /> : <Send className="h-4 w-4" />}
            Publish
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

/** A friendly default active-date label for a brand-new question (today). */
function todayLabel(): string {
  return new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })
}

/** Converts an ISO string to a value usable by <input type="datetime-local">. */
function toLocalInput(iso: string): string {
  const d = new Date(iso)
  const off = d.getTimezoneOffset()
  const local = new Date(d.getTime() - off * 60_000)
  return local.toISOString().slice(0, 16)
}
