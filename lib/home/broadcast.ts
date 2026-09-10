// Client-safe domain model for Home Broadcast.
//
// Holds the recipient-targeting vocabulary, the view shapes shared by the admin
// console and the member inbox, and the pure audience-count maths the composer
// uses to show "N members will receive this" before sending. Imports nothing
// server-only so the compose UI and the server actions share one source of truth.

import type { Gender } from "@/lib/home/members"

// How an admin chose the audience. The resolved people are snapshotted at send
// time; this only records the intent for the history view.
export type BroadcastRecipientType = "all" | "female" | "male" | "exclude" | "specific"

export const RECIPIENT_TYPES: { id: BroadcastRecipientType; label: string; hint: string }[] = [
  { id: "all", label: "All members", hint: "Everyone in this Home" },
  { id: "female", label: "Females only", hint: "Members whose gender is female" },
  { id: "male", label: "Males only", hint: "Members whose gender is male" },
  { id: "exclude", label: "Everyone except…", hint: "All members minus the people you pick" },
  { id: "specific", label: "Only these people", hint: "Just the people you pick" },
]

export function recipientTypeLabel(type: BroadcastRecipientType): string {
  return RECIPIENT_TYPES.find((r) => r.id === type)?.label ?? "All members"
}

/** A member as shown in the recipient picker — compact, no engagement data. */
export type BroadcastMemberPick = {
  userId: string
  name: string
  gender: Gender | null
  image: string | null
  initials: string
  color: string
}

/** The active-member audience for a Home, resolved server-side for the composer. */
export type BroadcastAudience = {
  total: number
  male: number
  female: number
  other: number
  /** null-gender members — counted so the admin understands gender targeting reach. */
  unknownGender: number
  members: BroadcastMemberPick[]
}

/** One row in the admin's broadcast history. */
export type BroadcastView = {
  id: number
  message: string
  recipientType: BroadcastRecipientType
  recipientLabel: string
  recipientCount: number
  openedCount: number
  unopenedCount: number
  sentAt: string // ISO
  createdByName: string
}

/** A single broadcast message as a member sees it in the Home Broadcast thread. */
export type BroadcastMessageView = {
  id: number
  message: string
  attachmentUrl: string | null
  attachmentType: string | null
  attachmentName: string | null
  sentAt: string // ISO
}

/**
 * The exact number of people a broadcast will reach given the current audience
 * and the admin's selection. Pure + deterministic so the composer preview and
 * the send confirmation can never disagree with each other. The server resolves
 * the authoritative audience again at send time — this is the UI estimate.
 */
export function resolveRecipientCount(
  type: BroadcastRecipientType,
  audience: Pick<BroadcastAudience, "total" | "male" | "female">,
  picked: string[],
  pickedIsMember: (id: string) => boolean,
): number {
  const valid = picked.filter(pickedIsMember)
  switch (type) {
    case "all":
      return audience.total
    case "female":
      return audience.female
    case "male":
      return audience.male
    case "exclude":
      return Math.max(0, audience.total - valid.length)
    case "specific":
      return valid.length
    default:
      return 0
  }
}

/** Whether the chosen targeting needs the individual member picker. */
export function usesMemberPicker(type: BroadcastRecipientType): boolean {
  return type === "exclude" || type === "specific"
}

export const BROADCAST_SENDER_NAME = "Home Broadcast"
