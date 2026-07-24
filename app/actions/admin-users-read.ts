"use server"

import { requirePermission } from "@/lib/admin-auth"
import { searchUsers as _searchUsers, getUserProfile as _getUserProfile } from "@/lib/admin/users"

/** Client-callable, permission-guarded wrappers around the user data layer. */

export async function fetchUsers(query: string, page: number) {
  await requirePermission("users.view")
  return _searchUsers(query, page)
}

export async function fetchUserProfile(userId: string) {
  await requirePermission("users.view")
  return _getUserProfile(userId)
}
