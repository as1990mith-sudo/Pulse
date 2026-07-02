"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  BookOpen,
  CheckCircle2,
  Clock,
  GraduationCap,
  Loader2,
  Plus,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { CoverUpload } from "@/components/admin/cover-upload"
import { uploadMedia } from "@/lib/upload-media"
import { publishProduct, type PublishLessonInput } from "@/app/actions/store"
import { BOOK_CATEGORIES, COURSE_CATEGORIES, COURSE_DIFFICULTIES, type StoreCategory } from "@/lib/store-data"
import { cn } from "@/lib/utils"

type Kind = "book" | "course"

type DraftLesson = {
  key: string
  title: string
  kind: "video" | "audio"
  file: File | null
  duration: string
}

function newLesson(): DraftLesson {
  return { key: Math.random().toString(36).slice(2), title: "", kind: "video", file: null, duration: "" }
}

function getMediaDuration(file: File, kind: "audio" | "video"): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const el = document.createElement(kind)
    el.preload = "metadata"
    el.onloadedmetadata = () => {
      URL.revokeObjectURL(url)
      resolve(el.duration || 0)
    }
    el.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(0)
    }
    el.src = url
  })
}

function formatDuration(secs: number): string {
  if (!secs || !isFinite(secs)) return ""
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = Math.round(secs % 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m ${s.toString().padStart(2, "0")}s`
}

export function PublishForm() {
  const router = useRouter()

  const [kind, setKind] = useState<Kind>("book")
  const [title, setTitle] = useState("")
  const [subtitle, setSubtitle] = useState("")
  const [description, setDescription] = useState("")
  const [category, setCategory] = useState<StoreCategory | "">("")
  const [language, setLanguage] = useState("English")
  const [price, setPrice] = useState("")
  const [cover, setCover] = useState<string | null>(null)

  // Book-only
  const [bookFile, setBookFile] = useState<File | null>(null)
  const [pages, setPages] = useState("")
  const bookInputRef = useRef<HTMLInputElement>(null)

  // Course-only
  const [difficulty, setDifficulty] = useState<(typeof COURSE_DIFFICULTIES)[number]>("Beginner")
  const [lessons, setLessons] = useState<DraftLesson[]>([newLesson()])

  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [stage, setStage] = useState<string>("")

  const categories = kind === "book" ? BOOK_CATEGORIES : COURSE_CATEGORIES

  function switchKind(next: Kind) {
    if (next === kind) return
    setKind(next)
    setCategory("")
    setError(null)
  }

  function handleBookPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const ok = /\.(pdf|epub)$/i.test(file.name) || file.type === "application/pdf" || file.type === "application/epub+zip"
    if (!ok) {
      setError("Please choose a PDF or EPUB file for the book.")
      e.target.value = ""
      return
    }
    setError(null)
    setBookFile(file)
    if (!title.trim()) setTitle(file.name.replace(/\.[^.]+$/, ""))
  }

  function updateLesson(key: string, patch: Partial<DraftLesson>) {
    setLessons((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  }

  async function handleLessonFile(key: string, file: File | null) {
    if (!file) return
    const isVideo = file.type.startsWith("video/")
    const isAudio = file.type.startsWith("audio/")
    if (!isVideo && !isAudio) {
      setError("Lessons must be a video or audio file.")
      return
    }
    setError(null)
    const mediaKind = isVideo ? "video" : "audio"
    const dur = await getMediaDuration(file, mediaKind)
    updateLesson(key, {
      file,
      kind: mediaKind,
      duration: formatDuration(dur),
      title: lessons.find((l) => l.key === key)?.title || file.name.replace(/\.[^.]+$/, ""),
    })
  }

  function addLesson() {
    setLessons((prev) => [...prev, newLesson()])
  }

  function removeLesson(key: string) {
    setLessons((prev) => (prev.length === 1 ? prev : prev.filter((l) => l.key !== key)))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!title.trim()) return setError("Give your listing a title.")
    if (!cover) return setError("Add a cover image.")
    if (!category) return setError("Choose a category.")
    if (kind === "book" && !bookFile) return setError("Upload the book file (PDF or EPUB).")

    const readyLessons = lessons.filter((l) => l.file)
    if (kind === "course" && readyLessons.length === 0) {
      return setError("Add at least one lesson with a video or audio file.")
    }

    setBusy(true)
    try {
      let bookFileUrl: string | undefined
      let bookFileName: string | undefined
      const uploadedLessons: PublishLessonInput[] = []

      if (kind === "book" && bookFile) {
        setStage("Uploading book file…")
        const up = await uploadMedia(bookFile, "store")
        bookFileUrl = up.url
        bookFileName = bookFile.name
      }

      if (kind === "course") {
        for (let i = 0; i < readyLessons.length; i++) {
          const l = readyLessons[i]
          setStage(`Uploading lesson ${i + 1} of ${readyLessons.length}…`)
          const up = await uploadMedia(l.file as File, "store")
          uploadedLessons.push({
            title: l.title.trim() || `Lesson ${i + 1}`,
            kind: l.kind,
            duration: l.duration,
            mediaUrl: up.url,
          })
        }
      }

      setStage("Publishing…")
      const result = await publishProduct({
        kind,
        title: title.trim(),
        subtitle: subtitle.trim(),
        description: description.trim(),
        category,
        language: language.trim() || "English",
        coverUrl: cover,
        price: Number(price) || 0,
        bookFileUrl,
        bookFileName,
        pages: pages ? Number(pages) : undefined,
        difficulty: kind === "course" ? difficulty : undefined,
        totalDuration: kind === "course" ? `${uploadedLessons.length} lessons` : undefined,
        lessons: kind === "course" ? uploadedLessons : undefined,
      })

      router.push(`/store/${result.kind}/${result.id}`)
      router.refresh()
    } catch (err) {
      console.log("[v0] publish failed:", err instanceof Error ? err.message : err)
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.")
      setBusy(false)
      setStage("")
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-28 pt-6 sm:px-6">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Sell on Frequency</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Publish a book or course. Buyers get instant access in their library after purchase.
        </p>
      </header>

      <form onSubmit={submit} className="space-y-6">
        {/* Kind toggle */}
        <div role="tablist" aria-label="What are you selling?" className="grid grid-cols-2 gap-2">
          {(
            [
              { key: "book", label: "Book", icon: BookOpen, hint: "PDF or EPUB" },
              { key: "course", label: "Course", icon: GraduationCap, hint: "Video or audio lessons" },
            ] as const
          ).map(({ key, label, icon: Icon, hint }) => {
            const active = kind === key
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => switchKind(key)}
                className={cn(
                  "flex flex-col items-start gap-1 rounded-2xl border p-4 text-left transition-colors",
                  active
                    ? "border-primary bg-primary/10"
                    : "border-border/60 bg-card hover:border-primary/40 hover:bg-secondary/40",
                )}
              >
                <span
                  className={cn(
                    "flex size-9 items-center justify-center rounded-xl",
                    active ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground",
                  )}
                >
                  <Icon className="size-5" />
                </span>
                <span className="text-sm font-semibold text-foreground">{label}</span>
                <span className="text-xs text-muted-foreground">{hint}</span>
              </button>
            )
          })}
        </div>

        <CoverUpload value={cover} onChange={setCover} label={kind === "book" ? "Book cover" : "Course thumbnail"} />

        <Field label="Title">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Give it a clear title" />
        </Field>

        <Field label="Subtitle" optional>
          <Input
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
            placeholder="A short tagline shown under the title"
          />
        </Field>

        <Field label="Description" optional>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What will readers or learners get from this?"
            rows={4}
          />
        </Field>

        {/* Category */}
        <Field label="Category">
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={cn(
                  "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                  category === c
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border/60 bg-secondary/40 text-muted-foreground hover:text-foreground",
                )}
              >
                {c}
              </button>
            ))}
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Price (USD)">
            <Input
              type="number"
              min="0"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0.00"
            />
            <p className="mt-1 text-xs text-muted-foreground">Enter 0 to offer it for free.</p>
          </Field>
          <Field label="Language">
            <Input value={language} onChange={(e) => setLanguage(e.target.value)} placeholder="English" />
          </Field>
        </div>

        {/* Book-specific */}
        {kind === "book" && (
          <>
            <Field label="Book file">
              <button
                type="button"
                onClick={() => bookInputRef.current?.click()}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors",
                  bookFile
                    ? "border-primary/50 bg-primary/5"
                    : "border-dashed border-border/70 bg-background hover:border-primary/70",
                )}
              >
                <span
                  className={cn(
                    "flex size-10 shrink-0 items-center justify-center rounded-full",
                    bookFile ? "bg-primary/15 text-primary" : "bg-secondary text-foreground",
                  )}
                >
                  {bookFile ? <CheckCircle2 className="size-5" /> : <UploadCloud className="size-5" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {bookFile ? bookFile.name : "Choose PDF or EPUB"}
                  </span>
                  <span className="text-xs text-muted-foreground">Delivered to buyers after purchase</span>
                </span>
              </button>
              <input
                ref={bookInputRef}
                type="file"
                accept=".pdf,.epub,application/pdf,application/epub+zip"
                className="hidden"
                onChange={handleBookPick}
              />
            </Field>
            <Field label="Pages" optional>
              <Input
                type="number"
                min="0"
                value={pages}
                onChange={(e) => setPages(e.target.value)}
                placeholder="e.g. 220"
              />
            </Field>
          </>
        )}

        {/* Course-specific */}
        {kind === "course" && (
          <>
            <Field label="Difficulty">
              <div className="flex flex-wrap gap-2">
                {COURSE_DIFFICULTIES.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDifficulty(d)}
                    className={cn(
                      "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                      difficulty === d
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border/60 bg-secondary/40 text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </Field>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">Lessons</span>
                <span className="text-xs text-muted-foreground">{lessons.filter((l) => l.file).length} ready</span>
              </div>

              {lessons.map((lesson, i) => (
                <div key={lesson.key} className="rounded-2xl border border-border/60 bg-card p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-semibold text-muted-foreground">Lesson {i + 1}</span>
                    {lessons.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeLesson(lesson.key)}
                        className="flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-destructive"
                        aria-label={`Remove lesson ${i + 1}`}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    )}
                  </div>
                  <Input
                    value={lesson.title}
                    onChange={(e) => updateLesson(lesson.key, { title: e.target.value })}
                    placeholder="Lesson title"
                    className="mb-2"
                  />
                  <label
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors",
                      lesson.file
                        ? "border-primary/50 bg-primary/5"
                        : "border-dashed border-border/70 bg-background hover:border-primary/70",
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-9 shrink-0 items-center justify-center rounded-full",
                        lesson.file ? "bg-primary/15 text-primary" : "bg-secondary text-foreground",
                      )}
                    >
                      {lesson.file ? <CheckCircle2 className="size-4" /> : <UploadCloud className="size-4" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {lesson.file ? lesson.file.name : "Choose video or audio"}
                      </span>
                      <span className="flex items-center gap-1.5 text-xs capitalize text-muted-foreground">
                        {lesson.file && lesson.duration ? (
                          <>
                            <Clock className="size-3" />
                            {lesson.kind} · {lesson.duration}
                          </>
                        ) : (
                          "MP4, MOV, MP3, WAV"
                        )}
                      </span>
                    </span>
                    <input
                      type="file"
                      accept="video/*,audio/*"
                      className="hidden"
                      onChange={(e) => {
                        handleLessonFile(lesson.key, e.target.files?.[0] ?? null)
                        e.target.value = ""
                      }}
                    />
                  </label>
                </div>
              ))}

              <button
                type="button"
                onClick={addLesson}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border/70 bg-card/60 px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/70 hover:text-foreground"
              >
                <Plus className="size-4" />
                Add another lesson
              </button>
            </div>
          </>
        )}

        {error && (
          <p className="flex items-center gap-2 rounded-xl bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
            <X className="size-4 shrink-0" />
            {error}
          </p>
        )}

        <div className="sticky bottom-0 -mx-4 border-t border-border/60 bg-background/90 px-4 py-3 backdrop-blur-md sm:mx-0 sm:rounded-2xl sm:border sm:px-4">
          <Button type="submit" disabled={busy} className="w-full gap-2" size="lg">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <UploadCloud className="size-4" />}
            {busy ? stage || "Publishing…" : "Publish & list for sale"}
          </Button>
        </div>
      </form>
    </div>
  )
}

function Field({
  label,
  optional,
  children,
}: {
  label: string
  optional?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-2 text-sm font-medium text-foreground">
        {label}
        {optional && <span className="text-xs font-normal text-muted-foreground">Optional</span>}
      </label>
      {children}
    </div>
  )
}
