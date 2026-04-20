'use client'

/**
 * Kereshető kategória-választó (szamadasicel).
 *
 * A hagyományos `<select>`-tel szemben:
 *   - A felhasználó gépelhet, és a lista szűrődik
 *   - Csak a kategória NEVE látszik (a kód pl. "101.01" rejtve van)
 *   - De a kiválasztáskor a kód alapján azonosítunk (a value az `id`)
 *   - Mobile-friendly: natív lista-viselkedéssel, billentyűzet-navigációval
 *
 * Használat:
 *   <SearchableCategorySelect
 *     value={selectedId}
 *     onChange={(id) => setSelectedId(id)}
 *     categories={[{id:1, kod:'101.01', nev:'Járulék'}]}
 *     placeholder="Válassz kategóriát..."
 *   />
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, Check, ChevronDown, Search, X } from 'lucide-react'

export interface CategoryOption {
  id: number
  kod: string
  nev: string
}

/**
 * Egy kategória neve "hiányos"-nak számít CSAK akkor, ha üres vagy ha a név a
 * kóddal egyezik ÉS a kód formátuma „XXX.YY" (azaz tipikus kategória-kód) —
 * ez a fallback szcenárió, ha a szamadasicel-lookup nem találja meg.
 * A javított `actions.ts` (2026-04-18) már nem okoz ilyen esetet, de biztonsági
 * hálóként megtartjuk.
 */
function isMissingName(c: CategoryOption): boolean {
  const nev = (c.nev || '').trim()
  if (nev === '') return true
  // Ha a név pont olyan, mint a kód (pl. "101.07"), és a kód tipikus kategória-formátumú
  return nev === c.kod && /^\d{3}\.\d{2}$/.test(c.kod)
}

interface Props {
  value: number | null
  onChange: (id: number | null) => void
  categories: CategoryOption[]
  placeholder?: string
  disabled?: boolean
  className?: string
  /** Ha true, a kód is látszik a listában (zárójelben). Default: false. */
  showKod?: boolean
  /** Ha van kiválasztva, megengedi a törlést ("— nincs kategória —"). */
  allowClear?: boolean
}

export function SearchableCategorySelect({
  value,
  onChange,
  categories,
  placeholder = 'Válassz kategóriát...',
  disabled,
  className = '',
  showKod = false,
  allowClear = true,
}: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [highlightIdx, setHighlightIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  /** A trigger gomb helyzete + szélessége a viewportban — a portálon megjelenő
   *  dropdown pozíciójához. Ezt átméretezés / scroll során újraszámoljuk, így
   *  a dropdown soha nem „csúszik el" a triggerhez képest. */
  const [triggerRect, setTriggerRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null)
  /** SSR/első render biztonság: csak kliensen rendereljünk portált. */
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) setMounted(true)
    })
    return () => { cancelled = true }
  }, [])

  const selected = useMemo(
    () => categories.find((c) => c.id === value) || null,
    [categories, value],
  )

  // Normalizált szűrés (ékezet-érzéketlen + kis/nagybetű érzéketlen)
  const filtered = useMemo(() => {
    if (!search.trim()) return categories
    const normalize = (s: string) =>
      s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
    const q = normalize(search)
    return categories.filter((c) => {
      const namePart = normalize(c.nev)
      const kodPart = normalize(c.kod)
      return namePart.includes(q) || kodPart.includes(q)
    })
  }, [categories, search])

  // Billentyűzet-navigáció
  useEffect(() => {
    if (!open) return
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      setHighlightIdx(0)
      // Fókusz az input-ra
      setTimeout(() => inputRef.current?.focus(), 50)
    })
    return () => { cancelled = true }
  }, [open])

  // Klikk-kívüli bezárás — a trigger ÉS a portálon megjelenő panel is belül van
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node
      const inTrigger = containerRef.current && containerRef.current.contains(target)
      const inPanel = panelRef.current && panelRef.current.contains(target)
      if (!inTrigger && !inPanel) {
        setOpen(false)
        setSearch('')
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  // A trigger helyzet mérése + scroll/resize követés, hogy a fixed pozíciójú
  // dropdown pontosan a trigger alatt maradjon. A `useLayoutEffect` szinkronban
  // mért helyzetet ad, nincs „villanás" nyitáskor.
  useLayoutEffect(() => {
    if (!open) return
    function measure() {
      const el = triggerRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      setTriggerRect({ top: r.top, left: r.left, width: r.width, height: r.height })
    }
    measure()
    window.addEventListener('scroll', measure, true) // true = capture, hogy a scrollable szülők is elkapják
    window.addEventListener('resize', measure)
    return () => {
      window.removeEventListener('scroll', measure, true)
      window.removeEventListener('resize', measure)
    }
  }, [open])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault()
        setOpen(true)
      }
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
      setSearch('')
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIdx((i) => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const pick = filtered[highlightIdx]
      if (pick) {
        onChange(pick.id)
        setOpen(false)
        setSearch('')
      }
    }
  }

  // A trigger label megjelenítése — kezeli a hiányzó név esetet is
  const triggerLabel = selected ? (
    isMissingName(selected) ? (
      <span className="inline-flex items-center gap-1.5 text-amber-700">
        <AlertTriangle className="size-3.5 shrink-0" />
        Névtelen kategória ({selected.kod})
      </span>
    ) : (
      selected.nev
    )
  ) : (
    placeholder
  )

  const showClear = allowClear && selected && !disabled

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Trigger: kattintásra nyílik a kereső + lista.
          FONTOS: a törlő X gomb NEM lehet itt belül (button-in-button nem valid HTML),
          ezért külön elemként, absolute pozícióval a trigger fölé helyezzük. */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => !disabled && setOpen((o) => !o)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        className={`w-full flex items-center justify-between gap-2 rounded-xl border border-input bg-background px-3 py-2 text-left text-sm transition ${
          disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-slate-300 focus:ring-2 focus:ring-emerald-300 focus:outline-none'
        } ${showClear ? 'pr-14' : 'pr-9'}`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={`flex-1 truncate ${selected ? 'text-slate-800' : 'text-slate-400'}`}>
          {triggerLabel}
        </span>
        <ChevronDown
          className={`shrink-0 size-4 text-slate-400 transition-transform absolute right-3 top-1/2 -translate-y-1/2 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Törlés gomb — a trigger fölött, absolute pozícióban (hogy ne legyen
          button-in-button). Pointer events-szel elkapjuk a click-et, hogy a
          trigger ne nyíljon ki. */}
      {showClear && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            e.preventDefault()
            onChange(null)
          }}
          onMouseDown={(e) => e.stopPropagation()}
          className="absolute right-9 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 z-10"
          aria-label="Kategória törlése"
          tabIndex={-1}
        >
          <X className="size-3.5" />
        </button>
      )}

      {/* Dropdown panel — PORTÁLON keresztül a document.body-re, hogy ne vágja
          le semmilyen szülő `overflow: hidden` vagy `overflow-x: auto`
          (pl. banki import wizard táblázata). `fixed` pozíciót használunk,
          amit a trigger getBoundingClientRect-jéből számolunk. */}
      {open && !disabled && mounted && triggerRect &&
        createPortal(
          <div
            ref={panelRef}
            style={{
              position: 'fixed',
              top: triggerRect.top + triggerRect.height + 4,
              left: triggerRect.left,
              width: Math.max(triggerRect.width, 260),
              zIndex: 9999,
            }}
            className="rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden"
          >
            <div className="relative border-b border-slate-100">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setHighlightIdx(0)
                }}
                onKeyDown={handleKeyDown}
                placeholder="Keresés név alapján..."
                className="w-full bg-transparent px-3 py-2 pl-9 text-sm outline-none"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-slate-400 hover:bg-slate-100"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>

            <div className="max-h-72 overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="p-4 text-center text-sm text-slate-400 italic">
                  Nincs találat a keresésre.
                </p>
              ) : (
                <ul role="listbox" className="py-1">
                  {filtered.map((c, idx) => {
                    const isSelected = c.id === value
                    const isHighlight = idx === highlightIdx
                    const missing = isMissingName(c)
                    return (
                      <li
                        key={c.id}
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => {
                          onChange(c.id)
                          setOpen(false)
                          setSearch('')
                        }}
                        onMouseEnter={() => setHighlightIdx(idx)}
                        className={`flex items-center gap-2 px-3 py-2 text-sm cursor-pointer transition ${
                          isHighlight ? 'bg-emerald-50' : ''
                        } ${isSelected ? 'text-emerald-700 font-medium' : 'text-slate-700'}`}
                      >
                        {missing ? (
                          <span className="flex-1 truncate inline-flex items-center gap-1.5 text-amber-700">
                            <AlertTriangle className="size-3.5 shrink-0" />
                            Névtelen kategória (kód: {c.kod})
                          </span>
                        ) : (
                          <span className="flex-1 truncate">{c.nev}</span>
                        )}
                        {showKod && !missing && (
                          <span className="text-[10px] font-mono text-slate-400">{c.kod}</span>
                        )}
                        {isSelected && <Check className="size-4 text-emerald-600 shrink-0" />}
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}
