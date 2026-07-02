"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ArrowLeft, CheckCircle2, Headphones, ListVideo, Play, Video } from "lucide-react"
import type { Course, Lesson } from "@/lib/store-data"
import { cn } from "@/lib/utils"

type Progress = { played: string[]; last: string | null }

export function CoursePlayer({ course }: { course: Course }) {
  const lessons = course.lessons
  const storageKey = `course-progress:${course.id}`

  const [activeId, setActiveId] = useState<string | null>(lessons[0]?.id ?? null)
  const [played, setPlayed] = useState<Set<string>>(new Set())

  // Restore saved position + completed lessons (client-only).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      if (!raw) return
      const saved = JSON.parse(raw) as Progress
      setPlayed(new Set(saved.played ?? []))
      if (saved.last && lessons.some((l) => l.id === saved.last)) setActiveId(saved.last)
    } catch {
      /* ignore malformed storage */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey])

  const persist = (next: Progress) => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(next))
    } catch {
      /* storage unavailable */
    }
  }

  const active = useMemo(
    () => lessons.find((l) => l.id === activeId) ?? lessons[0] ?? null,
    [lessons, activeId],
  )
  const activeIndex = active ? lessons.findIndex((l) => l.id === active.id) : -1

  function select(id: string) {
    setActiveId(id)
    persist({ played: [...played], last: id })
  }

  function markPlayedAndAdvance() {
    if (!active) return
    const nextPlayed = new Set(played)
    nextPlayed.add(active.id)
    setPlayed(nextPlayed)
    const next = lessons[activeIndex + 1]
    const nextId = next ? next.id : active.id
    if (next) setActiveId(nextId)
    persist({ played: [...nextPlayed], last: nextId })
  }

  const completedCount = played.size

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background">
      {/* Chrome */}
      <header className="flex shrink-0 items-center gap-3 border-b border-border/60 bg-background/95 px-3 py-2.5 backdrop-blur-xl pt-[calc(0.625rem+env(safe-area-inset-top))]">
        <Link
          href="/library"
          aria-label="Back to library"
          className="tap-scale flex size-10 shrink-0 items-center justify-center rounded-xl text-foreground hover:bg-secondary/60"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="line-clamp-1 text-sm font-semibold text-foreground">{course.title}</h1>
          <p className="truncate text-xs text-muted-foreground">{course.instructor}</p>
        </div>
      </header>

      {/* Player */}
      <div className="shrink-0 bg-black">
        {active ? (
          <PlayerSurface key={active.id} lesson={active} poster={course.thumbnail} onEnded={markPlayedAndAdvance} />
        ) : (
          <div className="flex aspect-video items-center justify-center text-sm text-white/70">No lessons yet.</div>
        )}
      </div>

      {/* Now playing + playlist */}
      <div className="flex min-h-0 flex-1 flex-col">
        {active && (
          <div className="shrink-0 border-b border-border/60 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-primary">
              Lesson {activeIndex + 1} of {lessons.length}
            </p>
            <h2 className="mt-0.5 text-pretty text-base font-semibold text-foreground">{active.title}</h2>
          </div>
        )}

        <div className="flex items-center justify-between px-4 pb-2 pt-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <ListVideo className="size-4 text-muted-foreground" />
            Lessons
          </h3>
          <span className="text-xs text-muted-foreground">
            {completedCount}/{lessons.length} done
          </span>
        </div>

        <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          {lessons.map((lesson, i) => {
            const isActive = lesson.id === active?.id
            const done = played.has(lesson.id)
            return (
              <li key={lesson.id}>
                <button
                  type="button"
                  onClick={() => select(lesson.id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-2xl px-2.5 py-2.5 text-left transition-colors",
                    isActive ? "bg-primary/10" : "hover:bg-secondary/50",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : done
                          ? "bg-primary/15 text-primary"
                          : "bg-secondary text-muted-foreground",
                    )}
                  >
                    {done && !isActive ? (
                      <CheckCircle2 className="size-5" />
                    ) : isActive ? (
                      <Play className="size-4 translate-x-px fill-current" />
                    ) : (
                      i + 1
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={cn("line-clamp-1 text-sm font-medium", isActive ? "text-foreground" : "text-foreground")}>
                      {lesson.title}
                    </p>
                    <p className="flex items-center gap-1 text-xs capitalize text-muted-foreground">
                      {lesson.kind === "audio" ? <Headphones className="size-3" /> : <Video className="size-3" />}
                      {lesson.kind}
                      {lesson.duration ? ` · ${lesson.duration}` : ""}
                    </p>
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

function PlayerSurface({ lesson, poster, onEnded }: { lesson: Lesson; poster: string; onEnded: () => void }) {
  if (!lesson.mediaUrl) {
    return (
      <div className="flex aspect-video items-center justify-center px-6 text-center text-sm text-white/70">
        This lesson has no media yet.
      </div>
    )
  }

  if (lesson.kind === "audio") {
    return (
      <div className="flex aspect-video flex-col items-center justify-center gap-5 px-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={poster || "/placeholder.svg"}
          alt=""
          className="size-28 rounded-2xl object-cover shadow-floating"
        />
        <audio src={lesson.mediaUrl} controls autoPlay onEnded={onEnded} className="w-full max-w-md">
          <track kind="captions" />
        </audio>
      </div>
    )
  }

  return (
    <video
      src={lesson.mediaUrl}
      poster={poster || undefined}
      controls
      autoPlay
      playsInline
      onEnded={onEnded}
      className="aspect-video w-full bg-black"
    >
      <track kind="captions" />
    </video>
  )
}
