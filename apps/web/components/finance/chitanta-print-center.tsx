'use client'

/**
 * Chitanță „Nyomtatási központ" — egy helyen az összes kiállított nyugta.
 *
 * Ez nem a kasszás befizetés-soroknak felel meg (azok már a CashbookTab-ban
 * vannak listázva), hanem KIFEJEZETTEN a kiállított chitanță rekordoknak —
 * beleértve a manuálisan, befizetés-sor nélkül kiállítottakat is.
 *
 * Funkciók:
 *   - Lista év + sorozat szűrővel
 *   - Egy kattintásos újranyomtatás (MÁSOLAT vízjellel)
 *   - Sztornózás indokkal
 *
 * UX:
 *   - Default állapotban összecsukva (a kasszás nézetet nem zsúfolja)
 *   - Megnyitáskor lazy-load — csak akkor fetch-eli a listát, ha kell
 */

import { useEffect, useState } from 'react'
import { ChevronDown, ChevronUp, Loader2, Printer, Receipt, RefreshCw, AlertTriangle } from 'lucide-react'
import { listChitantas } from '@/app/(dashboard)/penzugy/chitanta-actions'
import type { ChitantaRow } from '@/app/(dashboard)/penzugy/chitanta-types'
import { ChitantaSilentPrint } from '@/components/finance/chitanta-silent-print'
import { formatCurrency } from '@/lib/constants/finance'

interface Props {
  /** Aktuális év (a szűrő alapértelmezett értékéhez). */
  currentYear: number
}

export function ChitantaPrintCenter({ currentYear }: Props) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<ChitantaRow[]>([])
  const [yearFilter, setYearFilter] = useState<number>(currentYear)
  const [silentPrintId, setSilentPrintId] = useState<string | null>(null)

  // Megnyitáskor — első fetch
  useEffect(() => {
    if (!open) return
    fetchList()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, yearFilter])

  async function fetchList() {
    setLoading(true)
    setError(null)
    const res = await listChitantas({ yearFrom: yearFilter, yearTo: yearFilter })
    if (res.error) setError(res.error)
    else setRows(res.data || [])
    setLoading(false)
  }

  const totalAmount = rows.filter(r => !r.stornozott).reduce((s, r) => s + (r.osszeg_brut || 0), 0)
  const stornoCount = rows.filter(r => r.stornozott).length

  return (
    <>
      <div className="card-raised overflow-hidden">
        {/* Fejléc — kattintható az összecsukáshoz */}
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-amber-50/40 transition-colors"
        >
          <div className="flex items-center gap-3">
            <span className="inline-flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 text-white shadow-sm">
              <Receipt className="size-4" />
            </span>
            <div className="text-left">
              <div className="text-sm font-semibold text-slate-800">Nyugta nyomtatási központ</div>
              <div className="text-[11px] text-slate-500">
                Az összes kiállított papír nyugta egy helyen — utólagos újranyomtatáshoz
                {open && rows.length > 0 && (
                  <> · {rows.length} db, érvényes összeg: {formatCurrency(totalAmount)} RON
                    {stornoCount > 0 && <> · {stornoCount} sztornózott</>}
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 text-slate-400">
            {open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          </div>
        </button>

        {/* Tartalom — csak ha nyitva */}
        {open && (
          <div className="border-t border-slate-100 bg-amber-50/20">
            {/* Szűrő sáv */}
            <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-amber-100">
              <label className="flex items-center gap-2 text-xs">
                <span className="text-slate-600">Év:</span>
                <select
                  value={yearFilter}
                  onChange={e => setYearFilter(Number(e.target.value))}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-sm shadow-sm"
                >
                  {Array.from({ length: 5 }, (_, i) => currentYear - i).map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() => fetchList()}
                disabled={loading}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                <RefreshCw className={`size-3 ${loading ? 'animate-spin' : ''}`} />
                Frissítés
              </button>
            </div>

            {/* Lista */}
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500">
                <Loader2 className="size-4 animate-spin" /> Nyugták betöltése…
              </div>
            ) : error ? (
              <div className="flex items-center gap-2 px-4 py-4 text-sm text-red-700 bg-red-50/60 border-y border-red-100">
                <AlertTriangle className="size-4" /> {error}
              </div>
            ) : rows.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-slate-400">
                Nincs kiállított nyugta {yearFilter}-ben.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-amber-50/40 text-xs text-slate-500 border-b border-amber-100">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Sorozat / Szám</th>
                      <th className="px-3 py-2 text-left font-medium">Dátum</th>
                      <th className="px-3 py-2 text-left font-medium">Átvevő</th>
                      <th className="px-3 py-2 text-left font-medium hidden md:table-cell">Címen</th>
                      <th className="px-3 py-2 text-right font-medium">Összeg</th>
                      <th className="px-3 py-2 text-center font-medium w-20">Nyomtatás</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-amber-100/60">
                    {rows.map(r => (
                      <tr
                        key={r.id}
                        className={`hover:bg-amber-50/40 transition-colors ${r.stornozott ? 'opacity-60 line-through' : ''}`}
                      >
                        <td className="px-3 py-2 font-mono text-xs text-slate-700 whitespace-nowrap">
                          <strong>{r.sorozat}</strong> {String(r.szam).padStart(7, '0')}
                          {r.stornozott && (
                            <span className="ml-1 text-[10px] uppercase font-bold text-red-600 no-underline" title={r.stornozott_indok || ''}>
                              · sztornó
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs text-slate-500 whitespace-nowrap">
                          {r.szamla_datum?.split('T')[0]}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          <div className="font-medium text-slate-700">{r.klienesseg_nev}</div>
                          {r.klienesseg_cui && (
                            <div className="text-[10px] text-slate-400">CUI: {r.klienesseg_cui}</div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs text-slate-500 hidden md:table-cell max-w-xs truncate" title={r.reprezentand || ''}>
                          {r.reprezentand || '—'}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold text-emerald-700 whitespace-nowrap">
                          {formatCurrency(r.osszeg_brut)}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <button
                            type="button"
                            onClick={() => setSilentPrintId(r.id)}
                            disabled={r.stornozott}
                            title={r.stornozott ? 'Sztornózott — nem nyomtatható újra' : 'Nyomtatás (MÁSOLAT vízjellel)'}
                            className="inline-flex size-7 items-center justify-center rounded-md text-blue-600 hover:bg-blue-100 hover:text-blue-700 disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <Printer className="size-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Közvetlen nyomtatás — dialog nélkül, egy kattintásra */}
      <ChitantaSilentPrint
        chitantaId={silentPrintId}
        onDone={() => setSilentPrintId(null)}
      />
    </>
  )
}
