'use client'

import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Fingerprint,
  Info,
  Lock,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react'

import type { LicenseStatus } from '@/lib/standalone/license-types'

interface LicenseStatusData {
  applicable: boolean
  valid?: boolean
  status: LicenseStatus
  daysSinceLastSync: number
  daysRemaining: number
  lastSyncISO: string | null
  fingerprintMatch?: boolean
  reason?: string
}

/**
 * License Status Card — az `/offline` oldalra tehető.
 * Mutatja:
 *   - Aktuális állapotot (Aktív/Warning/Degraded/ReadOnly/Blocked)
 *   - Utolsó sync időpontját
 *   - Licensz lejáratáig hátralévő napokat
 *   - Gyülekezetet, lelkészt (ha a JWT tartalmazza)
 *   - Havi sync progress bar (0 / 60 nap)
 */
export function LicenseStatusCard() {
  const [data, setData] = useState<LicenseStatusData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()
    // 10s timeout — a license-status endpoint lokális JWT-vizsgálatot csinál,
    // azonnali kell legyen. Ha 10s alatt nem válaszol, baj van.
    const timeoutId = setTimeout(() => controller.abort(), 10_000)

    const fetchStatus = async () => {
      try {
        const resp = await fetch('/api/standalone/license-status', {
          cache: 'no-store',
          signal: controller.signal,
        })
        if (cancelled) return
        if (!resp.ok) {
          setLoading(false)
          return
        }
        const result = await resp.json()
        if (!cancelled) setData(result)
      } catch (e) {
        // AbortError esetén csendes — komponens unmount-olt vagy timeout
        if (cancelled) return
        if (e instanceof Error && e.name !== 'AbortError') {
          console.error('[license-status fetch]', e)
        }
      } finally {
        clearTimeout(timeoutId)
        if (!cancelled) setLoading(false)
      }
    }
    fetchStatus()

    return () => {
      cancelled = true
      controller.abort()
      clearTimeout(timeoutId)
    }
  }, [])

  if (loading) {
    return (
      <div className="card-raised p-5">
        <div className="flex items-center gap-2 text-sm italic text-slate-400">
          <RefreshCw className="size-4 animate-spin" />
          Licensz-állapot betöltése…
        </div>
      </div>
    )
  }

  if (!data || !data.applicable) {
    return null // server mode — ne mutassuk
  }

  const { status, daysSinceLastSync, lastSyncISO } = data

  const statusConfig = getStatusConfig(status)

  // Sync progress 0-60 nap
  const syncProgressPercent = Math.min(
    100,
    Math.max(0, (daysSinceLastSync / 60) * 100),
  )

  return (
    <div className="card-raised overflow-hidden">
      <div className={`flex items-center gap-2 border-b px-5 py-3 ${statusConfig.headerClass}`}>
        <statusConfig.Icon className="size-5" />
        <h3 className="font-heading text-lg">Licensz-állapot</h3>
        <span
          className={`ml-auto rounded-full px-3 py-0.5 text-xs font-semibold ${statusConfig.badgeClass}`}
        >
          {statusConfig.label}
        </span>
      </div>

      <div className="space-y-5 px-5 py-5">
        {/* Állapot summary */}
        <div className="grid gap-4 sm:grid-cols-3">
          <StatusField
            icon={Clock}
            label="Utolsó szinkronizáció"
            value={
              lastSyncISO
                ? new Date(lastSyncISO).toLocaleString('hu-HU', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })
                : '—'
            }
            hint={`${daysSinceLastSync} napja`}
          />
          <StatusField
            icon={Info}
            label="Következő szinkronizáció"
            value={`Max. ${Math.max(60 - daysSinceLastSync, 0)} nap múlva`}
            hint="A rendszer leáll ennyi után"
          />
          <StatusField
            icon={Fingerprint}
            label="Gép-azonosító egyezés"
            value={data.fingerprintMatch === false ? '❌ Nincs' : '✓ OK'}
            hint={data.fingerprintMatch === false ? 'Másik gépről' : 'Ezen a gépen'}
          />
        </div>

        {/* Havi sync progress */}
        <div>
          <div className="mb-1 flex items-baseline justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Havi szinkron-ablak
            </p>
            <p className="text-xs text-slate-600">
              <span className="font-semibold">{daysSinceLastSync}</span> / 60 nap
            </p>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full transition-all ${statusConfig.progressClass}`}
              style={{ width: `${syncProgressPercent}%` }}
            />
          </div>
          <div className="mt-1.5 flex justify-between text-[10px] text-slate-400">
            <span>0</span>
            <span>30</span>
            <span>45</span>
            <span>60</span>
          </div>
        </div>

        {/* Info részletek */}
        {data.reason && (
          <div className="rounded-lg border border-red-100 bg-red-50/60 p-3 text-xs text-red-900">
            <AlertTriangle className="mr-1 inline size-3.5" />
            {data.reason}
          </div>
        )}

        {/* Szinkron gomb — scrollol a Monthly Sync Panelig (Fázis 7d) */}
        <button
          type="button"
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
          onClick={() => {
            const target =
              typeof document !== 'undefined'
                ? document.getElementById('monthly-sync-panel')
                : null
            if (target) {
              target.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }
          }}
        >
          <RefreshCw className="size-4" />
          Tovább a havi szinkronhoz
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

function StatusField({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Clock
  label: string
  value: string
  hint?: string
}) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
      <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        <Icon className="size-3" />
        {label}
      </div>
      <p className="font-semibold text-slate-800">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
    </div>
  )
}

function getStatusConfig(status: LicenseStatus): {
  Icon: typeof ShieldCheck
  label: string
  headerClass: string
  badgeClass: string
  progressClass: string
} {
  switch (status) {
    case 'normal':
    case 'reminder':
      return {
        Icon: ShieldCheck,
        label: 'Aktív',
        headerClass: 'border-emerald-100 bg-emerald-50/40 text-emerald-800',
        badgeClass: 'bg-emerald-100 text-emerald-700',
        progressClass: 'bg-emerald-500',
      }
    case 'warning':
      return {
        Icon: AlertTriangle,
        label: 'Figyelmeztetés',
        headerClass: 'border-amber-100 bg-amber-50/40 text-amber-800',
        badgeClass: 'bg-amber-100 text-amber-700',
        progressClass: 'bg-amber-500',
      }
    case 'degraded':
      return {
        Icon: AlertTriangle,
        label: 'Degradált',
        headerClass: 'border-orange-100 bg-orange-50/40 text-orange-800',
        badgeClass: 'bg-orange-100 text-orange-700',
        progressClass: 'bg-orange-500',
      }
    case 'read_only':
      return {
        Icon: Lock,
        label: 'Csak olvasható',
        headerClass: 'border-red-100 bg-red-50/40 text-red-800',
        badgeClass: 'bg-red-100 text-red-700',
        progressClass: 'bg-red-500',
      }
    case 'blocked':
      return {
        Icon: Lock,
        label: 'Letiltva',
        headerClass: 'border-red-200 bg-red-100/60 text-red-900',
        badgeClass: 'bg-red-200 text-red-900',
        progressClass: 'bg-red-600',
      }
    case 'invalid':
      return {
        Icon: AlertTriangle,
        label: 'Érvénytelen',
        headerClass: 'border-red-100 bg-red-50/40 text-red-800',
        badgeClass: 'bg-red-100 text-red-700',
        progressClass: 'bg-red-500',
      }
    case 'missing':
      return {
        Icon: AlertTriangle,
        label: 'Hiányzik',
        headerClass: 'border-slate-100 bg-slate-50/40 text-slate-700',
        badgeClass: 'bg-slate-100 text-slate-700',
        progressClass: 'bg-slate-400',
      }
    default:
      return {
        Icon: CheckCircle2,
        label: '—',
        headerClass: 'border-slate-100 bg-slate-50/40 text-slate-700',
        badgeClass: 'bg-slate-100 text-slate-700',
        progressClass: 'bg-slate-400',
      }
  }
}
