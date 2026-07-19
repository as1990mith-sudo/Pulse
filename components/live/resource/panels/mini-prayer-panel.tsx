"use client"

import { useState } from "react"
import useSWR from "swr"
import { HandHeart, Loader2, Send } from "lucide-react"
import { motion, AnimatePresence } from "motion/react"
import { useLiveResources } from "@/components/live/resource/resource-context"
import {
  getPrayerRequests,
  submitPrayerRequest,
  prayForRequest,
  type PrayerRequestView,
} from "@/app/actions/prayer-requests"

/**
 * Prayer Requests panel. Any participant can post a request (signed-out viewers
 * post anonymously) and tap "I prayed" to add to a gentle tally. The live keeps
 * running behind the panel — this is a quiet, communal corner of the gathering.
 */
export function MiniPrayerPanel() {
  const { descriptor } = useLiveResources()
  const roomName = descriptor?.roomName ?? null

  const { data, mutate, isLoading } = useSWR(
    roomName ? ["prayer-requests", roomName] : null,
    () => getPrayerRequests(roomName as string),
    { revalidateOnFocus: false, refreshInterval: 15000 },
  )
  const requests = data ?? []

  const [body, setBody] = useState("")
  const [anon, setAnon] = useState(false)
  const [sending, setSending] = useState(false)
  const [prayed, setPrayed] = useState<Set<number>>(new Set())

  async function submit() {
    const text = body.trim()
    if (!text || !roomName) return
    setSending(true)
    await submitPrayerRequest({ roomName, body: text, isAnonymous: anon })
    setSending(false)
    setBody("")
    void mutate()
  }

  async function pray(req: PrayerRequestView) {
    if (prayed.has(req.id)) return
    setPrayed((prev) => new Set(prev).add(req.id))
    await prayForRequest(req.id)
    void mutate()
  }

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {isLoading ? (
          <div className="flex h-24 items-center justify-center">
            <Loader2 className="size-5 animate-spin text-white/40" />
          </div>
        ) : requests.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
            <HandHeart className="size-7 text-white/25" />
            <p className="text-sm text-white/50">No prayer requests yet.</p>
            <p className="max-w-[220px] text-pretty text-xs text-white/30">
              Share what you&apos;d like the room to pray for. Others can stand with you in prayer.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            <AnimatePresence initial={false}>
              {requests.map((req) => (
                <motion.li
                  key={req.id}
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="rounded-2xl border border-white/10 bg-white/[0.04] p-3"
                >
                  <p className="text-[15px] leading-relaxed text-white">{req.body}</p>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-xs text-white/40">
                      {req.isAnonymous ? "Anonymous" : req.authorName}
                      {req.isMine && " · you"}
                    </span>
                    <button
                      onClick={() => pray(req)}
                      disabled={prayed.has(req.id)}
                      className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/20 disabled:opacity-70"
                    >
                      <HandHeart className={prayed.has(req.id) ? "size-3.5 text-rose-400" : "size-3.5"} />
                      {req.prayedCount > 0 ? req.prayedCount : "Pray"}
                    </button>
                  </div>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-white/10 p-3">
        <div className="flex items-end gap-2">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={1}
            placeholder="Add a prayer request…"
            className="max-h-24 min-h-[42px] flex-1 resize-none rounded-2xl border border-white/10 bg-white/[0.06] px-3.5 py-2.5 text-sm text-white outline-none placeholder:text-white/35 focus:border-white/25"
          />
          <button
            onClick={submit}
            disabled={!body.trim() || sending}
            aria-label="Send prayer request"
            className="flex size-[42px] shrink-0 items-center justify-center rounded-full bg-white text-black transition-transform active:scale-95 disabled:opacity-50"
          >
            {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" strokeWidth={2.4} />}
          </button>
        </div>
        <label className="mt-2 flex items-center gap-2 text-xs text-white/45">
          <input
            type="checkbox"
            checked={anon}
            onChange={(e) => setAnon(e.target.checked)}
            className="size-3.5 rounded border-white/20 bg-transparent accent-primary"
          />
          Post anonymously
        </label>
      </div>
    </div>
  )
}
