'use client'

/**
 * FamilyReceiptModal — „Családi nyugta" tag-választó (#5 átalakítás, Endre, 2026-06-20).
 *
 * ÚJ koncepció: a modal CSAK a család tagjait (neveit) választja ki — minden más adat
 * (dátum, irattípus, jogcím, melyik évre, nyugtaszámok) a HÍVÓ BEVITELI SORBÓL jön. A
 * megerősítés a kiválasztott tagok listáját adja vissza; a szülő `CombinedEntryBody`
 * abból a sorból, ahonnan a „Család" gombot nyomták (a sablon-sor), személyenként KÜLÖN
 * bevétel-sort készít (a sablon adataival), majd a felhasználó a táblázatban tölti az
 * összegeket.
 */

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Users, Search, X, Plus } from 'lucide-react'

/** Család-találat a kereséshez. */
export interface CombinedFamilyHit {
  id: number
  name: string
  detail?: string
}

/** Család-tag (kiválasztható). */
export interface CombinedFamilyMember {
  id: number
  name: string
  role?: string
}

const inputClass =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm shadow-sm ' +
  'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'

export function FamilyReceiptModal({
  contextInfo,
  onSearchFamilies,
  onGetFamilyMembers,
  onConfirm,
  onClose,
}: {
  /** Rövid összegzés a sablon-sorról (pl. „Dátum: 2026-06-20 · Kerületi sz.: 0115302"). */
  contextInfo?: string
  onSearchFamilies: (query: string) => Promise<CombinedFamilyHit[]>
  onGetFamilyMembers: (familyId: number) => Promise<CombinedFamilyMember[]>
  /** A kiválasztott tagok — ezekből készít a szülő külön sorokat a sablon adataival. */
  onConfirm: (members: CombinedFamilyMember[]) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<CombinedFamilyHit[]>([])
  const [searching, setSearching] = useState(false)
  const debounceRef = useRef<number | null>(null)

  const [selectedFamily, setSelectedFamily] = useState<CombinedFamilyHit | null>(null)
  const [loadingMembers, setLoadingMembers] = useState(false)
  const [members, setMembers] = useState<Array<{ member: CombinedFamilyMember; checked: boolean }>>([])
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
    setMembers([])
    void onGetFamilyMembers(f.id)
      .then((ms) => setMembers(ms.map((m) => ({ member: m, checked: true }))))
      .catch(() => setMembers([]))
      .finally(() => setLoadingMembers(false))
  }

  function toggle(id: number) {
    setMembers((cur) => cur.map((m) => (m.member.id === id ? { ...m, checked: !m.checked } : m)))
  }

  const checkedCount = members.filter((m) => m.checked).length

  function handleConfirm() {
    setError(null)
    const chosen = members.filter((m) => m.checked).map((m) => m.member)
    if (!chosen.length) {
      setError('Válassz ki legalább egy tagot.')
      return
    }
    onConfirm(chosen)
  }

  // FONTOS: a modalt a document.body-ba PORTÁLJUK. A „Tétel rögzítése" dialóg (Base UI) egy
  // `transform: translate(-50%,-50%)` + `overflow-y-auto` konténer, amin belül a `fixed inset-0`
  // a transzformált ősre igazodna és LEVÁGÓDNA. Portállal a teljes képernyőre nyílik.
  const node = (
    <div className="fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
        {/* Fejléc */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 shadow">
              <Users className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="font-heading text-base font-semibold text-slate-800">Családi nyugta — tagok kiválasztása</h3>
              <p className="text-xs text-slate-400">Csak a neveket választod ki; minden más adat a beviteli sorból jön.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Bezárás">
            <X className="size-5" />
          </button>
        </div>

        <div className="max-h-[70dvh] space-y-4 overflow-y-auto px-5 py-4">
          {contextInfo && (
            <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
              A sor adataival: <span className="font-medium text-slate-700">{contextInfo}</span> — az összegeket
              a táblázatban töltöd ki tagonként.
            </div>
          )}

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
                <button
                  type="button"
                  onClick={() => { setSelectedFamily(null); setMembers([]) }}
                  className="shrink-0 rounded-lg border border-indigo-200 bg-white px-2.5 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
                >
                  Másik család
                </button>
              </div>

              {loadingMembers ? (
                <p className="py-3 text-center text-xs text-slate-400">Tagok betöltése…</p>
              ) : members.length === 0 ? (
                <p className="py-3 text-center text-xs text-slate-400">Ehhez a családhoz nincs rögzített tag.</p>
              ) : (
                <ul className="space-y-1">
                  {members.map((m) => (
                    <li key={m.member.id}>
                      <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-white/70">
                        <input type="checkbox" className="size-4" checked={m.checked} onChange={() => toggle(m.member.id)} />
                        <span className="text-slate-800">{m.member.name}</span>
                        {m.member.role && <span className="text-[10px] uppercase text-slate-400">{m.member.role}</span>}
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        {/* Lábléc */}
        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-4">
          <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">Mégse</button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={checkedCount === 0}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
          >
            <Plus className="size-4" /> Hozzáadás ({checkedCount} tag)
          </button>
        </div>
      </div>
    </div>
  )

  return typeof document !== 'undefined' ? createPortal(node, document.body) : null
}
