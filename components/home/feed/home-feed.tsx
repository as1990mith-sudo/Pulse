"use client"

import { Sparkles } from "lucide-react"
import type { OrganizationView } from "@/lib/org-types"
import type { OrgPostView } from "@/app/actions/organizations"
import { OrgPostThread } from "@/components/org/org-tabs"

/**
 * The Home Feed = the ORGANISATION'S VOICE. It reuses the exact premium org
 * post thread from the org profile (OrgPostThread), so an org post looks and
 * behaves identically here and everywhere else. Only this organisation's posts
 * are ever passed in (getOrganizationPosts is org-scoped), enforcing the
 * "what is my organisation saying?" boundary.
 */
export function HomeFeed({ org, posts, orgName }: { org: OrganizationView; posts: OrgPostView[]; orgName: string }) {
  return (
    <div className="mx-auto w-full max-w-2xl px-0 pt-2 sm:px-4 sm:pt-5">
      <header className="px-4 pb-3 sm:px-0">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Feed</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Updates from {orgName}</p>
      </header>

      {posts.length === 0 ? (
        <div className="mx-4 flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-card/40 px-6 py-14 text-center sm:mx-0">
          <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Sparkles className="size-6" />
          </span>
          <p className="mt-3 text-sm font-medium text-foreground">No posts yet</p>
          <p className="mt-1 max-w-xs text-pretty text-sm text-muted-foreground">
            {orgName} hasn&apos;t shared anything yet. Updates will appear here as soon as they post.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border/60 border-y border-border/60 sm:rounded-2xl sm:border">
          {posts.map((p) => (
            <li key={p.id} className="first:sm:rounded-t-2xl last:sm:rounded-b-2xl">
              <OrgPostThread org={org} post={p} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
