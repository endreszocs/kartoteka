'use client'

/**
 * Anyakönyvi import wizard — nem-talált sorok jelölt-választó UI.
 *
 * Endre kérése (2026-04-28): "Ha nem találja biztosan, akkor segítsen
 * a lelkésznek a wizard és adjon alternatívákat valószínűség szerint.
 * Pontozza a valószínűséget és a lelkész kapcsolja össze a párokat."
 *
 * Minden nem-talált soron egy lista jelenik meg a TOP-5 szemely-jelölttel
 * (pontszám szerint csökkenő). A lelkész egy klikkel kiválasztja a
 * megfelelőt, vagy manuálisan kihagyja (default).
 */

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { Check, Loader2, Search, X, AlertCircle, UserCheck } from 'lucide-react'

import {
  getCandidatesForUnresolvedAction,
  type UnresolvedRowCandidates,
} from '@/lib/import/registry-candidates-action'

interface UnresolvedCandidatesListProps {
  file: File
  sheetName: string
  profileKey: string
  targetCongregationId: string
  /** A wizard state-jéből — manualPicks: { "rowIdx_slot": szemely_id } */
  manualPicks: Record<string, number>
  onPickChange: (key: string, szemelyId: number | null) => void
}

export function UnresolvedCandidatesList({
  file, sheetName, profileKey, targetCongregationId,
  manualPicks, onPickChange,
}: UnresolvedCandidatesListProps) {
  const [unresolvedRows, setUnresolvedRows] = useState<UnresolvedRowCandidates[]>([])
  const [isLoading, startLoading] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const hasRunRef = useRef(false)

  const runQuery = useCallback(() => {
    startLoading(async () => {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('sheetName', sheetName)
      formData.append('profileKey', profileKey)
      formData.append('targetCongregationId', targetCongregationId)
      const res = await getCandidatesForUnresolvedAction(formData)
      if (res.error) {
        setError(res.error)
        return
      }
      setUnresolvedRows(res.unresolvedRows || [])
    })
  }, [file, sheetName, profileKey, targetCongregationId])

  useEffect(() => {
    if (hasRunRef.current) return
    hasRunRef.current = true
    runQuery()
  }, [runQuery])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-2xl bg-violet-50 p-4 text-sm text-violet-700">
        <Loader2 className="size-4 animate-spin" />
        Jelölt-keresés a tagnyilvántartásban…
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-2xl bg-red-50 p-4 text-sm text-red-700">
        <AlertCircle className="mb-1 inline size-4" /> {error}
      </div>
    )
  }

  if (unresolvedRows.length === 0) {
    return null
  }

  return (
    <div className="rounded-2xl bg-amber-50/60 p-4 ring-1 ring-amber-100">
      <div className="mb-3 flex items-start gap-2">
        <Search className="mt-0.5 size-4 shrink-0 text-amber-700" />
        <div>
          <p className="text-sm font-semibold text-amber-800">
            Manuális tag-választás
          </p>
          <p className="mt-0.5 text-xs text-amber-700/90">
            A {unresolvedRows.length} nem-talált sorhoz alább látod a leghasonlóbb
            tagokat (pontszám szerint csökkenően). Klikkelj rá a megfelelőre,
            vagy hagyd kihagyásra (alapértelmezés).
          </p>
        </div>
      </div>

      <ul className="space-y-3">
        {unresolvedRows.slice(0, 50).map(row => {
          const pickKey = `${row.rowIndex}_${row.slot}`
          const currentPick = manualPicks[pickKey]
          const slotLabel = row.slot === 'ferfi'
            ? 'Vőlegény'
            : row.slot === 'no'
              ? 'Menyasszony'
              : 'Tag'

          return (
            <li
              key={pickKey}
              className="rounded-xl bg-white p-3 ring-1 ring-amber-100"
            >
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="text-xs font-mono text-amber-600">{row.rowIndex}.</span>
                <span className="text-xs font-semibold text-slate-600">{slotLabel}:</span>
                <span className="text-sm font-medium text-slate-800">
                  {row.searchedCsaladnev} {row.searchedKnev}
                </span>
                {row.searchedSzDatum && (
                  <span className="text-xs text-slate-500">sz: {row.searchedSzDatum}</span>
                )}
              </div>

              {row.candidates.length === 0 && (
                <div className="mt-2 text-xs text-slate-500 italic">
                  Nincs hasonló tag a tagnyilvántartásban — használd az „Új tagok
                  létrehozása” gombot, vagy hagyd kihagyásra.
                </div>
              )}

              {row.candidates.length > 0 && (
                <div className="mt-2 flex flex-col gap-1.5">
                  {row.candidates.map(c => {
                    const isPicked = currentPick === c.id
                    const scoreColor = c.score >= 70
                      ? 'bg-emerald-100 text-emerald-800'
                      : c.score >= 50
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-slate-100 text-slate-700'
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => onPickChange(pickKey, isPicked ? null : c.id)}
                        className={`flex items-start justify-between gap-3 rounded-lg border p-2 text-left transition ${
                          isPicked
                            ? 'border-violet-400 bg-violet-50 ring-2 ring-violet-200'
                            : 'border-slate-200 hover:border-violet-200 hover:bg-violet-50/40'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline gap-2">
                            <span className="text-sm font-medium text-slate-800">
                              {c.csaladnev} {c.k_nev}
                            </span>
                            {c.szcs_nev && c.szcs_nev !== c.csaladnev && (
                              <span className="text-xs text-slate-500">
                                (sz. {c.szcs_nev})
                              </span>
                            )}
                            {c.sz_datum && (
                              <span className="text-xs text-slate-500">{c.sz_datum}</span>
                            )}
                          </div>
                          <div className="mt-0.5 text-[11px] text-slate-500">
                            {c.reasons.join(' · ')}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${scoreColor}`}>
                            {c.score}
                          </span>
                          {isPicked ? (
                            <Check className="size-4 text-violet-600" />
                          ) : (
                            <UserCheck className="size-4 text-slate-300" />
                          )}
                        </div>
                      </button>
                    )
                  })}

                  {currentPick && (
                    <button
                      type="button"
                      onClick={() => onPickChange(pickKey, null)}
                      className="self-start text-xs text-slate-500 underline-offset-2 hover:text-slate-700 hover:underline"
                    >
                      <X className="mr-0.5 inline size-3" />
                      Választás visszavonása
                    </button>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>

      {unresolvedRows.length > 50 && (
        <p className="mt-3 text-xs text-amber-700">
          (Csak az első 50 sor jelenik meg, a többi automatikusan a legjobb
          jelölthöz lesz kötve, ha 1 egyértelmű találat van.)
        </p>
      )}
    </div>
  )
}
