"use server"

import { searchUsers, type ProfileSummary } from "@/lib/profile"

/** Server action: search users by name for the header search box. */
export async function searchUsersAction(query: string): Promise<ProfileSummary[]> {
  return searchUsers(query)
}
