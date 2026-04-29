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
import { Check, Loader2, Search, X, AlertCircle, UserCheck, Heart, SearchCheck } from 'lucide-react'

import {
  getCandidatesForUnresolvedAction,
  type UnresolvedRowCandidates,
  type CandidatePerson,
} from '@/lib/import/registry-candidates-action'
import { searchPersonsForManualPickAction } from '@/lib/import/registry-manual-search-action'

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
    <div className="rounded-2xl bg-violet-50/70 p-4 ring-1 ring-violet-200">
      <div className="mb-3 flex items-start gap-2">
        <Search className="mt-0.5 size-4 shrink-0 text-violet-700" />
        <div>
          <p className="text-sm font-semibold text-violet-800">
            Tagok összekapcsolása a már létező tagnyilvántartással
          </p>
          <p className="mt-0.5 text-xs text-violet-700/90">
            {unresolvedRows.length} sornál az automatikus kereső bizonytalan
            volt. Alább a leghasonlóbb tagokat látod a tagnyilvántartásból
            (pontszám szerint csökkenően). <strong>Klikkelj rá a megfelelő
            tagra</strong> a párosításhoz — így az anyakönyvi bejegyzés a már
            létező taghoz fog kapcsolódni (nem hoz létre új tagot).
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
          const slotColor = row.slot === 'ferfi'
            ? 'text-blue-700 bg-blue-50'
            : row.slot === 'no'
              ? 'text-pink-700 bg-pink-50'
              : 'text-slate-700 bg-slate-50'

          // Életkor kalkulálás (search személy)
          const calcAge = (sz: string | null | undefined) => {
            if (!sz) return null
            const m = sz.match(/^(\d{4})/)
            if (!m) return null
            const year = parseInt(m[1])
            return new Date().getFullYear() - year
          }
          const searchAge = calcAge(row.searchedSzDatum)

          // Pár-info (esketésnél)
          const hasPartner = row.partnerCsaladnev && row.partnerKnev
          const partnerAge = calcAge(row.partnerSzDatum)
          const partnerLabel = row.slot === 'ferfi' ? 'Menyasszony' : 'Vőlegény'

          return (
            <li
              key={pickKey}
              className="rounded-xl bg-white p-3 ring-1 ring-violet-100"
            >
              {/* Esketés pár-info BANNER — kit kihez keresünk */}
              {hasPartner && (
                <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg bg-rose-50/80 px-2.5 py-1.5 text-xs ring-1 ring-rose-100">
                  <Heart className="size-3.5 shrink-0 text-rose-500" />
                  <span className="text-rose-700">
                    <strong>Esküvő{row.marriageDatum ? ` ${row.marriageDatum.split('T')[0]}` : ''}</strong> —
                  </span>
                  <span className="text-rose-700">
                    {partnerLabel}: <strong>{row.partnerCsaladnev} {row.partnerKnev}</strong>
                    {partnerAge !== null && ` (${partnerAge} éves)`}
                    {row.partnerSzDatum && (
                      <span className="ml-1 text-rose-500/80">sz: {row.partnerSzDatum.split('T')[0]}</span>
                    )}
                  </span>
                </div>
              )}

              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="text-xs font-mono text-violet-600">{row.rowIndex}.</span>
                <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${slotColor}`}>
                  {slotLabel}
                </span>
                <span className="text-sm font-medium text-slate-800">
                  {row.searchedCsaladnev} {row.searchedKnev}
                </span>
                {searchAge !== null && (
                  <span className="text-xs text-slate-500">{searchAge} éves</span>
                )}
                {row.searchedSzDatum && (
                  <span className="text-xs text-slate-500">sz: {row.searchedSzDatum.split('T')[0]}</span>
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

              {/* Manuális keresés — ha az ajánlott jelöltek között nincs a keresett tag */}
              <ManualSearchBox
                pickKey={pickKey}
                ferfiFilter={row.searchedFerfi}
                targetCongregationId={targetCongregationId}
                currentPick={currentPick}
                onPickChange={onPickChange}
                initialQuery={`${row.searchedCsaladnev} ${row.searchedKnev}`.trim()}
              />
            </li>
          )
        })}
      </ul>

      {unresolvedRows.length > 50 && (
        <p className="mt-3 text-xs text-violet-700">
          (Csak az első 50 sor jelenik meg, a többi automatikusan a legjobb
          jelölthöz lesz kötve, ha 1 egyértelmű találat van.)
        </p>
      )}
    </div>
  )
}

// ─── Manuális kereső sub-komponens ────────────────────────────────────────

interface ManualSearchBoxProps {
  pickKey: string
  ferfiFilter: boolean | null
  targetCongregationId: string
  currentPick: number | undefined
  onPickChange: (key: string, szemelyId: number | null) => void
  /** Előre kitöltött keresőszöveg (a XML-ből származó név) — könnyebb
   *  variálni a keresőt mint nulláról beírni. */
  initialQuery: string
}

function ManualSearchBox({
  pickKey,
  ferfiFilter,
  targetCongregationId,
  currentPick,
  onPickChange,
  initialQuery,
}: ManualSearchBoxProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState(initialQuery)
  const [results, setResults] = useState<CandidatePerson[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isSearching, startSearching] = useTransition()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const runSearch = useCallback((q: string) => {
    setError(null)
    if (q.trim().length < 2) {
      setResults([])
      return
    }
    startSearching(async () => {
      const res = await searchPersonsForManualPickAction(q, {
        ferfi: ferfiFilter,
        targetCongregationId,
      })
      if (res.error) {
        setError(res.error)
        setResults([])
        return
      }
      setResults(res.results || [])
    })
  }, [ferfiFilter, targetCongregationId])

  // Debounced keresés gépelés közben
  useEffect(() => {
    if (!open) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => runSearch(query), 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, open, runSearch])

  if (!open) {
    return (
      <div className="mt-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1 text-[11px] text-slate-500 underline-offset-2 hover:text-violet-700 hover:underline"
        >
          <Search className="size-3" />
          Saját keresés (ha nincs az ajánlottak között)
        </button>
      </div>
    )
  }

  return (
    <div className="mt-2 rounded-lg bg-slate-50 p-2 ring-1 ring-slate-200">
      <div className="flex items-center gap-2">
        <SearchCheck className="size-3.5 shrink-0 text-violet-600" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Keresés családnév, keresztnév, lánykori név alapján…"
          className="h-7 flex-1 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-200"
          autoFocus
        />
        {isSearching && <Loader2 className="size-3.5 shrink-0 animate-spin text-violet-500" />}
        <button
          type="button"
          onClick={() => { setOpen(false); setQuery(''); setResults([]) }}
          className="text-slate-400 hover:text-slate-700"
          aria-label="Kereső bezárása"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {error && (
        <div className="mt-2 text-[11px] text-red-600">{error}</div>
      )}

      {!error && !isSearching && query.trim().length >= 2 && results.length === 0 && (
        <div className="mt-2 text-[11px] text-slate-500 italic">
          Nincs találat — próbálj kevesebb betűt vagy más névrészt.
        </div>
      )}

      {results.length > 0 && (
        <div className="mt-2 flex flex-col gap-1">
          {results.map(c => {
            const isPicked = currentPick === c.id
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onPickChange(pickKey, isPicked ? null : c.id)}
                className={`flex items-center justify-between gap-3 rounded-md border p-1.5 text-left text-xs transition ${
                  isPicked
                    ? 'border-violet-400 bg-violet-50 ring-1 ring-violet-200'
                    : 'border-slate-200 bg-white hover:border-violet-200 hover:bg-violet-50/50'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="font-medium text-slate-800">
                      {c.csaladnev} {c.k_nev}
                    </span>
                    {c.szcs_nev && c.szcs_nev !== c.csaladnev && (
                      <span className="text-[10px] text-slate-500">
                        (sz. {c.szcs_nev})
                      </span>
                    )}
                    {c.sz_datum && (
                      <span className="text-[10px] text-slate-500">{c.sz_datum}</span>
                    )}
                    <span className="text-[10px] text-slate-400">
                      {c.ferfi === true ? '♂' : c.ferfi === false ? '♀' : ''}
                    </span>
                  </div>
                </div>
                {isPicked && <Check className="size-3.5 shrink-0 text-violet-600" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
