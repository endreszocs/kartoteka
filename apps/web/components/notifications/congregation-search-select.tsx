'use client'

/**
 * Kereshető célgyülekezet-választó.
 *
 * Endre kérése (2026-04-30): "A célgyülekezetnél lehessen keresni!" — a
 * 484 gyülekezetes dropdown nem használható. Ez a komponens egy input
 * mező + szűrt lista, egyházmegye-csoportosítással.
 *
 * Használat:
 *   - global (special-fields-step): null = "Külföldre / ismeretlen"
 *   - row-level (elkoltozott-target-table): null = "Nincs / külföldre"
 *
 * Funkciók:
 *   - Beírás: az input szöveg szűri a gyülekezeteket (név + egyházmegye)
 *   - Lefelé nyíló lista: egyházmegye-csoportos + a kiválasztott
 *   - Kattintás: bezárás, érték frissítés
 *   - Esc / outside click: bezárás
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Search, X } from 'lucide-react'
import type { DioceseTreeNode } from '@/lib/notifications/congregations-tree-action'

interface CongregationSearchSelectProps {
  value: string | null
  onChange: (congregationId: string | null) => void
  tree: DioceseTreeNode[]
  unassigned?: Array<{ id: string; name: string }>
  /** Placeholder ha üres — pl. "Külföldre / ismeretlen" vagy "Nincs / külföldre" */
  placeholder: string
  /** Tone — szín-osztályok */
  tone?: 'cyan' | 'slate'
  /** Kompakt mód (kisebb input + dropdown) */
  compact?: boolean
}

interface FlatItem {
  id: string
  name: string
  diocese_name: string | null
  varos: string | null
}

export function CongregationSearchSelect({
  value,
  onChange,
  tree,
  unassigned = [],
  placeholder,
  tone = 'cyan',
  compact = false,
}: CongregationSearchSelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Lapos lista a fa-szerkezetből (a kereséshez)
  const flatList = useMemo<FlatItem[]>(() => {
    const items: FlatItem[] = []
    for (const node of tree) {
      for (const c of node.congregations) {
        items.push({
          id: c.id,
          name: c.name,
          diocese_name: node.diocese_name,
          varos: c.varos,
        })
      }
    }
    for (const c of unassigned) {
      items.push({
        id: c.id,
        name: c.name,
        diocese_name: null,
        varos: null,
      })
    }
    return items
  }, [tree, unassigned])

  // A jelenleg kiválasztott elem
  const selected = useMemo(() => {
    if (!value) return null
    return flatList.find(c => c.id === value) || null
  }, [value, flatList])

  // Szűrt lista
  const filtered = useMemo<FlatItem[]>(() => {
    const q = query.trim().toLowerCase()
    if (!q) return flatList
    return flatList.filter(c => {
      return (
        c.name.toLowerCase().includes(q)
        || (c.diocese_name && c.diocese_name.toLowerCase().includes(q))
        || (c.varos && c.varos.toLowerCase().includes(q))
      )
    })
  }, [flatList, query])

  // Csoportosítás megjelenítéshez
  const groupedFiltered = useMemo(() => {
    const groups = new Map<string, FlatItem[]>()
    for (const c of filtered) {
      const key = c.diocese_name || '— Egyházmegye nélkül —'
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(c)
    }
    return Array.from(groups.entries())
  }, [filtered])

  // Outside click bezárja
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  // Esc → close
  useEffect(() => {
    if (!open) return
    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [open])

  // Open-kor focusol az inputra
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  const toneClasses = {
    cyan: {
      ring: 'ring-cyan-200',
      border: 'border-cyan-200',
      activeBorder: 'border-cyan-400',
      activeRing: 'ring-cyan-200',
      bgHover: 'hover:bg-cyan-50',
      bgActive: 'bg-cyan-50',
    },
    slate: {
      ring: 'ring-slate-200',
      border: 'border-slate-200',
      activeBorder: 'border-slate-400',
      activeRing: 'ring-slate-200',
      bgHover: 'hover:bg-slate-50',
      bgActive: 'bg-slate-50',
    },
  }
  const t = toneClasses[tone]

  const sizeClasses = compact
    ? 'h-7 text-[11px] px-1.5'
    : 'h-11 text-sm px-3'

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger button — mutatja a kiválasztott vagy placeholder-t */}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={`flex w-full items-center justify-between gap-2 rounded-xl border bg-white text-left shadow-sm transition focus:outline-none focus:ring-2 ${
          open ? `${t.activeBorder} ${t.activeRing}` : `${t.border} ${t.ring}`
        } ${sizeClasses}`}
      >
        <span className={`min-w-0 flex-1 truncate ${selected ? 'text-slate-700' : 'text-slate-400'}`}>
          {selected ? selected.name : placeholder}
          {selected?.diocese_name && (
            <span className="ml-1.5 text-[10px] text-slate-400">
              ({selected.diocese_name})
            </span>
          )}
        </span>
        {selected && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation()
              onChange(null)
              setQuery('')
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                e.stopPropagation()
                onChange(null)
                setQuery('')
              }
            }}
            className="shrink-0 cursor-pointer text-slate-400 hover:text-slate-700"
            aria-label="Választás visszavonása"
          >
            <X className={compact ? 'size-3' : 'size-4'} />
          </span>
        )}
        <ChevronDown className={`shrink-0 text-slate-400 ${compact ? 'size-3' : 'size-4'}`} />
      </button>

      {/* Lenyíló lista */}
      {open && (
        <div className={`absolute left-0 top-full z-50 mt-1 w-full max-w-[600px] rounded-xl border ${t.border} bg-white shadow-[0_24px_60px_-30px_rgba(15,23,42,0.5)]`}>
          {/* Kereső mező a tetején */}
          <div className={`flex items-center gap-2 border-b ${t.border} p-2`}>
            <Search className="size-4 shrink-0 text-slate-400" />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Keresés egyházközség / egyházmegye / város szerint…"
              className="flex-1 bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="text-slate-400 hover:text-slate-700"
                aria-label="Keresőszöveg törlése"
              >
                <X className="size-4" />
              </button>
            )}
          </div>

          {/* "Külföldre / nincs" opció — mindig elérhető */}
          <button
            type="button"
            onClick={() => {
              onChange(null)
              setOpen(false)
              setQuery('')
            }}
            className={`flex w-full items-center gap-2 border-b ${t.border} px-3 py-2 text-left text-xs italic text-slate-500 ${t.bgHover}`}
          >
            <span>{placeholder}</span>
            {!value && <Check className="size-3.5 text-emerald-600" />}
          </button>

          {/* Csoportosított lista */}
          <div className="max-h-72 overflow-y-auto">
            {groupedFiltered.length === 0 ? (
              <div className="p-4 text-center text-xs italic text-slate-500">
                Nincs találat — próbálj kevesebb betűt vagy más kulcsszót.
              </div>
            ) : (
              groupedFiltered.map(([dioceseName, items]) => (
                <div key={dioceseName} className="border-b border-slate-100 last:border-b-0">
                  <p className="sticky top-0 bg-slate-50/95 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 backdrop-blur">
                    {dioceseName}
                  </p>
                  {items.map(c => {
                    const isPicked = value === c.id
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          onChange(c.id)
                          setOpen(false)
                          setQuery('')
                        }}
                        className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs transition ${
                          isPicked ? `${t.bgActive} font-semibold text-slate-800` : `text-slate-700 ${t.bgHover}`
                        }`}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="truncate">{c.name}</span>
                          {c.varos && c.varos !== c.name && (
                            <span className="ml-1 text-[10px] text-slate-400">— {c.varos}</span>
                          )}
                        </span>
                        {isPicked && <Check className="size-3.5 shrink-0 text-emerald-600" />}
                      </button>
                    )
                  })}
                </div>
              ))
            )}
          </div>

          {/* Footer: hány találat */}
          <div className={`border-t ${t.border} bg-slate-50/40 px-3 py-1.5 text-[10px] text-slate-500`}>
            {query ? `${filtered.length} találat` : `${flatList.length} gyülekezet összesen`}
          </div>
        </div>
      )}
    </div>
  )
}
