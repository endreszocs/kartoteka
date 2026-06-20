'use client'

/**
 * FamilyReceiptModal — „Családi nyugta" (#4b, Endre, 2026-06-20).
 *
 * Egy nyugta, több névvel: a felhasználó megad EGY közös nyugtaszámot + dátumot
 * + jogcímet + évet, kikeresi a családot (név/cím szerint), majd a család tagjai
 * mellé beírja, ki mennyit fizet. Megerősítéskor a modal NEM ment közvetlenül —
 * a szülő `CombinedEntryBody`-nak ad egy struktúrát, amiből az személyenként
 * KÜLÖN bevétel-sort készít (mindenki a saját járulékával, a saját taghoz kötve),
 * a közös alapszám + `/N` utótaggal.
 *
 * Miért utótag? A `befizetes`-en parciális UNIQUE index van a készpénzes
 * iratszámra (congregation_id, fizetettev, iratszam) — két azonos készpénz-iratszám
 * ütközne. Így az alapszám „45" → a sorok „45/1", „45/2"… (egy nyugta, több sor).
 * Egyetlen tag esetén nincs utótag (sima „45").
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { Users, Search, X, Plus } from 'lucide-react'
import { formatRon } from './ron-in-words'
import { SearchableSelect } from './SearchableSelect'

/** Család-találat a kereséshez. */
export interface CombinedFamilyHit {
  id: number
  name: string
  detail?: string
}

/** Család-tag (kiválasztható, összeggel). */
export interface CombinedFamilyMember {
  id: number
  name: string
  role?: string
}

/** Egy generálandó nyugta-sor (egy tag). */
export interface FamilyReceiptLine {
  szemelyId: number
  name: string
  amount: string
}

/** A modal eredménye — ebből készít a szülő külön bevétel-sorokat. */
export interface FamilyReceiptResult {
  datum: string
  categoryId: number
  docType: string
  evre: string
  baseIratszam: string
  megjegyzes: string
  lines: FamilyReceiptLine[]
}

const inputClass =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm shadow-sm ' +
  'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'

const todayIso = () => new Date().toISOString().slice(0, 10)

const DOC_TYPES = ['Chitanță', 'Factură', 'Bon fiscal', 'Stat de plată', 'Altele'] as const

export function FamilyReceiptModal({
  categoryOptions,
  currentYear,
  onSearchFamilies,
  onGetFamilyMembers,
  onConfirm,
  onClose,
}: {
  categoryOptions: { id: number; label: string }[]
  currentYear: number
  onSearchFamilies: (query: string) => Promise<CombinedFamilyHit[]>
  onGetFamilyMembers: (familyId: number) => Promise<CombinedFamilyMember[]>
  onConfirm: (result: FamilyReceiptResult) => void
  onClose: () => void
}) {
  // Közös fejléc-mezők
  const [datum, setDatum] = useState(todayIso())
  const [categoryId, setCategoryId] = useState<number | ''>('')
  const [docType, setDocType] = useState<string>('Chitanță')
  const [evre, setEvre] = useState(String(currentYear))
  const [baseIratszam, setBaseIratszam] = useState('')
  const [megjegyzes, setMegjegyzes] = useState('')

  // Család-keresés
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<CombinedFamilyHit[]>([])
  const [searching, setSearching] = useState(false)
  const debounceRef = useRef<number | null>(null)

  // Kiválasztott család + tagjai
  const [selectedFamily, setSelectedFamily] = useState<CombinedFamilyHit | null>(null)
  const [loadingMembers, setLoadingMembers] = useState(false)
  const [amounts, setAmounts] = useState<Array<{ member: CombinedFamilyMember; amount: string }>>([])

  const [error, setError] = useState<string | null>(null)

  // Debounce-os család-keresés
  useEffect(() => {
    if (selectedFamily) return
    const q = query.trim()
    if (q.length < 2) {
      setHits([])
      return
    }
    if (debounceRef.current) window.clearTimeout(debounceRef.current)
    debounceRef.current = window.setTimeout(() => {
      setSearching(true)
      void onSearchFamilies(q)
        .then((res) => setHits(res.slice(0, 10)))
        .catch(() => setHits([]))
        .finally(() => setSearching(false))
    }, 300)
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, selectedFamily])

  function selectFamily(f: CombinedFamilyHit) {
    setSelectedFamily(f)
    setHits([])
    setQuery('')
    setLoadingMembers(true)
    setAmounts([])
    void onGetFamilyMembers(f.id)
      .then((members) => setAmounts(members.map((m) => ({ member: m, amount: '' }))))
      .catch(() => setAmounts([]))
      .finally(() => setLoadingMembers(false))
  }

  function resetFamily() {
    setSelectedFamily(null)
    setAmounts([])
    setQuery('')
  }

  function setAmount(szemelyId: number, value: string) {
    setAmounts((cur) => cur.map((a) => (a.member.id === szemelyId ? { ...a, amount: value } : a)))
  }

  const total = useMemo(
    () => amounts.reduce((s, a) => s + (Number(a.amount) || 0), 0),
    [amounts],
  )
  const filledCount = amounts.filter((a) => Number(a.amount) > 0).length

  function handleConfirm() {
    setError(null)
    if (!baseIratszam.trim()) {
      setError('Adj meg egy közös nyugtaszámot.')
      return
    }
    if (categoryId === '') {
      setError('Válassz jogcímet.')
      return
    }
    const lines = amounts
      .filter((a) => Number(a.amount) > 0)
      .map((a) => ({ szemelyId: a.member.id, name: a.member.name, amount: a.amount }))
    if (!lines.length) {
      setError('Adj meg legalább egy tagnál összeget.')
      return
    }
    onConfirm({
      datum,
      categoryId: Number(categoryId),
      docType,
      evre,
      baseIratszam: baseIratszam.trim(),
      megjegyzes: megjegyzes.trim(),
      lines,
    })
  }

  return (
    <div className="fixed inset-0 z-[150] flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl">
        {/* Fejléc */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 shadow">
              <Users className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="font-heading text-base font-semibold text-slate-800">Családi nyugta</h3>
              <p className="text-xs text-slate-400">Egy nyugtaszám, több névvel — mindenki külön sorban.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Bezárás">
            <X className="size-5" />
          </button>
        </div>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto px-5 py-4">
          {/* Közös fejléc-mezők */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <label className="text-xs text-slate-500">Dátum
              <input type="date" className={inputClass} value={datum} onChange={(e) => setDatum(e.target.value)} />
            </label>
            <label className="text-xs text-slate-500">Irattípus
              <select className={inputClass} value={docType} onChange={(e) => setDocType(e.target.value)}>
                {DOC_TYPES.map((t) => (<option key={t} value={t}>{t}</option>))}
              </select>
            </label>
            <label className="text-xs text-slate-500">Nyugtaszám (közös)
              <input className={inputClass} value={baseIratszam} placeholder="pl. 45" onChange={(e) => setBaseIratszam(e.target.value)} />
            </label>
            <label className="col-span-2 text-xs text-slate-500 sm:col-span-2">Jogcím
              <SearchableSelect options={categoryOptions} value={categoryId} onChange={(id) => setCategoryId(id)} />
            </label>
            <label className="text-xs text-slate-500">Melyik évre
              <input className={inputClass + ' text-center'} type="number" inputMode="numeric" value={evre} onChange={(e) => setEvre(e.target.value)} />
            </label>
            <label className="col-span-2 text-xs text-slate-500 sm:col-span-3">Megjegyzés (közös, opcionális)
              <input className={inputClass} value={megjegyzes} placeholder={`pl. Családi nyugta`} onChange={(e) => setMegjegyzes(e.target.value)} />
            </label>
          </div>

          {/* Család-keresés vagy a kiválasztott család tagjai */}
          {!selectedFamily ? (
            <div className="rounded-xl border border-slate-200 p-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <input
                  className={inputClass + ' pl-8'}
                  value={query}
                  placeholder="Család keresése — név vagy cím (min. 2 betű)"
                  onChange={(e) => setQuery(e.target.value)}
                  autoFocus
                />
              </div>
              {searching && <p className="mt-2 text-xs text-slate-400">Keresés…</p>}
              {!searching && query.trim().length >= 2 && hits.length === 0 && (
                <p className="mt-2 text-xs text-slate-400">Nincs találat. (Keress a családfő nevére vagy a címre.)</p>
              )}
              {hits.length > 0 && (
                <div className="mt-2 max-h-56 space-y-1 overflow-y-auto">
                  {hits.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      className="block w-full rounded-lg border border-slate-100 px-3 py-2 text-left hover:border-indigo-200 hover:bg-indigo-50"
                      onClick={() => selectFamily(f)}
                    >
                      <div className="text-sm font-medium text-slate-800">{f.name}</div>
                      {f.detail && <div className="text-[11px] text-slate-400">{f.detail}</div>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-800">{selectedFamily.name}</div>
                  {selectedFamily.detail && <div className="truncate text-[11px] text-slate-500">{selectedFamily.detail}</div>}
                </div>
                <button type="button" onClick={resetFamily} className="shrink-0 rounded-lg border border-indigo-200 bg-white px-2.5 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100">
                  Másik család
                </button>
              </div>

              {loadingMembers ? (
                <p className="py-3 text-center text-xs text-slate-400">Tagok betöltése…</p>
              ) : amounts.length === 0 ? (
                <p className="py-3 text-center text-xs text-slate-400">Ehhez a családhoz nincs rögzített tag.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-slate-400">
                      <th className="px-1 py-1 text-left">Tag</th>
                      <th className="px-1 py-1 text-right">Összeg (RON)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {amounts.map((a) => (
                      <tr key={a.member.id} className="border-t border-indigo-100">
                        <td className="px-1 py-1.5">
                          <span className="text-slate-800">{a.member.name}</span>
                          {a.member.role && <span className="ml-1.5 text-[10px] uppercase text-slate-400">{a.member.role}</span>}
                        </td>
                        <td className="px-1 py-1.5 text-right">
                          <input
                            className={inputClass + ' w-28 text-right'}
                            type="number"
                            min={0}
                            step={0.01}
                            value={a.amount}
                            onChange={(e) => setAmount(a.member.id, e.target.value)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        {/* Lábléc */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-4">
          <div className="text-sm">
            <span className="text-slate-500">{filledCount} tag · összesen:</span>{' '}
            <strong className="text-indigo-700">{formatRon(total)} RON</strong>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">Mégse</button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={filledCount === 0}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
            >
              <Plus className="size-4" /> Hozzáadás a tételekhez ({filledCount})
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
