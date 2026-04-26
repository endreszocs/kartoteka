'use client'

/**
 * Oblio ellenőrzés — mappa-állapot kártya
 * (Sprint Q F2.2, v0.7.8, 2026-04-26).
 *
 * A Pénzügy → "Oblio ellenőrzés" fül tetején jelenik meg. Mutatja:
 *   - A KARTOTEKA helyi mappa beállítva-e (és ha igen, a mappa nevét)
 *   - Az `oblio-ellenorzes/<év>/befogadott/` almappa elérhetőségét
 *   - Az utolsó letöltés időpontját és az ANAF 60 napos visszaszámlálást
 *   - „Frissítés" gomb — scan + ZIP kibontás + parse + match-elés
 *
 * Pure UI: csak react + lucide-react + ./folder-types. Toast callback-prop-on
 * (sonner helyett). Button-ok natív elemekre cserélve.
 */

import {
  AlertTriangle,
  Calendar,
  Check,
  CheckCircle2,
  Copy,
  FolderCog,
  FolderOpen,
  RefreshCw,
  RotateCw,
  ShieldAlert,
} from 'lucide-react'
import { useState } from 'react'

import type { OblioFolderStatus } from './folder-types'

export type OblioFolderCardToastKind = 'success' | 'error' | 'info' | 'warning'

export interface OblioEllenorzesFolderCardProps {
  status: OblioFolderStatus
  utolsoLetoltes: string | null
  fileCount: number
  isRefreshing: boolean
  onRefresh: () => void
  onOpenSettings: () => void
  onReprocessArchive?: () => void
  isReprocessing?: boolean
  /** A gyülekezet slug-ja — az állandó útvonal kijelzéséhez. */
  congregationSlug: string
  /** UI-feedback (sonner / Tauri toast / iOS native banner). */
  onToast?: (msg: string, kind: OblioFolderCardToastKind) => void
}

function formatDateHu(iso: string | null): string {
  if (!iso) return 'soha'
  return new Date(iso).toLocaleString('hu-HU', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null
  const ms = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(ms) || ms < 0) return null
  return Math.floor(ms / 86_400_000)
}

export function OblioEllenorzesFolderCard({
  status,
  utolsoLetoltes,
  fileCount,
  isRefreshing,
  onRefresh,
  onOpenSettings,
  onReprocessArchive,
  isReprocessing,
  congregationSlug,
  onToast,
}: OblioEllenorzesFolderCardProps) {
  const days = daysSince(utolsoLetoltes)
  const remaining = days === null ? null : Math.max(0, 60 - days)
  const deadlineSeverity: 'ok' | 'warning' | 'critical' | 'expired' =
    remaining === null
      ? 'warning'
      : remaining <= 0
        ? 'expired'
        : remaining <= 5
          ? 'critical'
          : remaining <= 10
            ? 'warning'
            : 'ok'

  // ─── Nem támogatott böngésző ───
  if (!status.supported) {
    return (
      <div className="card-raised border border-amber-200 bg-amber-50/40 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
            <AlertTriangle className="size-5" />
          </span>
          <div className="space-y-1">
            <p className="font-semibold text-slate-800">Nem támogatott böngésző</p>
            <p className="text-sm leading-6 text-slate-600">
              Az Oblio ellenőrzéshez File System Access API kell, ami csak Chromium-alapú
              böngészőkben működik (Chrome, Edge, Brave). Firefox / Safari esetén nyiss
              meg egy Chrome-ot, és ott jelentkezz be újra a KARTOTEKA-ba.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // ─── Nincs root mappa ───
  if (!status.hasRoot) {
    return (
      <div className="card-raised border border-cyan-200 bg-cyan-50/40 p-5 sm:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-2xl bg-cyan-100 text-cyan-700">
              <FolderCog className="size-5" />
            </span>
            <div className="space-y-1">
              <p className="font-semibold text-slate-800">
                Helyi KARTOTEKA mappa beállítása szükséges
              </p>
              <p className="text-sm leading-6 text-slate-600">
                Az Oblio ellenőrzéshez a beérkezett számla XML-ek a saját számítógépeden tárolódnak.
                Először állítsd be a KARTOTEKA helyi mappát az Offline beállítások menüben.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onOpenSettings}
            className="inline-flex items-center justify-center whitespace-nowrap h-10 px-4 py-2 text-sm font-medium rounded-xl bg-cyan-600 text-white hover:bg-cyan-700 transition-colors disabled:opacity-50 shadow-sm"
          >
            Mappa beállítása
          </button>
        </div>
      </div>
    )
  }

  // ─── Nincs permission ───
  if (!status.hasPermission) {
    return (
      <div className="card-raised border border-amber-200 bg-amber-50/40 p-5 sm:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
              <ShieldAlert className="size-5" />
            </span>
            <div className="space-y-1">
              <p className="font-semibold text-slate-800">Mappa hozzáférés szükséges</p>
              <p className="text-sm leading-6 text-slate-600">
                A KARTOTEKA mappa <strong>{status.rootName}</strong> elérése engedélyt igényel.
                Kattints a &bdquo;Frissítés&rdquo; gombra — a böngésző egyszer rákérdez.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="inline-flex items-center justify-center whitespace-nowrap h-10 px-4 py-2 text-sm font-medium rounded-xl bg-amber-600 text-white hover:bg-amber-700 transition-colors disabled:pointer-events-none disabled:opacity-50 shadow-sm"
          >
            <RefreshCw className={`mr-1.5 size-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            Engedélyezés és frissítés
          </button>
        </div>
      </div>
    )
  }

  // ─── Üzemkész állapot ───
  const fullPath = `${status.rootName} / KARTOTEKA / ${congregationSlug} / oblio-ellenorzes / befogadott /`
  return (
    <div className="card-raised border border-cyan-200 bg-gradient-to-br from-white via-white to-cyan-50/40 p-5 sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        {/* Bal oldal: mappa info */}
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 to-teal-600 text-white shadow-sm">
            <FolderOpen className="size-6" />
          </span>
          <div className="min-w-0 space-y-2 w-full">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-slate-800">Ide töltsd a ZIP-et</p>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-700 px-2 py-0.5 text-[10px] font-semibold">
                <CheckCircle2 className="size-3" /> Állandó mappa
              </span>
            </div>
            <PathDisplay path={fullPath} onToast={onToast} />
            <p className="text-xs text-slate-500">
              <strong>{fileCount}</strong> fájl a mappában
              {' · '}Utolsó letöltés: <strong>{formatDateHu(utolsoLetoltes)}</strong>
            </p>
          </div>
        </div>

        {/* Jobb oldal: határidő + akciók */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center shrink-0">
          <DeadlineCard severity={deadlineSeverity} remaining={remaining} days={days} />
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={onRefresh}
              disabled={isRefreshing || isReprocessing}
              className="inline-flex items-center justify-center whitespace-nowrap h-10 px-4 py-2 text-sm font-medium rounded-xl bg-cyan-600 text-white hover:bg-cyan-700 transition-colors disabled:pointer-events-none disabled:opacity-50 shadow-sm"
            >
              <RefreshCw className={`mr-1.5 size-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              {isRefreshing ? 'Frissítés…' : 'Frissítés a mappából'}
            </button>
            {onReprocessArchive && (
              <button
                type="button"
                onClick={onReprocessArchive}
                disabled={isReprocessing || isRefreshing}
                title="Visszamásolja az archív ZIP-eket és újra-feldolgozza őket az új párosító logikával. Akkor használd, ha a PDF-ek nem jelennek meg."
                className="inline-flex items-center justify-center whitespace-nowrap h-9 px-3 text-sm font-medium border bg-white transition-colors disabled:pointer-events-none disabled:opacity-50 rounded-xl border-amber-300 text-amber-800 hover:bg-amber-50"
              >
                <RotateCw className={`mr-1.5 size-3.5 ${isReprocessing ? 'animate-spin' : ''}`} />
                {isReprocessing ? 'Újra-feldolgozás…' : 'Újra-feldolgozás archívumból'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/** A mappa-útvonal megjelenítés + másolás gomb. */
function PathDisplay({
  path,
  onToast,
}: {
  path: string
  onToast?: (msg: string, kind: OblioFolderCardToastKind) => void
}) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      if (typeof navigator === 'undefined' || !navigator.clipboard) {
        onToast?.('A másolás nem támogatott ezen a felületen.', 'error')
        return
      }
      await navigator.clipboard.writeText(path)
      setCopied(true)
      onToast?.('Útvonal a vágólapra másolva.', 'success')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      onToast?.('A másolás nem sikerült — másold ki kézzel.', 'error')
    }
  }

  return (
    <div className="flex items-center gap-2 rounded-xl bg-white border border-cyan-100 px-3 py-2">
      <code className="font-mono text-xs text-cyan-900 break-all flex-1 min-w-0">{path}</code>
      <button
        type="button"
        onClick={handleCopy}
        title="Útvonal másolása"
        className="shrink-0 inline-flex size-7 items-center justify-center rounded-lg text-cyan-700 hover:bg-cyan-100 transition-colors"
      >
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
      </button>
    </div>
  )
}

function DeadlineCard({
  severity,
  remaining,
  days,
}: {
  severity: 'ok' | 'warning' | 'critical' | 'expired'
  remaining: number | null
  days: number | null
}) {
  const palettes = {
    ok: {
      bg: 'bg-emerald-50',
      border: 'border-emerald-200',
      text: 'text-emerald-700',
      icon: 'text-emerald-600',
    },
    warning: {
      bg: 'bg-amber-50',
      border: 'border-amber-200',
      text: 'text-amber-800',
      icon: 'text-amber-600',
    },
    critical: {
      bg: 'bg-orange-50',
      border: 'border-orange-200',
      text: 'text-orange-800',
      icon: 'text-orange-600',
    },
    expired: {
      bg: 'bg-red-50',
      border: 'border-red-200',
      text: 'text-red-800',
      icon: 'text-red-600',
    },
  }
  const p = palettes[severity]

  let label = '60 nap van hátra'
  if (remaining !== null) {
    if (remaining <= 0) label = 'ANAF határidő LEJÁRT'
    else if (remaining === 1) label = '1 nap van hátra'
    else label = `${remaining} nap van hátra`
  } else {
    label = 'Még nem volt letöltés'
  }

  return (
    <div className={`rounded-2xl border ${p.border} ${p.bg} px-4 py-2.5`}>
      <div className="flex items-center gap-2">
        <Calendar className={`size-4 ${p.icon}`} />
        <div className="text-xs">
          <p className={`font-semibold ${p.text}`}>{label}</p>
          <p className="text-slate-500">
            ANAF SPV {days !== null ? `(${days} napja)` : '— még nem volt letöltés'}
          </p>
        </div>
      </div>
    </div>
  )
}
