"use client"

/**
 * User-selected audio OUTPUT route for live meetings — Speaker, Earpiece or
 * Bluetooth — treated as an explicit, sticky preference that Frequency never
 * silently changes.
 *
 * Platform reality (see also `lib/audio-routing.ts`): no mobile browser exposes
 * an API to force the phone's earpiece/speaker/Bluetooth route. The only real
 * actuator on a phone is the native shell. So this module:
 *
 *  1. Persists the user's choice locally and exposes it to the whole app.
 *  2. Delegates actual routing to an optional NATIVE BRIDGE (the Frequency
 *     mobile wrapper implements `window.FrequencyNativeAudio`). When the bridge
 *     is present it owns Speaker/Earpiece/Bluetooth switching and tells us when
 *     the OS changes the route (e.g. a Bluetooth device connects/disconnects),
 *     so we can restore the user's preferred route automatically.
 *  3. On plain web, degrades gracefully: desktop browsers can pick a named
 *     output device via `setSinkId`; everywhere else the loudspeaker /
 *     connected-device behaviour from `audio-routing.ts` continues to apply and
 *     the stored preference is preserved for the native shell to honour.
 *
 * The store is a tiny framework-agnostic singleton so every live surface (host,
 * guest, participant) shares one preference. Consume it with `useAudioOutput`.
 */

import { useCallback, useEffect, useSyncExternalStore } from "react"

export type AudioOutputRoute = "speaker" | "earpiece" | "bluetooth"

export const AUDIO_OUTPUT_ROUTES: readonly AudioOutputRoute[] = ["speaker", "earpiece", "bluetooth"]

const STORAGE_KEY = "frequency.audioOutput"

/** Matches Bluetooth / wireless output device labels (web desktop detection). */
const BLUETOOTH_LABEL = /bluetooth|airpod|headset|wireless|buds|beats|galaxy buds|wh-|wf-/i

/**
 * Optional native audio bridge implemented by the Frequency mobile shell.
 * Absent on plain web — everything degrades gracefully when it is.
 */
export interface FrequencyNativeAudioBridge {
  /** Switch the OS output route. Return value is ignored (best-effort). */
  setAudioRoute: (route: AudioOutputRoute) => void | boolean | Promise<void | boolean>
  /** Report currently selectable routes, if the shell can enumerate them. */
  getAvailableRoutes?: () => AudioOutputRoute[] | Promise<AudioOutputRoute[]>
  /** Whether a Bluetooth audio output device is currently connected. */
  isBluetoothConnected?: () => boolean | Promise<boolean>
  /**
   * Register a listener the shell calls when the OS route changes underneath us
   * (device connected/removed, interruption, etc). Returns an unsubscribe fn.
   */
  onRouteChange?: (
    cb: (info: { route?: AudioOutputRoute; bluetoothConnected?: boolean }) => void,
  ) => (() => void) | void
}

function nativeBridge(): FrequencyNativeAudioBridge | null {
  if (typeof window === "undefined") return null
  return (window as unknown as { FrequencyNativeAudio?: FrequencyNativeAudioBridge }).FrequencyNativeAudio ?? null
}

export function hasNativeAudioBridge(): boolean {
  return nativeBridge() != null
}

interface Snapshot {
  route: AudioOutputRoute
  bluetoothConnected: boolean
  native: boolean
}

// Server + first-client render share this default so hydration matches; the
// persisted preference is read after mount in `init()`.
const DEFAULT_SNAPSHOT: Snapshot = { route: "speaker", bluetoothConnected: false, native: false }

let snapshot: Snapshot = DEFAULT_SNAPSHOT
const listeners = new Set<() => void>()

function commit(next: Snapshot) {
  // Only replace the reference when something actually changed, so
  // useSyncExternalStore does not loop.
  if (
    next.route === snapshot.route &&
    next.bluetoothConnected === snapshot.bluetoothConnected &&
    next.native === snapshot.native
  ) {
    return
  }
  snapshot = next
  listeners.forEach((l) => l())
}

let initialized = false

function init(): void {
  if (initialized || typeof window === "undefined") return
  initialized = true

  let route: AudioOutputRoute = DEFAULT_SNAPSHOT.route
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved && (AUDIO_OUTPUT_ROUTES as readonly string[]).includes(saved)) {
      route = saved as AudioOutputRoute
    }
  } catch {
    // Private mode / storage denied — keep the default.
  }

  commit({ ...snapshot, route, native: hasNativeAudioBridge() })

  // Let the native shell drive route + Bluetooth updates. This is how the
  // preferred route is restored automatically when a device reappears.
  const bridge = nativeBridge()
  if (bridge?.onRouteChange) {
    try {
      bridge.onRouteChange((info) => {
        const next = { ...snapshot }
        if (info.route && (AUDIO_OUTPUT_ROUTES as readonly string[]).includes(info.route)) {
          next.route = info.route
        }
        if (typeof info.bluetoothConnected === "boolean") {
          next.bluetoothConnected = info.bluetoothConnected
        }
        commit(next)
      })
    } catch {
      // ignore a misbehaving bridge
    }
  }

  void refreshBluetoothAvailability()
  try {
    navigator.mediaDevices?.addEventListener?.("devicechange", () => void refreshBluetoothAvailability())
  } catch {
    // enumerateDevices unsupported — Bluetooth stays reported via the bridge only.
  }
}

async function refreshBluetoothAvailability(): Promise<void> {
  const bridge = nativeBridge()
  if (bridge?.isBluetoothConnected) {
    try {
      const connected = await bridge.isBluetoothConnected()
      commit({ ...snapshot, bluetoothConnected: !!connected })
      return
    } catch {
      // fall through to web detection
    }
  }
  try {
    const devices = await navigator.mediaDevices.enumerateDevices()
    const connected = devices.some((d) => d.kind === "audiooutput" && BLUETOOTH_LABEL.test(d.label))
    commit({ ...snapshot, bluetoothConnected: connected })
  } catch {
    // Labels require permission / unsupported — leave as-is.
  }
}

/**
 * Best-effort web actuation for desktop browsers that support `setSinkId`:
 * point every media element at the output device matching the chosen route.
 * A no-op on mobile web (no such API), where the native bridge is required.
 */
async function applySinkForRoute(route: AudioOutputRoute): Promise<void> {
  if (typeof document === "undefined") return
  try {
    const devices = await navigator.mediaDevices.enumerateDevices()
    const outputs = devices.filter((d) => d.kind === "audiooutput")
    if (outputs.length === 0) return
    let target: MediaDeviceInfo | undefined
    if (route === "bluetooth") {
      target = outputs.find((d) => BLUETOOTH_LABEL.test(d.label))
      // Bluetooth preferred but none present: keep the preference, do not
      // force another device. The bridge/OS routes to it when it reappears.
      if (!target) return
    } else {
      target = outputs.find((d) => d.deviceId === "default") ?? outputs[0]
    }
    if (!target) return
    const els = document.querySelectorAll<HTMLMediaElement>("audio, video")
    els.forEach((el) => {
      const sinkable = el as HTMLMediaElement & { setSinkId?: (id: string) => Promise<void> }
      if (typeof sinkable.setSinkId === "function") {
        void sinkable.setSinkId(target!.deviceId).catch(() => {})
      }
    })
  } catch {
    // setSinkId unsupported or permission denied — graceful no-op.
  }
}

/**
 * (Re)assert the current (or given) output route. Idempotent and safe to call
 * repeatedly — recovery paths use it to restore the user's preference after an
 * interruption WITHOUT changing what they chose.
 */
export async function applyAudioOutputRoute(route: AudioOutputRoute = snapshot.route): Promise<void> {
  init()
  const bridge = nativeBridge()
  if (bridge) {
    try {
      await bridge.setAudioRoute(route)
    } catch {
      // ignore — the OS keeps whatever route it can
    }
    return
  }
  // Web fallback (desktop device selection only).
  if (route === "speaker" || route === "bluetooth") {
    await applySinkForRoute(route)
  }
}

/** Explicitly change the preferred route (the only web path that changes it). */
export function setAudioOutputRoute(route: AudioOutputRoute): void {
  init()
  if (snapshot.route !== route) {
    commit({ ...snapshot, route })
    try {
      localStorage.setItem(STORAGE_KEY, route)
    } catch {
      // ignore storage failure — the in-memory preference still applies
    }
  }
  void applyAudioOutputRoute(route)
}

export function getAudioOutputRoute(): AudioOutputRoute {
  return snapshot.route
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

function getSnapshot(): Snapshot {
  return snapshot
}

function getServerSnapshot(): Snapshot {
  return DEFAULT_SNAPSHOT
}

export interface UseAudioOutput {
  route: AudioOutputRoute
  bluetoothConnected: boolean
  /** True when a native shell can actually switch Speaker/Earpiece/Bluetooth. */
  isNative: boolean
  setRoute: (route: AudioOutputRoute) => void
  /**
   * Whether the host's "I'm on headphones" mode should auto-engage: Bluetooth
   * is the chosen route AND a Bluetooth device is actually connected.
   */
  shouldEngageHeadphones: boolean
}

export function useAudioOutput(): UseAudioOutput {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  // Read the persisted preference + wire native/device listeners after mount so
  // server and first client render agree (avoids hydration mismatch).
  useEffect(() => {
    init()
  }, [])

  const setRoute = useCallback((route: AudioOutputRoute) => setAudioOutputRoute(route), [])

  return {
    route: snap.route,
    bluetoothConnected: snap.bluetoothConnected,
    isNative: snap.native,
    setRoute,
    shouldEngageHeadphones: snap.route === "bluetooth" && snap.bluetoothConnected,
  }
}
