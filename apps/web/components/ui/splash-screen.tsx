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

function useStageScale() {
  // A stage `Math.max(sx, sy)`-szerinti scale-je biztosítja, hogy a háttér
  // és tartalom teljesen kitöltse az ablakot. Az overflow:hidden levágja a
  // túllógó részeket, és a középre-állított elrendezés (translate -50%,-50%)
  // gondoskodik róla, hogy a 3 logó és a headline/footer mindig láthatók
  // legyenek viewport-méret-tartományban.
  const [scale, setScale] = useState(1)
  useEffect(() => {
    function onResize() {
      const sx = window.innerWidth / 1920
      const sy = window.innerHeight / 1080
      setScale(Math.max(sx, sy))
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

  const onPhase = useMemo(() => phases.has('s-on'), [phases])
  const sidesPhase = useMemo(() => phases.has('s-sides'), [phases])
  const centerPhase = useMemo(() => phases.has('s-center'), [phases])
  const headlinePhase = useMemo(() => phases.has('s-headline'), [phases])
  const textPhase = useMemo(() => phases.has('s-text'), [phases])

  if (!visible) return null

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
          transform: `scale(${scale})`,
          transformOrigin: 'center center',
          overflow: 'hidden',
          background: '#d8cfba',
          boxShadow: '0 30px 120px rgba(0,0,0,0.6)',
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

          {/* Side right — EREK (a natural arány miatt 85%-osra skálázva,
              hogy a KEREK-tel optikailag egyforma méretű legyen). */}
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
              width={238}
              height={238}
              priority
              style={{ width: 238, height: 238, objectFit: 'contain' }}
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
            ҂ ҂ ҂
          </div>
        </div>
      </div>

      {/* Used phase indirectly to avoid no-unused-vars warning, even if all phases are inline-style controlled */}
      {sidesPhase && centerPhase && headlinePhase && textPhase ? null : null}
    </div>
  )
}
