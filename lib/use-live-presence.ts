"use client"

import { useEffect, useState } from "react"
import { heartbeatPresence, leavePresence, type LiveAudienceMember } from "@/app/actions/live"

/**
 * Keeps the current user marked present in a live room and returns the live
 * audience (listener count + members). Every participant (host + listeners)
 * heartbeats every few seconds; the server announces new listeners in chat and
 * expires anyone who stops pinging. Pass `enabled={false}` to pause (e.g. while
 * the room hasn't been joined yet).
 */
export function useLivePresence(roomName: string | null | undefined, enabled = true) {
  const [count, setCount] = useState(0)
  const [members, setMembers] = useState<LiveAudienceMember[]>([])

  useEffect(() => {
    if (!roomName || !enabled) return
    let cancelled = false

    async function ping() {
      try {
        const res = await heartbeatPresence({ roomName: roomName! })
        if (!cancelled) {
          setCount(res.count)
          setMembers(res.members)
        }
      } catch {
        // ignore transient errors; the next tick will retry
      }
    }

    void ping()
    const id = setInterval(ping, 10_000)

    return () => {
      cancelled = true
      clearInterval(id)
      // Best-effort removal so the audience updates promptly on leave.
      void leavePresence({ roomName: roomName! }).catch(() => {})
    }
  }, [roomName, enabled])

  return { count, members }
}
