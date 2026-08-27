'use client'

/**
 * BANKI IMPORT — BEFIZETŐ (tag) választó egy táblázat-cellába (2026-08-27).
 *
 * Endre 3. kérése: „Ha valaki adományt vagy egyházfenntartást fizet, lehessen
 * hozzárendelni a tagnyilvántartásból az illető személyhez."
 *
 * ⛔ MIÉRT PORTÁL A LEGÖRDÜLŐ: a varázsló táblázata KÉT egymásba ágyazott vágó
 *    konténerben ül — `card-raised overflow-hidden` és `overflow-x-auto`. Egy
 *    sima abszolút pozicionált legördülőt MINDKETTŐ levágna, és a lelkész csak
 *    egy csonkot látna. A projekt ezt már megszenvedte a FamilyReceiptModalnál.
 *
 * ⛔ MIÉRT NEM A `searchIncomePartners`: az `ilike`-ra épül, ami ÉKEZET-ÉRZÉKENY,
 *    és többtokenes keresésnél „Vezetéknév Keresztnév" sorrendet feltételez.
 *    A banki közlemény viszont jellemzően NAGYBETŰS, ÉKEZET NÉLKÜLI és gyakran
 *    FORDÍTOTT sorrendű („ZAGONI EVA -MARIA") → néma üres lista lenne.
 *    Helyette a `searchPersonsForManualPickAction` fut: betölti a gyülekezet
 *    látható, élő tagjait, majd JS-ben pontoz ékezet- és sorrend-függetlenül,
 *    a lánykori/férjezett néven, lakcímen és foglalkozáson is találva.
 *    (Ez egyben HATÓKÖRRE IS SZŰR: csak a saját gyülekezet tagjai jönnek.)
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

import { searchPersonsForManualPickAction } from '@/lib/import/registry-manual-search-action'

export type PickedPerson = { id: number; name: string }

type Talalat = { id: number; name: string; detail: string }

function teljesNev(p: {
  csaladnev: string | null
  k_nev: string | null
  szcs_nev?: string | null
}): string {
  const alap = [p.csaladnev, p.k_nev].filter(Boolean).join(' ').trim()
  return alap || '(névtelen)'
}

export function BankImportPersonPicker({
  value,
  onChange,
  /** A banki közlemény — ezzel indul a keresés, hogy ne kelljen begépelni. */
  suggestQuery,
  disabled,
}: {
  value: PickedPerson | null
  onChange: (p: PickedPerson | null) => void
  suggestQuery?: string
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [rows, setRows] = useState<Talalat[]>([])
  const [loading, setLoading] = useState(false)
  const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const reposition = useCallback(() => {
    const el = wrapRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setCoords({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 260) })
  }, [])

  useEffect(() => {
    if (!open) return
    reposition()
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    return () => {
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
    }
  }, [open, reposition])

  // Kívülre kattintás → zárás.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (wrapRef.current?.contains(t)) return
      if ((t as HTMLElement)?.closest?.('[data-bip-lista]')) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // Keresés — 300 ms késleltetéssel, 2 karaktertől. A `keres` szám a versenyhelyzet
  // ellen véd: egy lassabb, korábbi válasz NEM írhatja felül a frissebbet.
  const keresSzam = useRef(0)
  useEffect(() => {
    if (!open) return
    const q = query.trim()
    if (q.length < 2) {
      setRows([])
      setLoading(false)
      return
    }
    const sajat = ++keresSzam.current
    setLoading(true)
    const t = setTimeout(async () => {
      try {
        const res = await searchPersonsForManualPickAction(q)
        if (sajat !== keresSzam.current) return
        const lista = (res.results || []).slice(0, 12).map((p) => ({
          id: p.id,
          name: teljesNev(p),
          detail: [
            p.szcs_nev ? `szül. ${p.szcs_nev}` : '',
            p.sz_datum ? String(p.sz_datum).slice(0, 4) : '',
            p.cim || '',
          ]
            .filter(Boolean)
            .join(' · '),
        }))
        setRows(lista)
      } finally {
        if (sajat === keresSzam.current) setLoading(false)
      }
    }, 300)
    return () => clearTimeout(t)
  }, [query, open])

  function nyit() {
    if (disabled) return
    setQuery(value ? value.name : (suggestQuery || '').trim())
    setOpen(true)
    setTimeout(() => inputRef.current?.select(), 0)
  }

  if (value) {
    return (
      <div ref={wrapRef} className="flex items-center gap-1">
        <button
          type="button"
          onClick={nyit}
          disabled={disabled}
          className="min-w-0 flex-1 truncate rounded-md bg-emerald-50 px-2 py-1 text-left text-xs font-medium text-emerald-800 ring-1 ring-emerald-200 hover:bg-emerald-100"
          title={value.name}
        >
          {value.name}
        </button>
        <button
          type="button"
          onClick={() => onChange(null)}
          disabled={disabled}
          className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          aria-label="Befizető törlése"
        >
          <X className="size-3.5" />
        </button>
        {open && coords && lista(coords)}
      </div>
    )
  }

  return (
    <div ref={wrapRef}>
      <button
        type="button"
        onClick={nyit}
        disabled={disabled}
        className="w-full rounded-md border border-dashed border-slate-300 px-2 py-1 text-left text-xs text-slate-500 hover:border-slate-400 hover:text-slate-700 disabled:opacity-50"
      >
        + Befizető…
      </button>
      {open && coords && lista(coords)}
    </div>
  )

  function lista(c: { top: number; left: number; width: number }) {
    return createPortal(
      <div
        data-bip-lista
        className="fixed z-[300] rounded-xl border border-slate-200 bg-white shadow-xl"
        style={{ top: c.top, left: c.left, width: c.width }}
      >
        <div className="border-b border-slate-100 p-2">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Név, lakcím vagy foglalkozás…"
            className="h-8 w-full rounded-md border border-slate-300 px-2 text-xs outline-none focus:border-violet-400"
            onKeyDown={(e) => {
              if (e.key === 'Escape') setOpen(false)
            }}
          />
        </div>
        <div className="max-h-64 overflow-y-auto p-1">
          {query.trim().length < 2 ? (
            <p className="px-2 py-3 text-xs text-slate-400">Írj be legalább 2 karaktert.</p>
          ) : loading ? (
            <p className="px-2 py-3 text-xs text-slate-400">Keresés…</p>
          ) : rows.length === 0 ? (
            <p className="px-2 py-3 text-xs text-slate-500">
              Nincs találat. A keresés ékezet- és sorrend-független, a lánykori néven,
              lakcímen és foglalkozáson is keres — próbáld a név egy másik részletével.
            </p>
          ) : (
            rows.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => {
                  onChange({ id: r.id, name: r.name })
                  setOpen(false)
                }}
                className="flex w-full flex-col items-start rounded-lg px-2 py-1.5 text-left hover:bg-violet-50"
              >
                <span className="text-xs font-medium text-slate-800">{r.name}</span>
                {r.detail && <span className="text-[11px] text-slate-500">{r.detail}</span>}
              </button>
            ))
          )}
        </div>
      </div>,
      document.body,
    )
  }
}
