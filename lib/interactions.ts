// Shared rules for editing / deleting user-authored content (messages,
// comments). Editing is allowed for a short window after posting; deleting for
// a slightly longer one. These are client-safe constants (no "use server").

export const EDIT_WINDOW_MS = 15 * 60 * 1000 // 15 minutes
export const DELETE_WINDOW_MS = 30 * 60 * 1000 // 30 minutes

export function canEdit(createdAtMs: number, now = Date.now()): boolean {
  return now - createdAtMs <= EDIT_WINDOW_MS
}

export function canDelete(createdAtMs: number, now = Date.now()): boolean {
  return now - createdAtMs <= DELETE_WINDOW_MS
}
