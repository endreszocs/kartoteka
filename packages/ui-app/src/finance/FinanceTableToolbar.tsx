'use client'

/**
 * Közös szűrő + export toolbar a pénzügyi táblákhoz (Kassza / Bank / Tranzakciók).
 *
 * Oszloponkénti szabad-szöveges szűrés (ékezet-független, „tartalmazza" logika)
 * + a (szűrt) sorok letöltése `.xlsx`-ként a hivatalos Adatok_2025 oszloprendben.
 *
 * Kontrollált komponens: a szűrő-értékeket és az export-akciót a szülő fül adja.
 */

import { Download, Filter, X } from 'lucide-react'

import { normalizeName } from './helpers'

export interface FinanceFilterField {
  key: string
  label: string
}

export interface FinanceTableToolbarProps {
  fields: FinanceFilterField[]
  values: Record<string, string>
  onChange: (key: string, value: string) => void
  onClear: () => void
  /** Export gomb — ha nincs megadva, a gomb rejtve marad. */
  onExport?: () => void
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

export function FinanceTableToolbar({
  fields,
  values,
  onChange,
  onClear,
  onExport,
  totalCount,
  filteredCount,
}: FinanceTableToolbarProps) {
  const anyActive = Object.values(values).some((v) => (v || '').trim())

  return (
    <div className="card-raised space-y-2 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500">
          <Filter className="size-3.5" />
          Szűrés oszloponként
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
          {onExport && (
            <button
              type="button"
              onClick={onExport}
              title="A (szűrt) sorok letöltése Excelbe — a hivatalos Adatok_2025 oszloprendben, újraimportálhatóan"
              className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-100"
            >
              <Download className="size-3.5" />
              Export (Excel)
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {fields.map((f) => (
          <div key={f.key} className="min-w-0">
            <label className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-slate-400">
              {f.label}
            </label>
            <input
              type="text"
              value={values[f.key] || ''}
              onChange={(e) => onChange(f.key, e.target.value)}
              placeholder="szűrés…"
              className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-300"
            />
          </div>
        ))}
      </div>

      <p className="text-xs text-slate-400">
        {anyActive
          ? `${filteredCount} / ${totalCount} tétel (szűrve)`
          : `${totalCount} tétel`}
      </p>
    </div>
  )
}
