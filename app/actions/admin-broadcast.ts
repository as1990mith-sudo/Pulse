"use server"

import { randomUUID } from "crypto"
import { revalidatePath } from "next/cache"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { broadcast, pushCampaign } from "@/lib/db/schema"
import { requirePermission } from "@/lib/admin-auth"
import { logAudit } from "@/lib/audit"
import {
  deliverToAudience,
  getAudienceSizes,
  getBroadcastAnalytics,
  listBroadcasts,
  type Audience,
} from "@/lib/admin/broadcast"

export type ComposeInput = {
  channel: "in_app" | "push"
  type?: string
  title: string
  body: string
  audience: Audience
  scheduledFor?: string | null
}

function revalidate() {
  revalidatePath("/admin/broadcast")
  revalidatePath("/notifications")
}

/** Read wrappers used by the client. */
export async function fetchBroadcasts() {
  await requirePermission("broadcast.send")
  return listBroadcasts()
}

export async function fetchBroadcastAnalytics() {
  await requirePermission("broadcast.send")
  return getBroadcastAnalytics()
}

export async function fetchAudienceSizes() {
  await requirePermission("broadcast.send")
  return getAudienceSizes()
}

function validate(input: ComposeInput) {
  const title = input.title.trim()
  const body = input.body.trim()
  if (!title || !body) throw new Error("Title and message are required")
  return { title, body }
}

/**
 * Creates and (optionally) immediately delivers a message.
 * - action "send": delivers now as in-app notifications and marks it sent.
 * - action "schedule": stores it as scheduled (requires scheduledFor).
 * - action "draft": stores it as a draft for later.
 */
export async function composeBroadcast(input: ComposeInput, action: "send" | "schedule" | "draft") {
  const permission = input.channel === "push" ? "push.send" : "broadcast.send"
  const actor = await requirePermission(permission)
  const { title, body } = validate(input)

  let scheduledFor: Date | null = null
  if (action === "schedule") {
    if (!input.scheduledFor) throw new Error("A schedule date is required")
    scheduledFor = new Date(input.scheduledFor)
    if (Number.isNaN(scheduledFor.getTime())) throw new Error("Invalid schedule date")
  }

  const status = action === "send" ? "sent" : action === "schedule" ? "scheduled" : "draft"
  const now = new Date()
  const id = randomUUID()

  // Deliver immediately when sending now.
  let recipientCount = 0
  if (action === "send") {
    recipientCount = await deliverToAudience(input.audience, {
      actorName: actor.name,
      title,
      message: body,
      type: input.channel === "push" ? "push" : "broadcast",
    })
  }

  if (input.channel === "push") {
    await db.insert(pushCampaign).values({
      id,
      title,
      body,
      audience: input.audience,
      status,
      scheduledFor,
      sentAt: action === "send" ? now : null,
      recipientCount: action === "send" ? recipientCount : null,
      createdBy: actor.userId,
      createdAt: now,
    })
  } else {
    await db.insert(broadcast).values({
      id,
      type: input.type ?? "announcement",
      title,
      body,
      audience: input.audience,
      status,
      scheduledFor,
      sentAt: action === "send" ? now : null,
      createdBy: actor.userId,
      createdAt: now,
    })
  }

  await logAudit({
    adminId: actor.userId,
    action: `${input.channel === "push" ? "push" : "broadcast"}.${action}`,
    targetType: input.channel === "push" ? "push_campaign" : "broadcast",
    targetId: id,
    metadata: { audience: input.audience, recipientCount, title },
  })

  revalidate()
  return { id, recipientCount }
}

/** Sends a previously saved draft/scheduled item now. */
export async function sendBroadcastNow(id: string, channel: "in_app" | "push") {
  const permission = channel === "push" ? "push.send" : "broadcast.send"
  const actor = await requirePermission(permission)

  const table = channel === "push" ? pushCampaign : broadcast
  const [row] = await db.select().from(table).where(eq(table.id, id)).limit(1)
  if (!row) throw new Error("Message not found")
  if (row.status === "sent") throw new Error("Already sent")

  const recipientCount = await deliverToAudience(row.audience as Audience, {
    actorName: actor.name,
    title: row.title,
    message: row.body,
    type: channel === "push" ? "push" : "broadcast",
  })

  const now = new Date()
  if (channel === "push") {
    await db.update(pushCampaign).set({ status: "sent", sentAt: now, recipientCount }).where(eq(pushCampaign.id, id))
  } else {
    await db.update(broadcast).set({ status: "sent", sentAt: now }).where(eq(broadcast.id, id))
  }

  await logAudit({
    adminId: actor.userId,
    action: `${channel === "push" ? "push" : "broadcast"}.send`,
    targetType: channel === "push" ? "push_campaign" : "broadcast",
    targetId: id,
    metadata: { recipientCount },
  })

  revalidate()
  return { recipientCount }
}

/** Deletes a broadcast/push item (drafts or history). */
export async function deleteBroadcast(id: string, channel: "in_app" | "push") {
  const permission = channel === "push" ? "push.send" : "broadcast.send"
  const actor = await requirePermission(permission)
  if (channel === "push") {
    await db.delete(pushCampaign).where(eq(pushCampaign.id, id))
  } else {
    await db.delete(broadcast).where(eq(broadcast.id, id))
  }
  await logAudit({
    adminId: actor.userId,
    action: `${channel === "push" ? "push" : "broadcast"}.delete`,
    targetType: channel === "push" ? "push_campaign" : "broadcast",
    targetId: id,
  })
  revalidate()
  return { ok: true }
}
