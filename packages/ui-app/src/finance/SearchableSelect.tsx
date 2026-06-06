'use client'

/**
 * SearchableSelect — könnyűsúlyú kereshető legördülő.
 *
 *  - csak a megnevezés látszik (nincs kód-szám)
 *  - egy betű beírására már szűr (ékezet- és kis/nagybetű-érzéketlen)
 *  - a lista PORTÁLON keresztül a <body>-ba renderelődik, fix pozícióval, így
 *    semmilyen `overflow:hidden`/scroll-konténer (modal, táblázat) NEM vágja le
 *
 * NEM importál környezet-függő modult — web és desktop egyaránt használja.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export interface SearchableOption {
  id: number
  label: string
}

export interface SearchableSelectProps {
  options: SearchableOption[]
  value: number | ''
  onChange: (id: number | '') => void
  placeholder?: string
  className?: string
  disabled?: boolean
}

function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

const baseInput =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-2 py-1 pr-6 text-sm shadow-sm ' +
  'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ' +
  'disabled:cursor-not-allowed disabled:opacity-50'

export function SearchableSelect({ options, value, onChange, placeholder = 'Keresés…', className, disabled }: SearchableSelectProps) {
  const selected = options.find((o) => o.id === value) || null
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)
  const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const filtered = useMemo(() => {
    const q = norm(query.trim())
    if (!q) return options.slice(0, 100)
    return options.filter((o) => norm(o.label).includes(q)).slice(0, 100)
  }, [options, query])

  function reposition() {
    const el = inputRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setCoords({ top: r.bottom + 4, left: r.left, width: r.width })
  }

  useLayoutEffect(() => {
    if (open) reposition()
  }, [open])

  useEffect(() => {
    if (!open) return
    const onScrollOrResize = () => reposition()
    window.addEventListener('scroll', onScrollOrResize, true)
    window.addEventListener('resize', onScrollOrResize)
    function onDoc(e: MouseEvent) {
      const t = e.target as Node
      if (wrapRef.current?.contains(t) || listRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true)
      window.removeEventListener('resize', onScrollOrResize)
      document.removeEventListener('mousedown', onDoc)
    }
  }, [open])

  const display = open ? query : selected?.label ?? ''

  function choose(id: number) {
    onChange(id)
    setOpen(false)
    setQuery('')
  }

  const dropdown = open && coords && typeof document !== 'undefined'
    ? createPortal(
        <div
          ref={listRef}
          style={{ position: 'fixed', top: coords.top, left: coords.left, width: coords.width, zIndex: 9999 }}
          className="max-h-60 overflow-auto rounded-md border border-slate-200 bg-white py-1 shadow-xl"
        >
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-xs text-slate-400">Nincs találat</div>
          ) : (
            filtered.map((o, i) => (
              <button
                key={o.id}
                type="button"
                className={`block w-full px-3 py-1.5 text-left text-sm ${i === highlight ? 'bg-teal-50 text-teal-800' : 'hover:bg-slate-50'}`}
                onMouseEnter={() => setHighlight(i)}
                onMouseDown={(e) => { e.preventDefault(); choose(o.id) }}
              >{o.label}</button>
            ))
          )}
        </div>,
        document.body,
      )
    : null

  return (
    <div ref={wrapRef} className={`relative ${className ?? ''}`}>
      <input
        ref={inputRef}
        className={baseInput}
        value={display}
        placeholder={selected ? selected.label : placeholder}
        disabled={disabled}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); setHighlight(0) }}
        onFocus={() => { setOpen(true); setQuery('') }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setHighlight((h) => Math.min(h + 1, filtered.length - 1)) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight((h) => Math.max(h - 1, 0)) }
          else if (e.key === 'Enter') { if (open && filtered[highlight]) { e.preventDefault(); choose(filtered[highlight].id) } }
          else if (e.key === 'Escape') { setOpen(false) }
        }}
      />
      {selected && !open && (
        <button
          type="button"
          aria-label="Törlés"
          className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500"
          onMouseDown={(e) => { e.preventDefault(); onChange(''); setQuery('') }}
        >×</button>
      )}
      {dropdown}
    </div>
  )
}
