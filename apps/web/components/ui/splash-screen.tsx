'use client'

/**
 * SplashScreen — Bejelentkezés előtti üdvözlő képernyő.
 *
 * Sablon: `Kartotéka-handoff-Splash-v2 → Splash.html` (2026-05-01q).
 *
 * 1920×1080 stage scale-elve a viewport-ra. 5-fázisos animáció:
 *   0–20% (s-on)        — háttér fade-in (Hatter.png + vignette + por + napsugarak)
 *   20–40% (s-sides)    — KEREK + EREK egyházkerületi címerek megjelennek
 *   40–60% (s-center)   — KARTOTEKA_V3 logó zoom + halo
 *   60–80% (s-headline) — "✦ Békesség Istentől!" + ornament-line
 *   60–100% (s-text)    — "Egyházi nyilvántartó rendszer" + tagline + loader
 *
 * Mount-after rendering pattern (2026-04-23 hydration fix): SSR-en és az első
 * kliens-render-en `null`-t ad vissza, csak a `useEffect` lefutása után jelenik
 * meg. Így nincs HTML-mismatch.
 */

import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'

const SESSION_KEY = 'kartoteka_splash_shown'
const DURATION_MS = 5000
const FADE_DELAY_MS = 5500
const HIDE_DELAY_MS = 6500

const HEADLINE = 'Békesség Istentől!'
const SUBTITLE = 'Egyházi nyilvántartó rendszer'
const TAGLINE = 'Hit. Hagyomány. Közösség. Szolgálat.'
const LOADER_LABEL = 'Betöltés...'

type Phase = 's-on' | 's-sides' | 's-center' | 's-headline' | 's-text'

function useStageScale() {
  const [scale, setScale] = useState(1)
  useEffect(() => {
    function onResize() {
      const sx = window.innerWidth / 1920
      const sy = window.innerHeight / 1080
      setScale(Math.min(sx, sy))
    }
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return scale
}

export function SplashScreen() {
  const [visible, setVisible] = useState(false)
  const [fading, setFading] = useState(false)
  const [phases, setPhases] = useState<Set<Phase>>(new Set())
  const [progress, setProgress] = useState(0)
  const startRef = useRef(0)
  const scale = useStageScale()

  useEffect(() => {
    const alreadyShown = sessionStorage.getItem(SESSION_KEY)
    if (alreadyShown) return

    sessionStorage.setItem(SESSION_KEY, '1')
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVisible(true)
    startRef.current = performance.now()

    const D = DURATION_MS
    const t1 = setTimeout(() => setPhases(p => new Set(p).add('s-on')), 80)
    const t2 = setTimeout(() => setPhases(p => new Set(p).add('s-sides')), D * 0.2)
    const t3 = setTimeout(() => setPhases(p => new Set(p).add('s-center')), D * 0.4)
    const t4 = setTimeout(() => setPhases(p => new Set(p).add('s-headline')), D * 0.6)
    const t5 = setTimeout(() => setPhases(p => new Set(p).add('s-text')), D * 0.65)

    const startAt = D * 0.6
    const endAt = D * 0.98
    let raf = 0
    function tick() {
      const now = performance.now() - startRef.current
      if (now < startAt) {
        setProgress(0)
      } else if (now > endAt) {
        setProgress(100)
      } else {
        setProgress(((now - startAt) / (endAt - startAt)) * 100)
      }
      if (now < D) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    const fadeTimer = setTimeout(() => setFading(true), FADE_DELAY_MS)
    const hideTimer = setTimeout(() => setVisible(false), HIDE_DELAY_MS)

    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
      clearTimeout(t4)
      clearTimeout(t5)
      cancelAnimationFrame(raf)
      clearTimeout(fadeTimer)
      clearTimeout(hideTimer)
    }
  }, [])

  if (!visible) return null

  const stageClasses = ['kt-splash-stage', ...Array.from(phases)].join(' ')
  const containerClasses = `kt-splash-host fixed inset-0 z-50 transition-opacity duration-700 ${fading ? 'opacity-0' : 'opacity-100'}`

  return (
    <div className={containerClasses}>
      <div className={stageClasses} style={{ transform: `scale(${scale})` }}>
        {/* Háttér rétegek */}
        <Image
          src="/Hatter.png"
          alt=""
          fill
          priority
          aria-hidden
          className="kt-splash-bg-img"
          sizes="1920px"
        />
        <div aria-hidden className="kt-splash-rays" />
        <div aria-hidden className="kt-splash-vignette" />
        <div aria-hidden className="kt-splash-motes" />

        {/* Headline */}
        <div className="kt-splash-headline">
          <div className="kt-splash-cross">✦</div>
          <h1 className="kt-splash-h1">{HEADLINE}</h1>
          <div className="kt-splash-ornament">
            <div className="kt-splash-ornament-line" />
            <div className="kt-splash-ornament-dot" />
            <div className="kt-splash-ornament-diamond" />
            <div className="kt-splash-ornament-dot" />
            <div className="kt-splash-ornament-line" />
          </div>
        </div>

        {/* Center row — 3 logo */}
        <div className="kt-splash-center-row">
          <div className="kt-splash-side-logo kt-splash-side-left">
            <Image
              src="/KEREK.png"
              alt="Királyhágómelléki Református Egyházkerület címere"
              width={280}
              height={280}
              priority
            />
          </div>

          <div className="kt-splash-center-logo">
            <div aria-hidden className="kt-splash-center-halo" />
            <Image
              src="/KARTOTEKA_V3.png"
              alt="Kartotéka"
              width={460}
              height={460}
              priority
            />
          </div>

          <div className="kt-splash-side-logo kt-splash-side-right">
            <Image
              src="/EREK.png"
              alt="Erdélyi Református Egyházkerület címere"
              width={280}
              height={280}
              priority
            />
          </div>
        </div>

        {/* Center meta */}
        <div className="kt-splash-meta">
          <p className="kt-splash-meta-title">{SUBTITLE}</p>
          <div className="kt-splash-meta-rule" />
          <p className="kt-splash-meta-tag">{TAGLINE}</p>
        </div>

        {/* Footer / loader */}
        <div className="kt-splash-footer">
          <div className="kt-splash-loader-label">{LOADER_LABEL}</div>
          <div className="kt-splash-loader-track">
            <div className="kt-splash-loader-fill" style={{ width: `${progress}%` }} />
          </div>
          <div className="kt-splash-loader-leaf">҂ ҂ ҂</div>
        </div>
      </div>
    </div>
  )
}
