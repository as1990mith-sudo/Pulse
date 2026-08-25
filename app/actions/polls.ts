"use server"

import { and, asc, eq, inArray } from "drizzle-orm"
import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { poll, pollOption, pollVote } from "@/lib/db/schema"
import { POLL_MIN_OPTIONS, normalizePollOptions, type PollView } from "@/lib/polls"

async function requireUser() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error("You must be signed in to do that.")
  return session.user
}

/**
 * Creates the poll rows for a post that has just been inserted.
 *
 * Called from createPost rather than exposed on its own, so a poll can never
 * exist without the post that carries its question.
 */
export async function createPollForPost(input: {
  postId: number
  options: string[]
  allowMultiple: boolean
  durationHours: number | null
}) {
  const options = normalizePollOptions(input.options)
  if (options.length < POLL_MIN_OPTIONS) {
    throw new Error(`A poll needs at least ${POLL_MIN_OPTIONS} different options.`)
  }

  const closesAt =
    input.durationHours && input.durationHours > 0
      ? new Date(Date.now() + input.durationHours * 60 * 60 * 1000)
      : null

  const [created] = await db
    .insert(poll)
    .values({ postId: input.postId, allowMultiple: input.allowMultiple, closesAt })
    .returning({ id: poll.id })
  if (!created) throw new Error("Could not create the poll.")

  await db.insert(pollOption).values(options.map((label, i) => ({ pollId: created.id, label, position: i })))

  return { id: created.id }
}

/**
 * Loads the polls for a batch of posts, keyed by postId.
 *
 * Batched (three queries total, regardless of post count) because this runs for
 * every feed read — a per-post lookup would be N+1 against the feed page size.
 *
 * Results are withheld until the viewer has voted: `votes`/`totalVotes` come
 * back null unless they have cast a vote, the poll has closed, or nobody is
 * signed in to vote at all. Withholding happens HERE, on the server, so the
 * counts are never serialised to a client that shouldn't see them yet.
 */
export async function getPollsForPosts(postIds: number[], viewerId: string | null): Promise<Map<number, PollView>> {
  const out = new Map<number, PollView>()
  if (postIds.length === 0) return out

  const polls = await db.select().from(poll).where(inArray(poll.postId, postIds))
  if (polls.length === 0) return out

  const pollIds = polls.map((p) => p.id)
  const options = await db
    .select()
    .from(pollOption)
    .where(inArray(pollOption.pollId, pollIds))
    .orderBy(asc(pollOption.position), asc(pollOption.id))

  // Every vote for these polls: needed both for the tallies and to find the
  // viewer's own choices, so it's one read instead of two.
  const votes = await db
    .select({ pollId: pollVote.pollId, optionId: pollVote.optionId, userId: pollVote.userId })
    .from(pollVote)
    .where(inArray(pollVote.pollId, pollIds))

  const tally = new Map<number, number>()
  const mine = new Map<number, number[]>()
  for (const v of votes) {
    tally.set(v.optionId, (tally.get(v.optionId) ?? 0) + 1)
    if (viewerId && v.userId === viewerId) {
      const list = mine.get(v.pollId) ?? []
      list.push(v.optionId)
      mine.set(v.pollId, list)
    }
  }

  const now = Date.now()
  for (const p of polls) {
    const closesAt = p.closesAt ? p.closesAt.getTime() : null
    const closed = closesAt !== null && closesAt <= now
    const votedOptionIds = mine.get(p.id) ?? []
    // A signed-out visitor can never vote, so withholding results from them
    // would hide the poll's outcome forever rather than encouraging a vote.
    const canSeeResults = votedOptionIds.length > 0 || closed || !viewerId

    const rows = options.filter((o) => o.pollId === p.id)
    out.set(p.postId, {
      id: p.id,
      allowMultiple: p.allowMultiple,
      closesAt,
      closed,
      votedOptionIds,
      totalVotes: canSeeResults ? rows.reduce((n, o) => n + (tally.get(o.id) ?? 0), 0) : null,
      options: rows.map((o) => ({
        id: o.id,
        label: o.label,
        votes: canSeeResults ? (tally.get(o.id) ?? 0) : null,
      })),
    })
  }

  return out
}

/**
 * Casts or updates the signed-in viewer's vote.
 *
 * `optionIds` is the viewer's COMPLETE selection, not a delta, so this replaces
 * whatever they had before — that is what makes changing your mind work, and it
 * makes a retried request idempotent instead of double-voting. An empty array
 * withdraws the vote entirely.
 */
export async function castPollVote(input: { pollId: number; optionIds: number[] }) {
  const user = await requireUser()

  const [row] = await db.select().from(poll).where(eq(poll.id, input.pollId))
  if (!row) throw new Error("Poll not found.")
  // Re-checked server-side: the client hides the controls once a poll closes,
  // but a late in-flight request must not slip a vote past the deadline.
  if (row.closesAt && row.closesAt.getTime() <= Date.now()) {
    throw new Error("This poll has closed.")
  }

  // Only accept ids that actually belong to THIS poll, so a crafted request
  // can't vote on someone else's poll through this one.
  const valid = await db.select({ id: pollOption.id }).from(pollOption).where(eq(pollOption.pollId, input.pollId))
  const allowed = new Set(valid.map((o) => o.id))
  let chosen = [...new Set(input.optionIds)].filter((id) => allowed.has(id))
  if (!row.allowMultiple) chosen = chosen.slice(0, 1)

  // Replace-then-insert: the viewer's selection is authoritative.
  await db.delete(pollVote).where(and(eq(pollVote.pollId, input.pollId), eq(pollVote.userId, user.id)))
  if (chosen.length > 0) {
    await db.insert(pollVote).values(chosen.map((optionId) => ({ pollId: input.pollId, optionId, userId: user.id })))
  }

  revalidatePath("/feed")
  return { votedOptionIds: chosen }
}
