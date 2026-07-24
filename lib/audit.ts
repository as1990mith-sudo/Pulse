import { headers } from "next/headers"
import { randomUUID } from "node:crypto"
import { db } from "@/lib/db"
import { auditLog } from "@/lib/db/schema"

type AuditInput = {
  adminId: string
  action: string
  targetType?: string
  targetId?: string
  result?: "success" | "failure"
  metadata?: Record<string, unknown>
}

/**
 * Append an entry to the permanent admin audit trail. Captures IP + user agent
 * from the request headers where available. Never throws — audit logging must
 * not break the action it records.
 */
export async function logAudit(input: AuditInput): Promise<void> {
  try {
    const h = await headers()
    const ip =
      h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null
    const userAgent = h.get("user-agent") || null
    await db.insert(auditLog).values({
      id: randomUUID(),
      adminId: input.adminId,
      action: input.action,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      result: input.result ?? "success",
      ipAddress: ip,
      userAgent,
      metadata: input.metadata ?? null,
    })
  } catch (err) {
    console.log("[v0] audit log failed:", err instanceof Error ? err.message : err)
  }
}
