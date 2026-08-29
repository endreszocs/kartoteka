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

  // 2026-08-29 (Endre: „a gondolkodást jelző sáv jobban látszódjon"): a csík
  // 3px → 5px, erősebb sín és fénylő futófej; PLUSZ egy kis „Dolgozom…" pirula
  // felül KÖZÉPEN — a csík a perifériának, a pirula annak, aki a képernyő
  // közepét nézi. Mindkettő pointer-events: none, semmit nem takar.
  return (
    <div
      role="progressbar"
      aria-label="Adatok betöltése folyamatban"
      aria-busy="true"
      style={{ position: 'fixed', inset: 0, zIndex: 9999, pointerEvents: 'none' }}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 5,
          overflow: 'hidden',
          // Erősebb sín, hogy világos fejléceken is azonnal szembetűnjön.
          background: 'rgba(107, 142, 78, 0.28)',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            width: '35%',
            borderRadius: 3,
            // Az élő paletta olívazöld accentje (elo_paletta_kert_tema) —
            // telített maggal és fénylő szélekkel.
            background: 'linear-gradient(90deg, transparent, #5a7c3e, #6b8e4e, #5a7c3e, transparent)',
            boxShadow: '0 0 10px rgba(107, 142, 78, 0.75)',
            animation: 'kartoteka-pending-slide 1.1s ease-in-out infinite',
          }}
        />
      </div>
      {/* Felül-KÖZÉPEN: a jobb felső sarok a fejléc ikonsorát takarná (a régi
          sync-pirula pont emiatt szűnt meg 2026-08-11-én), a bal a gyülekezet-
          választót. Középen mindkét felületen szabad a hely. */}
      <div
        style={{
          position: 'absolute',
          top: 10,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 7,
          padding: '5px 12px',
          borderRadius: 9999,
          background: 'rgba(43, 58, 31, 0.92)',
          color: '#f2f6ec',
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: '0.02em',
          boxShadow: '0 4px 14px rgba(0, 0, 0, 0.25)',
          animation: 'kartoteka-pending-pillin 0.25s ease-out',
        }}
      >
        <span
          aria-hidden
          style={{
            width: 12,
            height: 12,
            borderRadius: '50%',
            border: '2px solid rgba(242, 246, 236, 0.35)',
            borderTopColor: '#f2f6ec',
            animation: 'kartoteka-pending-spin 0.8s linear infinite',
          }}
        />
        Dolgozom…
      </div>
      <style>{`
        @keyframes kartoteka-pending-slide {
          0% { left: -35%; }
          100% { left: 100%; }
        }
        @keyframes kartoteka-pending-spin {
          to { transform: rotate(360deg); }
        }
        @keyframes kartoteka-pending-pillin {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          [role='progressbar'][aria-label='Adatok betöltése folyamatban'] * {
            animation: none !important;
          }
          [role='progressbar'][aria-label='Adatok betöltése folyamatban'] > div:first-child > div {
            left: 0 !important;
            width: 100% !important;
            background: #6b8e4e !important;
            opacity: 0.6;
          }
        }
      `}</style>
    </div>
  )
}
