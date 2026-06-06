'use client'

/**
 * SearchableSelect — könnyűsúlyú kereshető legördülő.
 *
 *  - csak a megnevezés látszik (nincs kód-szám)
 *  - egy betű beírására már szűr (ékezet- és kis/nagybetű-érzéketlen)
 *  - kattintásra vagy Enterre választ; Escape bezár
 *
 * NEM importál környezet-függő modult — web és desktop egyaránt használja.
 */

import { useEffect, useMemo, useRef, useState } from 'react'

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
  'flex h-9 w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm shadow-sm ' +
  'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ' +
  'disabled:cursor-not-allowed disabled:opacity-50'

export function SearchableSelect({ options, value, onChange, placeholder = 'Keresés…', className, disabled }: SearchableSelectProps) {
  const selected = options.find((o) => o.id === value) || null
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)
  const ref = useRef<HTMLDivElement>(null)

  // Külső kattintás → bezár
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const filtered = useMemo(() => {
    const q = norm(query.trim())
    if (!q) return options.slice(0, 50)
    return options.filter((o) => norm(o.label).includes(q)).slice(0, 50)
  }, [options, query])

  // Amikor zárva van, az input a kiválasztott címkét mutatja
  const display = open ? query : selected?.label ?? ''

  function choose(id: number) {
    onChange(id)
    setOpen(false)
    setQuery('')
  }

  return (
    <div ref={ref} className={`relative ${className ?? ''}`}>
      <input
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
      {open && (
        <div className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg">
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
        </div>
      )}
    </div>
  )
}
