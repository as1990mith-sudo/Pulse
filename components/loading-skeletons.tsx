import { SiteHeader } from "@/components/site-header"
import { Skeleton } from "@/components/ui/skeleton"

/* Shared building blocks ---------------------------------------------------- */

/** A single feed post placeholder mirroring the real post card layout. */
function PostSkeleton() {
  return (
    <li className="bg-background px-4 py-4">
      {/* Header: avatar + name/handle */}
      <div className="flex items-center gap-3">
        <Skeleton className="size-10 shrink-0 rounded-full" />
        <div className="flex flex-1 flex-col gap-1.5">
          <Skeleton className="h-3.5 w-32 rounded-md" />
          <Skeleton className="h-3 w-20 rounded-md" />
        </div>
        <Skeleton className="size-8 shrink-0 rounded-full" />
      </div>
      {/* Body text */}
      <div className="mt-3 flex flex-col gap-2">
        <Skeleton className="h-3.5 w-full rounded-md" />
        <Skeleton className="h-3.5 w-[88%] rounded-md" />
        <Skeleton className="h-3.5 w-[62%] rounded-md" />
      </div>
      {/* Action row */}
      <div className="mt-4 flex items-center gap-6">
        <Skeleton className="h-5 w-10 rounded-full" />
        <Skeleton className="h-5 w-10 rounded-full" />
        <Skeleton className="h-5 w-10 rounded-full" />
        <Skeleton className="ml-auto h-5 w-5 rounded-full" />
      </div>
    </li>
  )
}

/* Page-level skeletons ------------------------------------------------------ */

export function FeedSkeleton() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main>
        <div className="mx-auto w-full max-w-2xl pb-8">
          {/* Stories rail */}
          <div className="border-b border-border/60 px-4 py-3 sm:px-0">
            <div className="flex gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex flex-col items-center gap-1.5">
                  <Skeleton className="size-16 rounded-full" />
                  <Skeleton className="h-2.5 w-12 rounded-md" />
                </div>
              ))}
            </div>
          </div>
          {/* Posts */}
          <ul className="mt-6 flex flex-col gap-2 border-y border-border/60 bg-border/40">
            {Array.from({ length: 5 }).map((_, i) => (
              <PostSkeleton key={i} />
            ))}
          </ul>
        </div>
      </main>
    </div>
  )
}

export function MessagesSkeleton() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/15 via-background to-background">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
        {/* Chats / Rooms segmented control */}
        <Skeleton className="mx-auto h-14 w-full max-w-md rounded-full" />
        {/* Premium conversation cards */}
        <div className="mt-4 flex flex-col gap-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-xl border-2 border-border bg-card px-4 py-3">
              <Skeleton className="size-12 shrink-0 rounded-full" />
              <div className="flex flex-1 flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <Skeleton className="h-4 w-32 rounded-md" />
                  <Skeleton className="h-3 w-10 rounded-md" />
                </div>
                <Skeleton className="h-3.5 w-[60%] rounded-md" />
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}

export function NotificationsSkeleton() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6">
        <Skeleton className="h-7 w-40 rounded-lg" />
        <div className="mt-5 flex flex-col gap-1">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-xl py-3">
              <Skeleton className="size-10 shrink-0 rounded-full" />
              <div className="flex flex-1 flex-col gap-1.5">
                <Skeleton className="h-3.5 w-[70%] rounded-md" />
                <Skeleton className="h-3 w-16 rounded-md" />
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}

export function ChatroomsSkeleton() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main>
        <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
          <div className="flex items-center justify-between">
            <Skeleton className="h-7 w-36 rounded-lg" />
            <Skeleton className="h-10 w-28 rounded-full" />
          </div>
          <div className="mt-6 flex flex-col gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card p-4">
                <Skeleton className="size-12 shrink-0 rounded-2xl" />
                <div className="flex flex-1 flex-col gap-2">
                  <Skeleton className="h-3.5 w-40 rounded-md" />
                  <Skeleton className="h-3 w-56 rounded-md" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}

export function LiveSkeleton() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main>
        <div className="mx-auto w-full max-w-6xl space-y-16 px-4 py-16 sm:px-6">
          <section className="space-y-6">
            <div className="flex flex-col gap-1">
              <Skeleton className="h-3 w-20 rounded-md" />
              <Skeleton className="h-9 w-64 rounded-lg" />
              <Skeleton className="h-4 w-80 max-w-full rounded-md" />
            </div>
            <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="aspect-[4/5] w-full rounded-2xl" />
              ))}
            </div>
          </section>
          <section className="space-y-6">
            <div className="flex flex-col gap-1">
              <Skeleton className="h-3 w-24 rounded-md" />
              <Skeleton className="h-9 w-56 rounded-lg" />
            </div>
            <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="aspect-square w-full rounded-2xl" />
              ))}
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}

export function ProfileSkeleton() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <header className="relative overflow-hidden border-b border-border/60">
        <div className="relative mx-auto flex w-full max-w-md flex-col items-center px-4 pb-5 pt-3 text-center sm:px-6">
          <Skeleton className="size-24 rounded-full" />
          <Skeleton className="mt-3 h-6 w-40 rounded-lg" />
          <Skeleton className="mt-2 h-3.5 w-24 rounded-md" />
          <Skeleton className="mt-3 h-3.5 w-64 max-w-full rounded-md" />
          <div className="mt-4 flex items-center gap-8">
            <div className="flex flex-col items-center gap-1.5">
              <Skeleton className="h-5 w-10 rounded-md" />
              <Skeleton className="h-3 w-14 rounded-md" />
            </div>
            <div className="flex flex-col items-center gap-1.5">
              <Skeleton className="h-5 w-10 rounded-md" />
              <Skeleton className="h-3 w-14 rounded-md" />
            </div>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl px-4 py-4 sm:px-6">
        {/* Tab bar */}
        <div className="flex items-center gap-2 border-b border-border/60 pb-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-20 rounded-full" />
          ))}
        </div>
        <div className="mt-4 grid grid-cols-3 gap-1 sm:gap-2">
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square w-full rounded-lg" />
          ))}
        </div>
      </main>
    </div>
  )
}
