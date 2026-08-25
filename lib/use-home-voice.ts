"use client"

import useSWR from "swr"
import { getActiveHomeVoiceAction } from "@/app/actions/home-voice"
import type { HomeVoice } from "@/components/home-voice-switch"

/**
 * The active Home's organisation identity when the viewer may speak for it, or
 * null otherwise.
 *
 * Comment boxes live inside `PostCard`, which is rendered by seven different
 * surfaces (feed, profile, org, search, testimonies…). Threading a `homeVoice`
 * prop down every one of those paths would touch a lot of unrelated code and
 * silently break the day an eighth surface forgets it. Fetching it once through
 * SWR's shared cache keeps the switcher correct everywhere by construction — one
 * request per page, deduped across every post on screen.
 *
 * Revalidation is disabled: the active Home only changes via an explicit switch,
 * which reloads the page anyway.
 */
export function useHomeVoice(): HomeVoice | null {
  const { data } = useSWR<HomeVoice | null>("active-home-voice", () => getActiveHomeVoiceAction(), {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
  })
  return data ?? null
}
