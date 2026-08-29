'use client'

/**
 * Globális folyamatjelző (2026-08-29, Endre kérése: „legyen valami kis
 * gondolkodó jel, hogy tudja a felhasználó, hogy várnia kell").
 *
 * ⚠️ A 'use client' KÖTELEZŐ az 1. sorban: a ui-app barrel-jét szerver-
 * komponensek is importálják (pl. notifications/page.tsx), és a direktíva
 * nélküli hook-használat a `next build`-et buktatja — a CI ezt NEM fogja meg
 * (ott csak lint+típusok+önellenőrzések futnak), a hiba a DEPLOY-nál robban
 * (2026-08-29-i éles deploy-bukás tanulsága).
 *
 * MŰKÖDÉS: a `window.fetch`-et EGYSZER becsomagoljuk, és számoljuk a folyamatban
 * lévő hálózati hívásokat. Amíg legalább egy fut — és már legalább `delayMs`
 * ideje (a villódzás ellen) —, a képernyő tetején vékony, futó fénycsík
 * jelzi, hogy a rendszer dolgozik. Ez MINDEN adatbetöltést lefed (server
 * actionök, Supabase-hívások, keresők, mentések), külön bekötés nélkül.
 *
 * - A csík `pointer-events: none` — semmit nem takar, nem kattintható.
 * - Az eltűnés is késleltetett (150 ms), hogy a láncolt hívások közti rés
 *   ne villogtassa.
 * - A patch idempotens (`__kartotekaFetchFigyelo` őr) — StrictMode dupla
 *   mount és több példány esetén is egyszer csomagol.
 *
 * Web: a (dashboard) layout mountolja ('use client' wrapperen át).
 * Desktop: a shell mountolja közvetlenül.
 */

import { useEffect, useState } from 'react'

type FetchFigyelo = {
  aktiv: number
  listeners: Set<(aktiv: number) => void>
}

declare global {
  interface Window {
    __kartotekaFetchFigyelo?: FetchFigyelo
  }
}

function ensureFetchFigyelo(): FetchFigyelo | null {
  if (typeof window === 'undefined') return null
  if (window.__kartotekaFetchFigyelo) return window.__kartotekaFetchFigyelo

  const figyelo: FetchFigyelo = { aktiv: 0, listeners: new Set() }
  window.__kartotekaFetchFigyelo = figyelo

  const jelez = () => {
    for (const l of figyelo.listeners) {
      try {
        l(figyelo.aktiv)
      } catch {
        /* a jelzés hibája nem akadhat a hálózati hívásba */
      }
    }
  }

  const eredeti = window.fetch.bind(window)
  window.fetch = ((...args: Parameters<typeof fetch>) => {
    figyelo.aktiv += 1
    jelez()
    let vege = false
    const kesz = () => {
      if (vege) return
      vege = true
      figyelo.aktiv = Math.max(0, figyelo.aktiv - 1)
      jelez()
    }
    try {
      const p = eredeti(...args)
      p.then(kesz, kesz)
      return p
    } catch (err) {
      kesz()
      throw err
    }
  }) as typeof fetch

  return figyelo
}

export function GlobalPendingIndicator({
  delayMs = 400,
}: {
  /** Ennyi FOLYAMATOS hálózati munka után jelenik meg a csík (villódzás ellen). */
  delayMs?: number
}) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const figyelo = ensureFetchFigyelo()
    if (!figyelo) return

    let showTimer: ReturnType<typeof setTimeout> | null = null
    let hideTimer: ReturnType<typeof setTimeout> | null = null

    const onChange = (aktiv: number) => {
      if (aktiv > 0) {
        if (hideTimer) {
          clearTimeout(hideTimer)
          hideTimer = null
        }
        if (!showTimer) {
          showTimer = setTimeout(() => {
            showTimer = null
            setVisible(true)
          }, delayMs)
        }
      } else {
        if (showTimer) {
          clearTimeout(showTimer)
          showTimer = null
        }
        if (!hideTimer) {
          hideTimer = setTimeout(() => {
            hideTimer = null
            setVisible(false)
          }, 150)
        }
      }
    }

    figyelo.listeners.add(onChange)
    onChange(figyelo.aktiv)
    return () => {
      figyelo.listeners.delete(onChange)
      if (showTimer) clearTimeout(showTimer)
      if (hideTimer) clearTimeout(hideTimer)
    }
  }, [delayMs])

  if (!visible) return null

  return (
    <div
      role="progressbar"
      aria-label="Adatok betöltése folyamatban"
      aria-busy="true"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: 3,
        zIndex: 9999,
        pointerEvents: 'none',
        overflow: 'hidden',
        // Halvány sín, hogy a csík mozgása jól látsszon világos fejléceken is.
        background: 'rgba(107, 142, 78, 0.15)',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          width: '35%',
          borderRadius: 2,
          // Az élő paletta olívazöld accentje (elo_paletta_kert_tema).
          background: 'linear-gradient(90deg, transparent, #6b8e4e, transparent)',
          animation: 'kartoteka-pending-slide 1.1s ease-in-out infinite',
        }}
      />
      <style>{`
        @keyframes kartoteka-pending-slide {
          0% { left: -35%; }
          100% { left: 100%; }
        }
        @media (prefers-reduced-motion: reduce) {
          [role='progressbar'][aria-label='Adatok betöltése folyamatban'] > div {
            animation: none !important;
            left: 0 !important;
            width: 100% !important;
            background: #6b8e4e !important;
            opacity: 0.55;
          }
        }
      `}</style>
    </div>
  )
}
