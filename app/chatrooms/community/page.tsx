import { redirect } from "next/navigation"

/**
 * Legacy standalone Community route.
 *
 * Community used to be reachable two ways, and the two rendered DIFFERENT
 * chrome: `/chatrooms` renders it inside the Chat Rooms hub (the Community /
 * iTestify tab bar), while this route rendered `<CommunityHelp>` on its own with
 * a plain back arrow. The standalone copy was the one that misbehaved — with no
 * tab bar it never mounted the hub shell that the feed's collapsing chrome and
 * full-screen media handoff are wired to.
 *
 * Rather than maintain two shells for one screen, this route is now a pure
 * redirect into the hub. It is deliberately NOT deleted, because `?q=<postId>`
 * is the canonical deep link for a single Community thread — it is what Share
 * produces and what the profile/org thread cards link to — so those URLs must
 * keep working. The query is forwarded intact and `CommunityHelp` opens the
 * thread from it client-side exactly as before.
 */
export default async function CommunityRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { q } = await searchParams
  const params = new URLSearchParams({ room: "community" })
  // Carry the deep-linked thread through so a shared link still opens it.
  if (typeof q === "string" && q) params.set("q", q)
  redirect(`/chatrooms?${params.toString()}`)
}
