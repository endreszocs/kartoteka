'use client'

/**
 * Közös szűrő + export akciósor a pénzügyi táblákhoz (Kassza / Bank / Tranzakciók).
 *
 * A szűrő-mezők mostantól a TÁBLÁZAT FEJLÉCÉBEN vannak (oszlop-igazítva, lásd
 * `ColumnFilterInput`), ez a sáv csak a találatszámot, a „Szűrők törlése" és az
 * „Export (Excel)" gombot mutatja. Az export NEM tölt le egyből: előnézetet nyit
 * (`FinanceExportPreview`), ahonnan a letöltés külön gombbal indul.
 */

import { useState } from 'react'
import { Download, Filter, X } from 'lucide-react'

import { normalizeName } from './helpers'
import { FinanceExportPreview } from './FinanceExportPreview'

export interface FinanceFilterField {
  key: string
  label: string
}

export interface FinanceTableToolbarProps {
  values: Record<string, string>
  onClear: () => void
  /** Export-adat előállítása előnézethez (aoa + fájlnév). Ha nincs, az export gomb rejtve. */
  buildExport?: () => { aoa: (string | number)[][]; filename: string } | null
  /** A tényleges letöltés (a web köti be SheetJS-szel). */
  onDownload?: (aoa: (string | number)[][], filename: string) => void
  totalCount: number
  filteredCount: number
}

/**
 * Igaz, ha a sor (oszlop→cellaérték map) megfelel az ÖSSZES aktív szűrőnek.
 * Ékezet-független, kisbetűs, „tartalmazza" összevetés.
 */
export function matchesColumnFilters(
  values: Record<string, string>,
  cells: Record<string, string>,
): boolean {
  for (const key of Object.keys(values)) {
    const needle = (values[key] || '').trim()
    if (!needle) continue
    const hay = normalizeName(cells[key] || '')
    if (!hay.includes(normalizeName(needle))) return false
  }
  return true
}

/**
 * Egyetlen oszlop-szűrő beviteli mező — a táblázat fejlécében, a cellához igazítva.
 * `w-full`, így pontosan az oszlop szélességét veszi fel.
 */
export function ColumnFilterInput({
  value,
  onChange,
  ariaLabel,
}: {
  value: string
  onChange: (value: string) => void
  ariaLabel?: string
}) {
  return (
    <input
      type="text"
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder="szűrés…"
      aria-label={ariaLabel}
      className="w-full rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] font-normal text-slate-700 shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-300"
    />
  )
}

export function FinanceTableToolbar({
  values,
  onClear,
  buildExport,
  onDownload,
  totalCount,
  filteredCount,
}: FinanceTableToolbarProps) {
  const [preview, setPreview] = useState<{ aoa: (string | number)[][]; filename: string } | null>(
    null,
  )
  const anyActive = Object.values(values).some((v) => (v || '').trim())
  const canExport = !!buildExport && !!onDownload

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
        <Filter className="size-3.5" />
        {anyActive ? (
          <span>
            <strong className="text-slate-700">{filteredCount}</strong> / {totalCount} tétel
            (szűrve)
          </span>
        ) : (
          <span>{totalCount} tétel</span>
        )}
      </span>
      <div className="flex items-center gap-2">
        {anyActive && (
          <button
            type="button"
            onClick={onClear}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-50"
          >
            <X className="size-3.5" />
            Szűrők törlése
          </button>
        )}
        {canExport && (
          <button
            type="button"
            onClick={() => {
              const data = buildExport?.()
              if (data) setPreview(data)
            }}
            title="A (szűrt) sorok exportja — előnézet után tölthető le Excelbe"
            className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-100"
          >
            <Download className="size-3.5" />
            Export (Excel)
          </button>
        )}
      </div>

      {preview && onDownload && (
        <FinanceExportPreview
          aoa={preview.aoa}
          filename={preview.filename}
          onClose={() => setPreview(null)}
          onDownload={onDownload}
        />
      )}
    </div>
  )
}
