'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, Info, Lock, RefreshCw, ShieldAlert } from 'lucide-react'

import type { LicenseStatus } from '@/lib/standalone/license-types'

/**
 * License Banner — a fejléc ALATT megjelenő fokozatos figyelmeztetés.
 *
 * Szintek:
 *   - normal/reminder: nincs banner (elrejtve)
 *   - warning (30-35 nap):   sárga banner
 *   - degraded (35-45 nap):  narancs banner
 *   - read_only (45-60 nap): piros banner
 *   - blocked (60+ nap):     teljes-oldalas lightbox
 *
 * A state-et egy `/api/standalone/license-status` endpoint szolgáltatja
 * (polling 60s-enként, vagy app-indításkor).
 */

interface LicenseInfo {
  status: LicenseStatus
  daysSinceLastSync: number
  daysRemaining: number
  lastSyncISO: string | null
}

export function LicenseBanner() {
  const [info, setInfo] = useState<LicenseInfo | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    let cancelled = false
    let timerId: number | null = null
    let inFlightController: AbortController | null = null

    const fetchStatus = async () => {
      // Ha az előző fetch még fut (lassú hálózat), abortáljuk — ne halmozódjon
      // fel orphan request a háttérben.
      if (inFlightController) inFlightController.abort()
      inFlightController = new AbortController()
      const myController = inFlightController
      // 10s timeout — a license-status endpoint lokálisan vizsgálja a JWT-t,
      // szóval normál esetben azonnali. Ha 10s alatt nem válaszol, valami baj van.
      const timeoutId = setTimeout(() => myController.abort(), 10_000)

      try {
        const resp = await fetch('/api/standalone/license-status', {
          cache: 'no-store',
          signal: myController.signal,
        })
        if (cancelled) return
        if (!resp.ok) return
        const data = await resp.json()
        if (!cancelled && data.status) {
          setInfo(data)
        }
      } catch {
        // silent fail — server mode-ban ez 404, abort esetén AbortError, nem releváns
      } finally {
        clearTimeout(timeoutId)
        if (inFlightController === myController) {
          inFlightController = null
        }
      }
    }

    fetchStatus()
    // Polling 5 percenként
    timerId = window.setInterval(fetchStatus, 5 * 60 * 1000)

    return () => {
      cancelled = true
      if (inFlightController) inFlightController.abort()
      if (timerId !== null) clearInterval(timerId)
    }
  }, [])

  if (!info) return null

  const { status, daysSinceLastSync, daysRemaining } = info

  // Normál vagy emlékeztető → nincs banner
  if (status === 'normal' || status === 'reminder') return null

  // Blocked → full page lightbox (külön komponens)
  if (status === 'blocked') return <BlockedLightbox info={info} />

  // Dismissed warning (feliratkozás után 4 órára elrejtve)
  if (dismissed && status === 'warning') return null

  const config = getBannerConfig(status, daysSinceLastSync, daysRemaining)

  return (
    <div
      className={`relative border-b ${config.borderClass} ${config.bgClass} px-4 py-3 text-sm ${config.textClass}`}
      role="alert"
    >
      <div className="mx-auto flex max-w-7xl flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <config.Icon className="mt-0.5 size-5 shrink-0" />
          <div>
            <p className="font-semibold">{config.title}</p>
            <p className="mt-0.5 text-xs leading-relaxed opacity-90">
              {config.message}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 pl-8 sm:pl-0">
          <Link
            href="/offline"
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ${config.buttonClass}`}
          >
            <RefreshCw className="size-3.5" />
            Szinkronizálás most
          </Link>
          {status === 'warning' && (
            <button
              type="button"
              onClick={() => setDismissed(true)}
              className="rounded-lg p-1.5 opacity-60 hover:opacity-100"
              aria-label="Elrejtés"
            >
              ✕
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Banner konfiguráció státusz szerint
// ─────────────────────────────────────────────────────────────────

function getBannerConfig(
  status: LicenseStatus,
  daysSinceLastSync: number,
  daysRemaining: number,
): {
  Icon: typeof AlertTriangle
  title: string
  message: string
  bgClass: string
  borderClass: string
  textClass: string
  buttonClass: string
} {
  switch (status) {
    case 'warning':
      return {
        Icon: AlertTriangle,
        title: `⚠️  ${daysSinceLastSync} napja nem szinkronizált`,
        message: `A rendszer havi sync-et vár. ${Math.max(5 - (daysSinceLastSync - 30), 0)} nap múlva az Excel export le lesz tiltva. Kattints a Szinkronizálás gombra, amikor internet van.`,
        bgClass: 'bg-amber-50',
        borderClass: 'border-amber-200',
        textClass: 'text-amber-900',
        buttonClass: 'bg-amber-600 text-white hover:bg-amber-700',
      }
    case 'degraded':
      return {
        Icon: ShieldAlert,
        title: `🚨  ${daysSinceLastSync} napja nem szinkronizált — DEGRADÁLT MÓD`,
        message: `Excel export és ZIP backup LETILTVA. Új bejegyzések még működnek. ${Math.max(10 - (daysSinceLastSync - 35), 0)} nap múlva READ-ONLY módba vált. Szinkronizálj most!`,
        bgClass: 'bg-orange-50',
        borderClass: 'border-orange-300',
        textClass: 'text-orange-900',
        buttonClass: 'bg-orange-600 text-white hover:bg-orange-700',
      }
    case 'read_only':
      return {
        Icon: Lock,
        title: `🔒  ${daysSinceLastSync} napja nem szinkronizált — CSAK OLVASHATÓ`,
        message: `Az írási műveletek LE VANNAK TILTVA. Minden rekordot olvashatsz, de nem módosíthatsz. ${Math.max(60 - daysSinceLastSync, 0)} nap múlva a rendszer teljesen leáll.`,
        bgClass: 'bg-red-50',
        borderClass: 'border-red-300',
        textClass: 'text-red-900',
        buttonClass: 'bg-red-600 text-white hover:bg-red-700',
      }
    case 'invalid':
      return {
        Icon: ShieldAlert,
        title: `Érvénytelen licensz`,
        message: `A licensz-fájl sérült vagy más gépre lett kiállítva. Új regisztráció szükséges.`,
        bgClass: 'bg-red-50',
        borderClass: 'border-red-300',
        textClass: 'text-red-900',
        buttonClass: 'bg-red-600 text-white hover:bg-red-700',
      }
    default:
      return {
        Icon: Info,
        title: 'Állapot-frissítés szükséges',
        message: `A licensz állapota: ${status}. ${daysRemaining} nap maradt.`,
        bgClass: 'bg-slate-50',
        borderClass: 'border-slate-200',
        textClass: 'text-slate-900',
        buttonClass: 'bg-slate-700 text-white hover:bg-slate-800',
      }
  }
}

// ─────────────────────────────────────────────────────────────────
// Blocked lightbox — teljes oldal, nincs X gomb
// ─────────────────────────────────────────────────────────────────

function BlockedLightbox({ info }: { info: LicenseInfo }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl bg-white p-8 shadow-2xl md:p-12">
        <div className="flex flex-col items-center text-center">
          <div className="mb-6 flex size-20 items-center justify-center rounded-full bg-red-100">
            <Lock className="size-10 text-red-600" />
          </div>

          <h2 className="font-heading text-3xl text-slate-800">
            Szinkronizálás szükséges
          </h2>

          <p className="mt-2 text-lg text-slate-600">
            {info.daysSinceLastSync} napja nem szinkronizált
          </p>

          <p className="mt-6 max-w-md text-sm leading-relaxed text-slate-700">
            A KARTOTEKA havonta egyszer csatlakozik a felhőhöz, hogy biztonságos
            legyen az adatállomány. Ez idő letelt, és a rendszer nem engedi
            folytatni a munkát, amíg nem történik szinkronizálás.
          </p>

          <div className="mt-6 rounded-xl border border-blue-200 bg-blue-50/60 p-4 text-left text-sm text-blue-900">
            <p className="font-semibold">Amit tenned kell:</p>
            <ol className="mt-2 list-inside list-decimal space-y-1 text-xs">
              <li>Csatlakozz internethez (WiFi vagy mobil hotspot)</li>
              <li>Kattints a &quot;Szinkronizálás indítása&quot; gombra</li>
              <li>Várj, amíg a sync lefut (kb. 1-3 perc)</li>
              <li>Az adataid biztonságban vannak, visszakapsz mindent</li>
            </ol>
          </div>

          <Link
            href="/offline"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-lg hover:bg-primary/90"
          >
            <RefreshCw className="size-4" />
            Szinkronizálás indítása
          </Link>

          <p className="mt-6 text-xs text-slate-500">
            Probléma esetén:{' '}
            <a
              href="mailto:support@kartoteka.erek.ro"
              className="text-primary underline hover:no-underline"
            >
              support@kartoteka.erek.ro
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}
