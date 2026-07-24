"use server"

import { revalidatePath } from "next/cache"
import { requirePermission } from "@/lib/admin-auth"
import { logAudit } from "@/lib/audit"
import {
  listAuditLogs,
  listLoginHistory,
  listActiveSessions,
  revokeSessionById,
  type AuditLogRow,
  type LoginRow,
} from "@/lib/admin/security"

export async function fetchAuditLogs(
  filter: { q?: string; result?: "success" | "failure" | "all" },
  page = 0,
): Promise<{ rows: AuditLogRow[]; total: number }> {
  await requirePermission("security.view")
  return listAuditLogs(filter, page)
}

export async function fetchLoginHistory(page = 0): Promise<{ rows: LoginRow[]; total: number }> {
  await requirePermission("security.view")
  return listLoginHistory(page)
}

export async function fetchActiveSessions() {
  await requirePermission("security.view")
  return listActiveSessions()
}

/**
 * Revokes a session. Requires roles.manage (revoking sessions is a sensitive,
 * super/administrator-level action beyond read-only security.view).
 */
export async function revokeSession(sessionId: string): Promise<{ ok: boolean }> {
  const actor = await requirePermission("roles.manage")
  const ok = await revokeSessionById(sessionId)
  await logAudit({
    adminId: actor.userId,
    action: "security.session.revoke",
    targetType: "session",
    targetId: sessionId,
    result: ok ? "success" : "failure",
  })
  revalidatePath("/admin/security/sessions")
  return { ok }
}
