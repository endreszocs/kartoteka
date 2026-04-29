'use client'

/**
 * Elköltözés-import — sor-szintű célgyülekezet-választó tábla.
 *
 * Endre kérése (2026-04-30): "14 sor különböző célgyülekezetekre megy.
 * Sor-szintű választó kell, plus auto-javaslat a Hova-helység és a
 * Megjegyzés alapján."
 *
 * A komponens egy táblát mutat:
 *   Sor | Név | Hova | Megjegyzés | Javaslat | Célgyülekezet (select)
 *
 * Az auto-javaslat 3 confidence-szinten:
 *   - high (zöld): biztos egyezés (pl. megjegyzésben szerepel a név)
 *   - medium (sárga): valószínű (pl. Hova→név-egyezés)
 *   - low (piros): bizonytalan (pl. több gyülekezet egy városban)
 *
 * A felhasználó a dropdown-ban módosíthatja, vagy elfogadhatja az
 * "Elfogadom mind"-gombbal a high-confidence javaslatokat egyszerre.
 */

import { useEffect, useMemo, useState, useTransition } from 'react'
import { Check, CheckCircle2, Globe, Loader2, MapPin, User, Wand2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  previewElkoltozottRowsAction,
  type ElkoltozottRow,
} from '@/lib/import/elkoltozott-rows-action'
import {
  listCongregationsTree,
  type DioceseTreeNode,
} from '@/lib/notifications/congregations-tree-action'

interface ElkoltozottTargetTableProps {
  file: File
  sheetName: string
  /** Wizard state — sor-szintű cél-gyülekezet hozzárendelések
   *  Kulcs: rowIndex (1-alapú); érték: congregation_id (UUID) vagy null = "külföldre/nincs" */
  targetMap: Record<number, string | null>
  onTargetChange: (rowIndex: number, congregationId: string | null) => void
}

export function ElkoltozottTargetTable({
  file,
  sheetName,
  targetMap,
  onTargetChange,
}: ElkoltozottTargetTableProps) {
  const [rows, setRows] = useState<ElkoltozottRow[]>([])
  const [tree, setTree] = useState<DioceseTreeNode[]>([])
  const [unassigned, setUnassigned] = useState<Array<{ id: string; name: string }>>([])
  const [isLoading, startLoading] = useTransition()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    startLoading(async () => {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('sheetName', sheetName)
      formData.append('profileKey', 'movement_elkoltozott')

      const [rowsRes, treeRes] = await Promise.all([
        previewElkoltozottRowsAction(formData),
        listCongregationsTree(),
      ])

      if (rowsRes.error) {
        setError(rowsRes.error)
        return
      }
      setRows(rowsRes.rows || [])
      if (treeRes.data) setTree(treeRes.data)
      if (treeRes.unassigned) {
        setUnassigned(treeRes.unassigned.map(c => ({ id: c.id, name: c.name })))
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file.name, sheetName])

  // Statisztikák
  const stats = useMemo(() => {
    let foreign = 0
    let assigned = 0
    let suggested = 0
    let pending = 0
    for (const r of rows) {
      if (r.is_foreign) {
        foreign += 1
        continue
      }
      if (targetMap[r.rowIndex]) {
        assigned += 1
      } else if (r.suggested_target) {
        suggested += 1
      } else {
        pending += 1
      }
    }
    return { foreign, assigned, suggested, pending, total: rows.length }
  }, [rows, targetMap])

  const handleAcceptAllHighConfidence = () => {
    for (const r of rows) {
      if (r.is_foreign) continue
      if (targetMap[r.rowIndex]) continue // már beállítva
      if (r.suggested_target?.confidence === 'high') {
        onTargetChange(r.rowIndex, r.suggested_target.congregation_id)
      }
    }
  }

  if (isLoading && rows.length === 0) {
    return (
      <div className="rounded-2xl bg-cyan-50 p-4 text-sm text-cyan-700 ring-1 ring-cyan-100">
        <Loader2 className="mr-2 inline size-4 animate-spin" />
        Sor-szintű célgyülekezet-javaslatok generálása…
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-2xl bg-red-50 p-4 text-sm text-red-700">
        {error}
      </div>
    )
  }

  if (rows.length === 0) return null

  return (
    <div className="space-y-3">
      {/* Statisztika + bulk-akció */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-cyan-50/60 p-3 ring-1 ring-cyan-100">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-700">
            ✓ {stats.assigned} kiválasztva
          </span>
          {stats.suggested > 0 && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-700">
              ✨ {stats.suggested} javaslat (még nem fogadtad el)
            </span>
          )}
          {stats.pending > 0 && (
            <span className="rounded-full bg-red-100 px-2 py-0.5 font-semibold text-red-700">
              ! {stats.pending} válasz nélkül
            </span>
          )}
          {stats.foreign > 0 && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-700">
              🌍 {stats.foreign} külföldre
            </span>
          )}
          <span className="text-slate-500">/ összesen {stats.total} sor</span>
        </div>
        {stats.suggested > 0 && (
          <Button
            type="button"
            size="sm"
            onClick={handleAcceptAllHighConfidence}
            className="ml-auto rounded-full bg-emerald-600 hover:bg-emerald-700"
          >
            <Wand2 className="mr-1.5 size-3.5" />
            Magasszintű javaslatok elfogadása
          </Button>
        )}
      </div>

      {/* Sor-tábla */}
      <div className="overflow-x-auto rounded-xl ring-1 ring-slate-200">
        <table className="w-full text-xs">
          <thead className="bg-slate-50">
            <tr>
              <th className="p-2 text-left">#</th>
              <th className="p-2 text-left">Név</th>
              <th className="p-2 text-left">Hova / Megjegyzés</th>
              <th className="p-2 text-left">Javaslat</th>
              <th className="p-2 text-left">Célgyülekezet</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const currentPick = targetMap[r.rowIndex]
              const isPicked = currentPick != null && currentPick !== ''
              const usingSuggestion =
                r.suggested_target && currentPick === r.suggested_target.congregation_id

              return (
                <tr
                  key={r.rowIndex}
                  className={`border-t border-slate-100 ${r.is_foreign ? 'bg-slate-50/50' : 'bg-white hover:bg-cyan-50/30'}`}
                >
                  <td className="p-2 font-mono text-slate-400">{r.rowIndex}</td>
                  <td className="p-2">
                    <div className="flex items-center gap-1.5">
                      <User className="size-3 text-slate-400" />
                      <span className="font-medium text-slate-800">
                        {r.csaladnev} {r.k_nev}
                      </span>
                      {r.szcs_nev && r.szcs_nev !== r.csaladnev && (
                        <span className="text-[10px] text-slate-500">(sz. {r.szcs_nev})</span>
                      )}
                    </div>
                  </td>
                  <td className="p-2 text-slate-600">
                    <div className="flex items-center gap-1">
                      <MapPin className="size-3 text-slate-400" />
                      <span>{r.hova || '—'}</span>
                      {r.kulfoldre && (
                        <span className="ml-1 inline-flex items-center gap-0.5 rounded bg-slate-200 px-1 text-[9px] text-slate-700">
                          <Globe className="size-2.5" /> külf.
                        </span>
                      )}
                    </div>
                    {r.megjegyzes && (
                      <div className="mt-0.5 text-[10px] text-slate-500 italic line-clamp-1">
                        {r.megjegyzes}
                      </div>
                    )}
                  </td>
                  <td className="p-2">
                    {r.is_foreign ? (
                      <span className="text-[10px] text-slate-500">Külföldi cél</span>
                    ) : r.suggested_target ? (
                      <div>
                        <div className="flex items-center gap-1">
                          <span
                            className={`inline-block size-1.5 rounded-full ${
                              r.suggested_target.confidence === 'high'
                                ? 'bg-emerald-500'
                                : r.suggested_target.confidence === 'medium'
                                  ? 'bg-amber-500'
                                  : 'bg-red-400'
                            }`}
                          />
                          <span className="text-[10px] font-medium text-slate-700">
                            {r.suggested_target.congregation_name}
                          </span>
                          {usingSuggestion && (
                            <CheckCircle2 className="size-3 text-emerald-600" />
                          )}
                        </div>
                        <div className="mt-0.5 text-[9px] text-slate-500 italic">
                          {r.suggested_target.reason}
                        </div>
                      </div>
                    ) : (
                      <span className="text-[10px] text-slate-400">Nincs javaslat</span>
                    )}
                  </td>
                  <td className="p-2">
                    {r.is_foreign ? (
                      <span className="text-[10px] text-slate-400 italic">
                        — (külföld, nincs notifikáció)
                      </span>
                    ) : (
                      <select
                        value={currentPick || ''}
                        onChange={(e) => onTargetChange(r.rowIndex, e.target.value || null)}
                        className={`h-7 w-full rounded border px-1.5 text-[10px] ${
                          isPicked
                            ? 'border-emerald-300 bg-emerald-50'
                            : r.suggested_target
                              ? 'border-amber-300 bg-amber-50/50'
                              : 'border-slate-200 bg-white'
                        }`}
                      >
                        <option value="">— Nincs / külföldre —</option>
                        {tree.map((node) => (
                          <optgroup key={node.diocese_id} label={node.diocese_name}>
                            {node.congregations.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                                {c.varos && c.varos !== c.name ? ` — ${c.varos}` : ''}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                        {unassigned.length > 0 && (
                          <optgroup label="— Egyházmegye nélküli —">
                            {unassigned.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </optgroup>
                        )}
                      </select>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[10px] text-slate-500">
        💡 Az "Elfogadom mind"-gomb a magas-megbízhatóságú (zöld) javaslatokat
        állítja be egyszerre. A sárga (közepes) és piros (alacsony) javaslatokat
        soronként ellenőrizd. A "Külföldre" jelzett sorokra nem generálódik
        átjelentkezési notifikáció.
      </p>
    </div>
  )
}
