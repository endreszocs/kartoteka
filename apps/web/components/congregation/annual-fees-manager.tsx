'use client'

import { type ReactNode, useCallback, useEffect, useState } from 'react'
import { Plus, Save, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { getCongregationAnnualFees } from '@/app/(dashboard)/congregation/actions'
import { deleteAnnualFee, saveAnnualFee } from '@/app/(dashboard)/penzugy/tartozas-actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

/**
 * annual-fees-manager — az „Évenkénti (visszamenőleges) díjak" panel önálló,
 * self-contained kiemelése a congregation-dialog-v2.tsx-ből (AnnualFeesPanel).
 *
 * Változatlan üzleti logika: a lelkész **visszamenőlegesen** rögzíthet éveket
 * (akár 20-30 évet). Régebbi évekhez **nincs kedvezmény** — csak az összeg
 * állítható. Default nézet: 10 év visszafelé, a „+ Régebbi 10 év" gombbal bővíthető.
 *
 * A komponens saját state-tel, saját betöltéssel (useEffect mountkor a
 * `getCongregationAnnualFees` getter-actionnel) és saját toast-okkal működik.
 * A szerver-actionök VÁLTOZATLANOK, a meglévő helyükről importálva.
 */

// ── Al-típus (csak ez a panel használja) ───────────────────────────────────
interface AnnualFeeRow {
  year: number
  eves_jarulek: number
  jarulek_kedvezmenyes: number | null
  jarulek_hatarid: string | null
  note: string | null
}

// ── Al-komponens: kártya-keret (a dialog-v2 `Panel` helyi helpere) ──────────
function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="card-raised p-5">
      <h3 className="mb-4 text-sm font-semibold text-slate-700">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

export function AnnualFeesManager({
  congregationId,
  currentYearFee = 0,
}: {
  congregationId: string
  /** Az aktuális évi (teljes) díj a zárolt „Aktuális" sor megjelenítéséhez. */
  currentYearFee?: number
}) {
  const currentYear = new Date().getFullYear()
  const [rows, setRows] = useState<AnnualFeeRow[]>([])
  const [yearsBack, setYearsBack] = useState(10)
  const [editValues, setEditValues] = useState<Record<number, string>>({})

  // ── Betöltés mountkor (és congregationId változásra) ──────────────────────
  const loadRows = useCallback(async () => {
    if (!congregationId) return
    const result = await getCongregationAnnualFees(congregationId)
    if ('error' in result && result.error) {
      toast.error(result.error)
      setRows([])
      return
    }
    setRows((result.rows || []) as AnnualFeeRow[])
  }, [congregationId])

  useEffect(() => {
    // A setState-et mikrotaszkba halasztjuk (react-hooks/set-state-in-effect + a kódbázis mintája).
    queueMicrotask(() => { void loadRows() })
  }, [loadRows])

  // ── Mentés / törlés handlerek (változatlan viselkedés) ────────────────────
  async function handleSaveAnnualYearFee(year: number, amount: number) {
    const result = await saveAnnualFee(congregationId, year, amount)
    if (result.error) {
      toast.error(result.error)
      return
    }
    toast.success(result.success)
    await loadRows()
  }

  async function handleDeleteAnnualYearFee(year: number) {
    if (!confirm(`Biztosan törlöd a ${year}-es díjat?\n\nFigyelmeztetés: ha van erre az évre befizetés, az "árván" marad (a tartozás-számítás átugorja).`)) {
      return
    }
    const result = await deleteAnnualFee(congregationId, year)
    if (result.error) {
      toast.error(result.error)
      return
    }
    toast.success(result.success)
    await loadRows()
  }

  // Évek listája: currentYear-től visszafelé yearsBack év
  const years = Array.from({ length: yearsBack + 1 }, (_, i) => currentYear - i)
  const rowsByYear = new Map(rows.map((r) => [r.year, r]))

  function handleEditChange(year: number, value: string) {
    setEditValues((prev) => ({ ...prev, [year]: value }))
  }

  async function handleRowSave(year: number) {
    const raw = editValues[year]
    if (raw === undefined || raw === '') return
    const amount = Number(raw)
    if (isNaN(amount) || amount < 0) return
    await handleSaveAnnualYearFee(year, amount)
    setEditValues((prev) => {
      const next = { ...prev }
      delete next[year]
      return next
    })
  }

  return (
    <Panel title="Évenkénti díjak (visszamenőleg)">
      <div className="mb-3 rounded-[1rem] border border-slate-100 bg-slate-50/60 px-4 py-3 text-xs leading-5 text-slate-700">
        <strong>ℹ️ Hogyan működik?</strong> Az egyes évek egyházfenntartási díját itt rögzítheted
        visszamenőleg — akár 20-30 évig visszafelé. A <strong>régebbi évekhez nincs kedvezmény</strong>,
        mert azok elmaradásnak számítanak, teljes összegben fizetendők. A rendszer a tartozást
        csak az <strong>utolsó rögzített befizetéstől</strong> számolja — tehát ha a tag 2020-ban
        fizetett utoljára, a tartozás 2021-től indul.
      </div>

      <div className="overflow-hidden rounded-[1rem] border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">Év</th>
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">Díj (RON)</th>
              <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-slate-500"></th>
            </tr>
          </thead>
          <tbody>
            {years.map((year) => {
              const row = rowsByYear.get(year)
              const isCurrentYear = year === currentYear
              const editing = editValues[year] !== undefined
              const displayValue = editing
                ? editValues[year]
                : row
                  ? String(Number(row.eves_jarulek))
                  : isCurrentYear
                    ? String(currentYearFee)
                    : ''
              const isEmpty = !row && !isCurrentYear && !editing
              return (
                <tr
                  key={year}
                  className={`border-t border-slate-100 ${
                    isCurrentYear ? 'bg-emerald-50/40' : row ? 'bg-white' : 'bg-slate-50/30'
                  }`}
                >
                  <td className="px-3 py-2 font-semibold text-slate-700">
                    {year}
                    {isCurrentYear && (
                      <span className="ml-1.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-800">
                        Aktuális
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {isEmpty ? (
                      <span className="text-xs text-slate-400">— nincs rögzítve —</span>
                    ) : (
                      <Input
                        type="number"
                        min={0}
                        value={displayValue}
                        onChange={(e) => handleEditChange(year, e.target.value)}
                        // #Endre (6b): látható mező — eddig beleolvadt a kártya hátterébe
                        className="h-8 max-w-28 text-sm bg-white border-slate-300 shadow-sm focus-visible:border-teal-500 focus-visible:ring-teal-500/25 disabled:bg-slate-100 disabled:text-slate-500"
                        disabled={isCurrentYear}
                      />
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {isCurrentYear ? (
                      <span className="text-[11px] text-slate-400">
                        ↑ A fenti &bdquo;Teljes éves díj&rdquo; mezőben szerkeszd
                      </span>
                    ) : isEmpty ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditValues((prev) => ({ ...prev, [year]: '' }))}
                      >
                        <Plus className="mr-1 size-3.5" />
                        Hozzáadás
                      </Button>
                    ) : editing ? (
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => void handleRowSave(year)}
                        >
                          <Save className="size-3.5" />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            setEditValues((prev) => {
                              const next = { ...prev }
                              delete next[year]
                              return next
                            })
                          }
                        >
                          Mégse
                        </Button>
                      </div>
                    ) : (
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditValues((prev) => ({ ...prev, [year]: String(Number(row!.eves_jarulek)) }))}
                        >
                          Szerkeszt
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => void handleDeleteAnnualYearFee(year)}
                        >
                          <Trash2 className="size-3.5 text-rose-600" />
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex justify-center">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setYearsBack((n) => n + 10)}
        >
          + Régebbi 10 év mutatása (jelenleg {yearsBack} év visszafelé)
        </Button>
      </div>
    </Panel>
  )
}
