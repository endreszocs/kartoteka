'use client'

/**
 * Megosztott manuális (szabad-szöveges) tag-kereső a pénzügyi importhoz.
 *
 * 2026-06-19 (P1-3): a párosító UI eddig csak az AUTOMATIKUSAN talált
 * jelöltekből engedett választani — ha a helyes személy nem volt köztük
 * (vagy egyáltalán nem volt találat), a felhasználó nem tudta kézzel
 * összekötni a befizetést a meglévő taggal. Ez a komponens a tagnyilvántartás-
 * import már bevált `searchPersonsForManualPickAction` szerver-akcióját
 * használja (RLS-scoped, csak a saját gyülekezet látható tagjai), és bárhol
 * bekapcsolható, ahol egy sorhoz `id_szemely`-t kell rendelni.
 */

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { Search, SearchCheck, Loader2, X, Check } from 'lucide-react'

import { searchPersonsForManualPickAction } from '@/lib/import/registry-manual-search-action'
import type { CandidatePerson } from '@/lib/import/registry-candidates-action'

interface ManualTagSearchProps {
  /** Előre kitöltött keresőszöveg (általában a befizető neve, cím nélkül). */
  initialQuery: string
  /** A jelenleg (kézzel) választott szemely.id — ha van. */
  currentId: number | undefined
  /** Pick callback: a választott szemely.id + egy megjelenítő címke. */
  onPick: (szemelyId: number, label: string) => void
  /** Választás visszavonása (a kézi párosítás törlése). */
  onClear?: () => void
}

function personLabel(p: CandidatePerson): string {
  const base = [p.csaladnev, p.k_nev].filter(Boolean).join(' ').trim() || '(névtelen)'
  // A lánykori (születési) nevet csak akkor írjuk ki, ha eltér a jelenlegi vezetéknévtől
  // (pl. férjhez ment: Kovács Csilla Tímea → szül. Beder).
  const maiden = p.szcs_nev && p.szcs_nev !== p.csaladnev ? ` (szül. ${p.szcs_nev})` : ''
  return `${base}${maiden}`
}

/** Életkor a születési dátumból (YYYY-MM-DD). Null, ha nem értelmezhető. */
function ageFromBirth(sz: string | null | undefined): number | null {
  if (!sz) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(sz.trim())
  if (!m) return null
  const by = Number(m[1])
  const bm = Number(m[2])
  const bd = Number(m[3])
  const now = new Date()
  let age = now.getFullYear() - by
  const mo = now.getMonth() + 1
  const da = now.getDate()
  if (mo < bm || (mo === bm && da < bd)) age--
  return age >= 0 && age < 130 ? age : null
}

export function ManualTagSearch({ initialQuery, currentId, onPick, onClear }: ManualTagSearchProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState(initialQuery)
  const [results, setResults] = useState<CandidatePerson[]>([])
  const [error, setError] = useState<string | null>(null)
  const [pickedLabel, setPickedLabel] = useState<string | null>(null)
  const [isSearching, startSearching] = useTransition()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const runSearch = useCallback((q: string) => {
    setError(null)
    if (q.trim().length < 2) {
      setResults([])
      return
    }
    startSearching(async () => {
      const res = await searchPersonsForManualPickAction(q)
      if (res.error) {
        setError(res.error)
        setResults([])
        return
      }
      setResults(res.results || [])
    })
  }, [])

  useEffect(() => {
    if (!open) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => runSearch(query), 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, open, runSearch])

  // Ha van kézzel választott tag, mutassuk (akkor is, ha a kereső zárva van).
  if (currentId && pickedLabel && !open) {
    return (
      <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-emerald-50 px-2 py-1.5 ring-1 ring-emerald-200">
        <Check className="size-3.5 shrink-0 text-emerald-600" />
        <span className="text-xs font-medium text-emerald-800">Kézzel párosítva: {pickedLabel}</span>
        <button
          type="button"
          onClick={() => { setOpen(true) }}
          className="text-[11px] text-emerald-700 underline-offset-2 hover:underline"
        >
          módosít
        </button>
        {onClear && (
          <button
            type="button"
            onClick={() => { setPickedLabel(null); onClear() }}
            className="text-[11px] text-slate-500 underline-offset-2 hover:text-slate-700 hover:underline"
          >
            visszavon
          </button>
        )}
      </div>
    )
  }

  if (!open) {
    return (
      <div className="mt-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1 text-[11px] text-slate-500 underline-offset-2 hover:text-teal-700 hover:underline"
        >
          <Search className="size-3" />
          Tag keresése kézzel
        </button>
      </div>
    )
  }

  return (
    <div className="mt-2 rounded-lg bg-slate-50 p-2 ring-1 ring-slate-200">
      <div className="flex items-center gap-2">
        <SearchCheck className="size-3.5 shrink-0 text-teal-600" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Keresés: bármilyen név (kereszt-, lánykori, férjezett) vagy lakcím…"
          className="h-7 flex-1 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none focus:border-teal-400 focus:ring-1 focus:ring-teal-200"
          autoFocus
        />
        {isSearching && <Loader2 className="size-3.5 shrink-0 animate-spin text-teal-500" />}
        <button
          type="button"
          onClick={() => { setOpen(false) }}
          className="text-slate-400 hover:text-slate-700"
          aria-label="Kereső bezárása"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {error && <p className="mt-1 text-[11px] text-rose-600">{error}</p>}

      {query.trim().length >= 2 && !isSearching && results.length === 0 && !error && (
        <p className="mt-1 text-[11px] text-slate-500">Nincs találat erre a keresésre.</p>
      )}

      {results.length > 0 && (
        <ul className="mt-1.5 max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-md bg-white ring-1 ring-slate-100">
          {results.map((p) => {
            const label = personLabel(p)
            const isCurrent = currentId === p.id
            const fullName = [p.csaladnev, p.k_nev].filter(Boolean).join(' ') || '(névtelen)'
            const age = ageFromBirth(p.sz_datum)
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => {
                    onPick(p.id, label)
                    setPickedLabel(label)
                    setOpen(false)
                  }}
                  className={`flex w-full flex-col gap-0.5 px-2.5 py-2 text-left hover:bg-teal-50 ${
                    isCurrent ? 'bg-teal-50' : ''
                  }`}
                >
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                    <span className={isCurrent ? 'font-semibold text-teal-800' : 'font-medium text-slate-800'}>
                      {fullName}
                    </span>
                    {p.szcs_nev && p.szcs_nev !== p.csaladnev && (
                      <span className="rounded bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-700">
                        szül. {p.szcs_nev}
                      </span>
                    )}
                    {isCurrent && <Check className="ml-auto size-3.5 shrink-0 text-teal-600" />}
                  </span>
                  <span className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-slate-500">
                    {p.cim && <span>📍 {p.cim}</span>}
                    {p.sz_datum && (
                      <span>🎂 {p.sz_datum}{age != null ? ` (${age} é.)` : ''}</span>
                    )}
                    {p.foglalkozas && <span>💼 {p.foglalkozas}</span>}
                    {p.ferfi != null && <span>{p.ferfi ? '♂' : '♀'}</span>}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
