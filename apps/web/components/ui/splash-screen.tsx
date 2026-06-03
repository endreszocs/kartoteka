'use client'

/**
 * SplashScreen — Bejelentkezés előtti üdvözlő képernyő.
 *
 * Sablon: `Kartotéka-handoff-Splash → Splash.html`.
 *
 * 1920×1080 stage scale-elve a viewport-ra. 5-fázisos animáció:
 *   0–20% (s-on)        — háttér fade-in (Hatter.png + vignette + por + napsugarak)
 *   20–40% (s-sides)    — KEREK + EREK egyházkerületi címerek megjelennek
 *   40–60% (s-center)   — KARTOTEKA_V3 logó zoom + halo
 *   60–80% (s-headline) — "✦ Békesség Istentől!" + ornament-line
 *   60–100% (s-text)    — "Egyházi nyilvántartó rendszer" + tagline + loader
 *
 * Reszponzív viselkedés:
 *   - mobile  (<768px):   külön vertikális kompakt layout, viewport-fit, single column
 *   - tablet  (768-1023): stage Math.min(sx, sy) letterboxing — minden látszik
 *   - desktop (>=1024):   stage Math.max(sx, sy) fill — eredeti élmény
 *
 * Implementáció: az opacity/transform inline `style`-szal kezelt (nem CSS
 * cascade-classszal), így a Tailwind 4 layer-prioritás-konfliktusoktól
 * függetlenül megbízhatóan érvényesül.
 */

import Image from 'next/image'
import { useEffect, useMemo, useRef, useState } from 'react'

const SESSION_KEY = 'kartoteka_splash_shown'
const DURATION_MS = 5000
const FADE_DELAY_MS = 5500
const HIDE_DELAY_MS = 6500

const HEADLINE = 'Békesség Istentől!'
const SUBTITLE = 'Egyházi nyilvántartó rendszer'
const TAGLINE = 'Hit. Hagyomány. Közösség. Szolgálat.'
const LOADER_LABEL = 'Betöltés...'

type Phase = 's-on' | 's-sides' | 's-center' | 's-headline' | 's-text'
type ViewportMode = 'mobile' | 'tablet' | 'desktop'

function useViewportMode(): ViewportMode {
  const [mode, setMode] = useState<ViewportMode>('desktop')
  useEffect(() => {
    function update() {
      const w = window.innerWidth
      if (w < 768) setMode('mobile')
      else if (w < 1024) setMode('tablet')
      else setMode('desktop')
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])
  return mode
}

function useStageScale(mode: ViewportMode) {
  // Desktop (>=1024): max(sx, sy) — fill mode (kitölti a viewport-ot, levág a széleken).
  // Tablet (768-1023): min(sx, sy) — letterboxing, minden látszik.
  // Mobile-on a Stage nem renderelődik (külön layout), így itt mindegy.
  const [scale, setScale] = useState(1)
  useEffect(() => {
    function onResize() {
      const sx = window.innerWidth / 1920
      const sy = window.innerHeight / 1080
      setScale(mode === 'tablet' ? Math.min(sx, sy) : Math.max(sx, sy))
    }
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [mode])
  return scale
}

function useSplashLifecycle() {
  const [visible, setVisible] = useState(false)
  const [fading, setFading] = useState(false)
  const [phases, setPhases] = useState<Set<Phase>>(new Set())
  const [progress, setProgress] = useState(0)
  const startRef = useRef(0)

  useEffect(() => {
    if (sessionStorage.getItem(SESSION_KEY)) return

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
    const hideTimer = setTimeout(() => {
      setVisible(false)
      sessionStorage.setItem(SESSION_KEY, '1')
    }, HIDE_DELAY_MS)

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

  return { visible, fading, phases, progress }
}

export function SplashScreen() {
  const mode = useViewportMode()
  const { visible, fading, phases, progress } = useSplashLifecycle()
  const stageScale = useStageScale(mode)

  if (!visible) return null
  if (mode === 'mobile') {
    return <MobileSplash fading={fading} phases={phases} progress={progress} />
  }
  return (
    <StageSplash
      fading={fading}
      phases={phases}
      progress={progress}
      stageScale={stageScale}
      mode={mode}
    />
  )
}

// ──────────────────────────────────────────────────────────────────────
// StageSplash — desktop + tablet (1920×1080 stage)
// ──────────────────────────────────────────────────────────────────────

interface StageSplashProps {
  fading: boolean
  phases: Set<Phase>
  progress: number
  stageScale: number
  mode: ViewportMode
}

function StageSplash({ fading, phases, progress, stageScale, mode }: StageSplashProps) {
  const onPhase = useMemo(() => phases.has('s-on'), [phases])
  const sidesPhase = useMemo(() => phases.has('s-sides'), [phases])
  const centerPhase = useMemo(() => phases.has('s-center'), [phases])
  const headlinePhase = useMemo(() => phases.has('s-headline'), [phases])
  const textPhase = useMemo(() => phases.has('s-text'), [phases])

  return (
    <div
      className="fixed inset-0 z-50"
      style={{
        background: '#0d0a07',
        display: 'grid',
        placeItems: 'center',
        overflow: 'hidden',
        fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
        opacity: fading ? 0 : 1,
        transition: 'opacity 700ms ease-in',
      }}
    >
      <div
        style={{
          position: 'relative',
          width: 1920,
          height: 1080,
          transform: `scale(${stageScale})`,
          transformOrigin: 'center center',
          overflow: 'hidden',
          background: '#d8cfba',
          boxShadow: mode === 'tablet'
            ? '0 30px 120px rgba(0,0,0,0.7)'
            : '0 30px 120px rgba(0,0,0,0.6)',
        }}
      >
        {/* Background image */}
        <Image
          src="/Hatter.png"
          alt=""
          fill
          priority
          aria-hidden
          sizes="1920px"
          style={{
            objectFit: 'cover',
            objectPosition: 'center',
            transform: onPhase ? 'scale(1)' : 'scale(1.04)',
            opacity: onPhase ? 1 : 0,
            transition: 'opacity 1.1s cubic-bezier(.2,.7,.2,1), transform 6s cubic-bezier(.2,.7,.2,1)',
          }}
        />

        {/* Vignette */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            background:
              'radial-gradient(ellipse 70% 55% at 50% 50%, rgba(255,246,222,.18) 0%, rgba(255,246,222,0) 60%), radial-gradient(ellipse 100% 80% at 50% 40%, rgba(0,0,0,0) 55%, rgba(38,30,18,.32) 100%)',
            opacity: onPhase ? 1 : 0,
            transition: 'opacity 1.4s ease-out',
          }}
        />

        {/* Por- / fényszemcsék */}
        <div
          aria-hidden
          className="kt-splash-motes-anim"
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            backgroundImage:
              'radial-gradient(circle at 12% 80%, rgba(255,240,210,.45) 0 1.2px, transparent 2px), radial-gradient(circle at 78% 22%, rgba(255,240,210,.35) 0 1px, transparent 2px), radial-gradient(circle at 55% 70%, rgba(255,240,210,.5) 0 1.4px, transparent 2px), radial-gradient(circle at 33% 35%, rgba(255,240,210,.3) 0 1px, transparent 2px), radial-gradient(circle at 88% 65%, rgba(255,240,210,.4) 0 1.1px, transparent 2px)',
            backgroundSize: '1200px 800px',
            opacity: onPhase ? 0.9 : 0,
            transition: 'opacity 2s ease-out',
          }}
        />

        {/* Napsugarak */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: '-10%',
            left: '50%',
            width: '90%',
            height: '70%',
            transform: 'translateX(-50%)',
            pointerEvents: 'none',
            background:
              'conic-gradient(from 180deg at 50% 0%, rgba(255,236,196,0) 0deg, rgba(255,236,196,0) 70deg, rgba(255,238,200,.18) 85deg, rgba(255,242,210,.32) 90deg, rgba(255,238,200,.18) 95deg, rgba(255,236,196,0) 110deg, rgba(255,236,196,0) 360deg)',
            filter: 'blur(14px)',
            opacity: onPhase ? 0.55 : 0,
            transition: 'opacity 1.6s ease-out',
          }}
        />

        {/* Headline */}
        <div
          style={{
            position: 'absolute',
            top: 78,
            left: '50%',
            width: '100%',
            textAlign: 'center',
            transform: headlinePhase ? 'translate(-50%, 0)' : 'translate(-50%, -14px)',
            opacity: headlinePhase ? 1 : 0,
            filter: headlinePhase ? 'blur(0)' : 'blur(6px)',
            transition:
              'opacity 0.9s cubic-bezier(.2,.7,.2,1) 0.1s, transform 0.9s cubic-bezier(.2,.7,.2,1) 0.1s, filter 0.9s ease-out 0.1s',
          }}
        >
          <div
            style={{
              display: 'inline-block',
              color: '#b48a3b',
              fontSize: 30,
              lineHeight: 1,
              marginBottom: 10,
              opacity: 0.9,
              textShadow: '0 1px 0 rgba(255,255,255,.3)',
            }}
          >
            ✦
          </div>
          <h1
            style={{
              fontFamily: '"Cormorant Garamond", "Cormorant", serif',
              fontWeight: 500,
              fontStyle: 'italic',
              fontSize: 96,
              lineHeight: 1,
              letterSpacing: '0.5px',
              color: '#1f2a24',
              margin: '0 0 18px 0',
              textShadow: '0 1px 0 rgba(255,255,255,.55), 0 12px 40px rgba(255,235,200,.35)',
            }}
          >
            {HEADLINE}
          </h1>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 4, color: '#b48a3b' }}>
            <div style={{ height: 1, width: 120, background: 'linear-gradient(90deg, transparent, #cda454 35%, #b48a3b 50%, #cda454 65%, transparent)' }} />
            <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#cda454' }} />
            <div style={{ width: 8, height: 8, background: '#b48a3b', transform: 'rotate(45deg)', boxShadow: '0 0 0 2px rgba(180,138,59,.18)' }} />
            <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#cda454' }} />
            <div style={{ height: 1, width: 120, background: 'linear-gradient(90deg, transparent, #cda454 35%, #b48a3b 50%, #cda454 65%, transparent)' }} />
          </div>
        </div>

        {/* Center row — 3 logo */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            display: 'grid',
            gridTemplateColumns: '1fr auto 1fr',
            alignItems: 'center',
            width: 1500,
            columnGap: 60,
          }}
        >
          {/* Side left — KEREK */}
          <div
            style={{
              width: 280,
              height: 280,
              display: 'grid',
              placeItems: 'center',
              filter: sidesPhase
                ? 'drop-shadow(0 18px 36px rgba(20,16,8,.25))'
                : 'drop-shadow(0 16px 30px rgba(20,16,8,.18))',
              opacity: sidesPhase ? 1 : 0,
              transform: sidesPhase ? 'translateX(0) scale(1)' : 'translateX(-40px) scale(.94)',
              justifySelf: 'end',
              transition:
                'opacity 1s cubic-bezier(.2,.7,.2,1), transform 1s cubic-bezier(.2,.7,.2,1), filter 1s ease',
            }}
          >
            <Image
              src="/KEREK.png"
              alt="Királyhágómelléki Református Egyházkerület címere"
              width={280}
              height={280}
              priority
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
          </div>

          {/* Center — KARTOTEKA_V3 */}
          <div
            style={{
              position: 'relative',
              width: 460,
              height: 460,
              display: 'grid',
              placeItems: 'center',
              opacity: centerPhase ? 1 : 0,
              transform: centerPhase ? 'scale(1)' : 'scale(.86)',
              filter: centerPhase ? 'blur(0)' : 'blur(8px)',
              transition:
                'opacity 1.1s cubic-bezier(.2,.7,.2,1), transform 1.1s cubic-bezier(.2,.7,.2,1), filter 1.1s ease-out',
            }}
          >
            <div
              aria-hidden
              style={{
                position: 'absolute',
                inset: -40,
                borderRadius: '50%',
                background:
                  'radial-gradient(circle at 50% 45%, rgba(255,244,210,.85) 0%, rgba(255,238,196,.55) 22%, rgba(255,232,180,.18) 45%, rgba(255,232,180,0) 65%)',
                filter: 'blur(10px)',
                zIndex: 1,
                opacity: centerPhase ? 1 : 0,
                transition: 'opacity 1.2s ease-out',
              }}
            />
            <Image
              src="/KARTOTEKA_V3.png"
              alt="Kartotéka"
              width={460}
              height={460}
              priority
              style={{
                position: 'relative',
                zIndex: 2,
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                filter: 'drop-shadow(0 24px 50px rgba(20,16,8,.28))',
              }}
            />
          </div>

          {/* Side right — EREK. Natural aspect-ratio 0.625 (250×400 px, keskeny/magas).
              A wrapper 280×280, és az EREK kép 175×280-as megjelenéssel (height
              teljes, width arányos), így a KEREK-tel optikailag azonos magasságú. */}
          <div
            style={{
              width: 280,
              height: 280,
              display: 'grid',
              placeItems: 'center',
              filter: sidesPhase
                ? 'drop-shadow(0 18px 36px rgba(20,16,8,.25))'
                : 'drop-shadow(0 16px 30px rgba(20,16,8,.18))',
              opacity: sidesPhase ? 1 : 0,
              transform: sidesPhase ? 'translateX(0) scale(1)' : 'translateX(40px) scale(.94)',
              justifySelf: 'start',
              transition:
                'opacity 1s cubic-bezier(.2,.7,.2,1), transform 1s cubic-bezier(.2,.7,.2,1), filter 1s ease',
            }}
          >
            <Image
              src="/EREK.png"
              alt="Erdélyi Református Egyházkerület címere"
              width={175}
              height={280}
              priority
              style={{ width: 175, height: 280, objectFit: 'contain' }}
            />
          </div>
        </div>

        {/* Center meta */}
        <div
          style={{
            position: 'absolute',
            top: 'calc(50% + 260px)',
            left: '50%',
            transform: textPhase ? 'translate(-50%, 0)' : 'translate(-50%, 6px)',
            textAlign: 'center',
            width: 760,
            opacity: textPhase ? 1 : 0,
            transition:
              'opacity 0.9s cubic-bezier(.2,.7,.2,1) 0.15s, transform 0.9s cubic-bezier(.2,.7,.2,1) 0.15s',
          }}
        >
          <p
            style={{
              fontFamily: '"Cormorant Garamond", serif',
              fontWeight: 500,
              fontSize: 30,
              letterSpacing: '4px',
              color: '#2f3d34',
              margin: 0,
            }}
          >
            {SUBTITLE}
          </p>
          <div
            style={{
              margin: '16px auto 14px',
              width: 60,
              height: 1,
              background: 'linear-gradient(90deg, transparent, rgba(180,138,59,.6), transparent)',
            }}
          />
          <p
            style={{
              fontFamily: '"Inter", sans-serif',
              fontSize: 15,
              fontWeight: 400,
              letterSpacing: '6px',
              textTransform: 'uppercase',
              color: '#4a5a4f',
              margin: 0,
            }}
          >
            {TAGLINE}
          </p>
        </div>

        {/* Footer / loader */}
        <div
          style={{
            position: 'absolute',
            bottom: 64,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 480,
            textAlign: 'center',
            opacity: textPhase ? 1 : 0,
            transition: 'opacity 0.9s ease-out 0.25s',
          }}
        >
          <div
            style={{
              fontFamily: '"Cormorant Garamond", serif',
              fontStyle: 'italic',
              fontSize: 22,
              color: '#2f3d34',
              letterSpacing: '1.5px',
              marginBottom: 14,
            }}
          >
            {LOADER_LABEL}
          </div>
          <div
            style={{
              position: 'relative',
              width: '100%',
              height: 3,
              background: 'rgba(47,93,63,.18)',
              borderRadius: 999,
              overflow: 'hidden',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,.35)',
            }}
          >
            <div
              style={{
                position: 'absolute',
                inset: 0,
                width: `${progress}%`,
                background: 'linear-gradient(90deg, #2f5d3f, #4f8e63, #e6c98a)',
                borderRadius: 999,
                boxShadow: '0 0 12px rgba(79,142,99,.6)',
                transition: 'width 0.15s linear',
              }}
            />
          </div>
          <div style={{ marginTop: 12, color: 'rgba(47,93,63,.55)', fontSize: 18, letterSpacing: '8px' }}>
            ✦ ✦ ✦
          </div>
        </div>
      </div>

      {/* Used phase indirectly to avoid no-unused-vars warning, even if all phases are inline-style controlled */}
      {sidesPhase && centerPhase && headlinePhase && textPhase ? null : null}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────
// MobileSplash — telefonra szabott vertikális kompakt layout (<768px)
//
// A 1920×1080 stage telefonon nem férne ki — itt egyetlen viewport-fit
// vertikális oszlopban renderelődik minden: headline → KARTOTEKA logó
// (oldalsó címerek alatta kicsi formátumban) → meta → loader.
// ──────────────────────────────────────────────────────────────────────

interface MobileSplashProps {
  fading: boolean
  phases: Set<Phase>
  progress: number
}

function MobileSplash({ fading, phases, progress }: MobileSplashProps) {
  const onPhase = useMemo(() => phases.has('s-on'), [phases])
  const sidesPhase = useMemo(() => phases.has('s-sides'), [phases])
  const centerPhase = useMemo(() => phases.has('s-center'), [phases])
  const headlinePhase = useMemo(() => phases.has('s-headline'), [phases])
  const textPhase = useMemo(() => phases.has('s-text'), [phases])

  return (
    <div
      className="fixed inset-0 z-50"
      style={{
        background: '#d8cfba',
        // Rövid képernyőkön (pl. landscape telefon) a tartalom ne vágódjon le:
        // overflow-y auto biztonsági háló, a column minHeight-tal nőhet.
        overflowY: 'auto',
        overflowX: 'hidden',
        fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
        opacity: fading ? 0 : 1,
        transition: 'opacity 700ms ease-in',
      }}
    >
      {/* Background image (cover) */}
      <Image
        src="/Hatter.png"
        alt=""
        fill
        priority
        aria-hidden
        sizes="100vw"
        style={{
          objectFit: 'cover',
          objectPosition: 'center',
          transform: onPhase ? 'scale(1)' : 'scale(1.04)',
          opacity: onPhase ? 1 : 0,
          transition:
            'opacity 1.1s cubic-bezier(.2,.7,.2,1), transform 6s cubic-bezier(.2,.7,.2,1)',
        }}
      />

      {/* Vignette */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background:
            'radial-gradient(ellipse 80% 60% at 50% 50%, rgba(255,246,222,.18) 0%, rgba(255,246,222,0) 60%), radial-gradient(ellipse 110% 90% at 50% 40%, rgba(0,0,0,0) 50%, rgba(38,30,18,.36) 100%)',
          opacity: onPhase ? 1 : 0,
          transition: 'opacity 1.4s ease-out',
        }}
      />

      {/* Por- / fényszemcsék */}
      <div
        aria-hidden
        className="kt-splash-motes-anim"
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          backgroundImage:
            'radial-gradient(circle at 12% 80%, rgba(255,240,210,.45) 0 1.2px, transparent 2px), radial-gradient(circle at 78% 22%, rgba(255,240,210,.35) 0 1px, transparent 2px), radial-gradient(circle at 55% 70%, rgba(255,240,210,.5) 0 1.4px, transparent 2px), radial-gradient(circle at 33% 35%, rgba(255,240,210,.3) 0 1px, transparent 2px), radial-gradient(circle at 88% 65%, rgba(255,240,210,.4) 0 1.1px, transparent 2px)',
          backgroundSize: '700px 500px',
          opacity: onPhase ? 0.9 : 0,
          transition: 'opacity 2s ease-out',
        }}
      />

      {/* Vertical column — minden középen, ScrollContainer-szerű biztonsággal */}
      <div
        style={{
          position: 'relative',
          minHeight: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6vh 6vw 4vh',
          boxSizing: 'border-box',
          gap: 'clamp(12px, 2.5vh, 24px)',
        }}
      >
        {/* Headline ✦ + Békesség Istentől! */}
        <div
          style={{
            textAlign: 'center',
            transform: headlinePhase ? 'translateY(0)' : 'translateY(-10px)',
            opacity: headlinePhase ? 1 : 0,
            filter: headlinePhase ? 'blur(0)' : 'blur(5px)',
            transition:
              'opacity 0.9s cubic-bezier(.2,.7,.2,1) 0.1s, transform 0.9s cubic-bezier(.2,.7,.2,1) 0.1s, filter 0.9s ease-out 0.1s',
          }}
        >
          <div
            style={{
              color: '#b48a3b',
              fontSize: 'clamp(18px, 4vw, 24px)',
              lineHeight: 1,
              marginBottom: 6,
              opacity: 0.9,
              textShadow: '0 1px 0 rgba(255,255,255,.3)',
            }}
          >
            ✦
          </div>
          <h1
            style={{
              fontFamily: '"Cormorant Garamond", "Cormorant", serif',
              fontWeight: 500,
              fontStyle: 'italic',
              fontSize: 'clamp(32px, 9vw, 56px)',
              lineHeight: 1.05,
              letterSpacing: '0.3px',
              color: '#1f2a24',
              margin: '0 0 10px 0',
              textShadow:
                '0 1px 0 rgba(255,255,255,.55), 0 8px 24px rgba(255,235,200,.35)',
            }}
          >
            {HEADLINE}
          </h1>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              color: '#b48a3b',
            }}
          >
            <div
              style={{
                height: 1,
                width: 'clamp(40px, 12vw, 70px)',
                background:
                  'linear-gradient(90deg, transparent, #cda454 35%, #b48a3b 50%, #cda454 65%, transparent)',
              }}
            />
            <div style={{ width: 3, height: 3, borderRadius: '50%', background: '#cda454' }} />
            <div
              style={{
                width: 6,
                height: 6,
                background: '#b48a3b',
                transform: 'rotate(45deg)',
                boxShadow: '0 0 0 2px rgba(180,138,59,.18)',
              }}
            />
            <div style={{ width: 3, height: 3, borderRadius: '50%', background: '#cda454' }} />
            <div
              style={{
                height: 1,
                width: 'clamp(40px, 12vw, 70px)',
                background:
                  'linear-gradient(90deg, transparent, #cda454 35%, #b48a3b 50%, #cda454 65%, transparent)',
              }}
            />
          </div>
        </div>

        {/* Logók — KARTOTEKA középen + 2 kis címer alatta */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 'clamp(10px, 2.5vh, 22px)',
          }}
        >
          {/* Center logo + halo */}
          <div
            style={{
              position: 'relative',
              width: 'clamp(150px, 50vw, 240px)',
              height: 'clamp(150px, 50vw, 240px)',
              display: 'grid',
              placeItems: 'center',
              opacity: centerPhase ? 1 : 0,
              transform: centerPhase ? 'scale(1)' : 'scale(.86)',
              filter: centerPhase ? 'blur(0)' : 'blur(8px)',
              transition:
                'opacity 1.1s cubic-bezier(.2,.7,.2,1), transform 1.1s cubic-bezier(.2,.7,.2,1), filter 1.1s ease-out',
            }}
          >
            <div
              aria-hidden
              style={{
                position: 'absolute',
                inset: -24,
                borderRadius: '50%',
                background:
                  'radial-gradient(circle at 50% 45%, rgba(255,244,210,.85) 0%, rgba(255,238,196,.55) 22%, rgba(255,232,180,.18) 45%, rgba(255,232,180,0) 65%)',
                filter: 'blur(8px)',
                zIndex: 1,
                opacity: centerPhase ? 1 : 0,
                transition: 'opacity 1.2s ease-out',
              }}
            />
            <Image
              src="/KARTOTEKA_V3.png"
              alt="Kartotéka"
              width={460}
              height={460}
              priority
              style={{
                position: 'relative',
                zIndex: 2,
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                filter: 'drop-shadow(0 16px 32px rgba(20,16,8,.28))',
              }}
            />
          </div>

          {/* Side logos row — kicsi formában a center alatt */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 'clamp(20px, 8vw, 40px)',
              opacity: sidesPhase ? 1 : 0,
              transform: sidesPhase ? 'translateY(0)' : 'translateY(8px)',
              transition:
                'opacity 1s cubic-bezier(.2,.7,.2,1), transform 1s cubic-bezier(.2,.7,.2,1)',
            }}
          >
            <div
              style={{
                width: 'clamp(64px, 18vw, 96px)',
                height: 'clamp(64px, 18vw, 96px)',
                display: 'grid',
                placeItems: 'center',
                filter: 'drop-shadow(0 8px 14px rgba(20,16,8,.22))',
              }}
            >
              <Image
                src="/KEREK.png"
                alt="Királyhágómelléki Református Egyházkerület címere"
                width={280}
                height={280}
                priority
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            </div>
            <div
              style={{
                width: 'clamp(40px, 12vw, 64px)',
                height: 'clamp(64px, 18vw, 96px)',
                display: 'grid',
                placeItems: 'center',
                filter: 'drop-shadow(0 8px 14px rgba(20,16,8,.22))',
              }}
            >
              <Image
                src="/EREK.png"
                alt="Erdélyi Református Egyházkerület címere"
                width={175}
                height={280}
                priority
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            </div>
          </div>
        </div>

        {/* Meta + loader (összevonva, hogy ne használjon külön sávot) */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 'clamp(10px, 2vh, 16px)',
            width: '100%',
            opacity: textPhase ? 1 : 0,
            transform: textPhase ? 'translateY(0)' : 'translateY(8px)',
            transition:
              'opacity 0.9s cubic-bezier(.2,.7,.2,1) 0.15s, transform 0.9s cubic-bezier(.2,.7,.2,1) 0.15s',
          }}
        >
          <p
            style={{
              fontFamily: '"Cormorant Garamond", serif',
              fontWeight: 500,
              fontSize: 'clamp(16px, 4.4vw, 22px)',
              letterSpacing: 'clamp(1.5px, 0.5vw, 3px)',
              color: '#2f3d34',
              margin: 0,
              textAlign: 'center',
            }}
          >
            {SUBTITLE}
          </p>
          <div
            style={{
              width: 48,
              height: 1,
              background:
                'linear-gradient(90deg, transparent, rgba(180,138,59,.6), transparent)',
            }}
          />
          <p
            style={{
              fontFamily: '"Inter", sans-serif',
              fontSize: 'clamp(10px, 2.6vw, 12px)',
              fontWeight: 400,
              letterSpacing: 'clamp(2px, 0.8vw, 4px)',
              textTransform: 'uppercase',
              color: '#4a5a4f',
              margin: 0,
              textAlign: 'center',
              maxWidth: '90vw',
            }}
          >
            {TAGLINE}
          </p>

          <div
            style={{
              marginTop: 'clamp(8px, 2vh, 16px)',
              width: 'min(320px, 80vw)',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                fontFamily: '"Cormorant Garamond", serif',
                fontStyle: 'italic',
                fontSize: 'clamp(14px, 3.6vw, 18px)',
                color: '#2f3d34',
                letterSpacing: '1px',
                marginBottom: 8,
              }}
            >
              {LOADER_LABEL}
            </div>
            <div
              style={{
                position: 'relative',
                width: '100%',
                height: 3,
                background: 'rgba(47,93,63,.18)',
                borderRadius: 999,
                overflow: 'hidden',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,.35)',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: `${progress}%`,
                  background: 'linear-gradient(90deg, #2f5d3f, #4f8e63, #e6c98a)',
                  borderRadius: 999,
                  boxShadow: '0 0 12px rgba(79,142,99,.6)',
                  transition: 'width 0.15s linear',
                }}
              />
            </div>
            <div
              style={{
                marginTop: 8,
                color: 'rgba(47,93,63,.55)',
                fontSize: 'clamp(12px, 3vw, 14px)',
                letterSpacing: 'clamp(4px, 1.5vw, 6px)',
              }}
            >
              ✦ ✦ ✦
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
