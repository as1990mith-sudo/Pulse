"use client"

import { useEffect, useRef } from "react"

/**
 * Subtle falling-snow overlay for the Conversation Video room.
 *
 * Design goals:
 * - Barely-there: few, small, low-opacity flakes with a gentle drift, so it
 *   reads as ambient atmosphere rather than a distracting effect.
 * - Cheap: a single canvas with a handful of particles, paused when the tab is
 *   hidden and when the user prefers reduced motion.
 * - Non-interactive: pointer-events are off so it never intercepts taps.
 */
export function SnowOverlay() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext("2d")
    if (!context) return
    // Non-null locals so narrowing holds inside the nested render functions.
    const el = canvas
    const ctx = context

    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    if (reduceMotion) return

    let width = 0
    let height = 0
    let dpr = 1

    type Flake = {
      x: number
      y: number
      r: number // radius
      speed: number // vertical fall speed (px/s)
      drift: number // horizontal sway amplitude
      phase: number // sway phase
      opacity: number
    }

    let flakes: Flake[] = []

    function rand(min: number, max: number) {
      return min + Math.random() * (max - min)
    }

    function buildFlakes() {
      // Density scales gently with area but stays deliberately sparse.
      const count = Math.min(46, Math.max(18, Math.round((width * height) / 26000)))
      flakes = Array.from({ length: count }, () => ({
        x: rand(0, width),
        y: rand(0, height),
        r: rand(0.6, 1.9),
        speed: rand(8, 22),
        drift: rand(6, 18),
        phase: rand(0, Math.PI * 2),
        opacity: rand(0.12, 0.4),
      }))
    }

    function resize() {
      const rect = el.getBoundingClientRect()
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      width = rect.width
      height = rect.height
      el.width = Math.floor(width * dpr)
      el.height = Math.floor(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      buildFlakes()
    }

    resize()

    let raf = 0
    let last = performance.now()
    let running = true

    function frame(now: number) {
      if (!running) return
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      ctx.clearRect(0, 0, width, height)
      for (const f of flakes) {
        f.y += f.speed * dt
        f.phase += dt * 0.6
        const x = f.x + Math.sin(f.phase) * f.drift
        if (f.y - f.r > height) {
          // Recycle to the top with a fresh horizontal position.
          f.y = -f.r
          f.x = rand(0, width)
        }
        ctx.beginPath()
        ctx.arc(x, f.y, f.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(255, 255, 255, ${f.opacity})`
        ctx.fill()
      }
      raf = requestAnimationFrame(frame)
    }

    raf = requestAnimationFrame(frame)

    function onVisibility() {
      if (document.hidden) {
        running = false
        cancelAnimationFrame(raf)
      } else if (!running) {
        running = true
        last = performance.now()
        raf = requestAnimationFrame(frame)
      }
    }

    window.addEventListener("resize", resize)
    document.addEventListener("visibilitychange", onVisibility)

    return () => {
      running = false
      cancelAnimationFrame(raf)
      window.removeEventListener("resize", resize)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-20 size-full"
    />
  )
}
