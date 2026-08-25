"use server"

import { getActiveHomeVoice } from "@/lib/home/publishing"
import type { HomeVoice } from "@/components/home-voice-switch"

/**
 * Exposes the active Home's publishing voice to client components.
 *
 * Read-only and derived entirely from the session's own membership, so there is
 * nothing to authorize beyond what `getActiveHomeVoice` already checks: it
 * returns null unless the caller is an admin of the Home they currently have
 * active.
 */
export async function getActiveHomeVoiceAction(): Promise<HomeVoice | null> {
  return getActiveHomeVoice()
}
