'use client'

/**
 * ÉnekekField — okos ének-lista mező a munkanaplóhoz.
 *
 * Érték-formátum: vesszővel tagolt ének-azonosító lista, pl. '153, 25, 430, 400b'.
 *
 * Működés:
 *   - Fókuszkor tölti be dinamikus import()-tal a @kartoteka/enekeskonyv csomagot
 *     (a 608 KB-os korpusz miatt NEM statikus import!) — amíg tölt, sima inputként megy.
 *   - Az éppen gépelt UTOLSÓ tokenre javaslat-lenyíló: szám-szerű tokenre a szám
 *     szerinti ének(ek) (betűs változatokkal), szövegre cím/szöveg szerinti keresés
 *     (ékezet-toleránsan, max 8 találat). Választáskor a token az ének azonosítójára
 *     cserélődik, és vessző+szóköz után új token kezdhető.
 *   - A felismert számok címe a mező alatt segédszövegként (compact módban a mező
 *     title-tooltipjeként), az ismeretlen token finom jelzéssel.
 *   - Billentyűzet: fel/le a javaslatok közt, Enter kiválaszt (NEM buborékozik a
 *     sor-mentő Enterhez), Escape zár. A kapott onKeyDown a saját kezelés UTÁN fut,
 *     a lenyíló által elfogyasztott eseményeknél nem hívódik.
 *   - Javaslat-kattintás nem vált ki idő előtti blur-mentést (mousedown-preventDefault).
 *
 * compact=true: cella-mód (keret nélküli, kompakt padding, focus-ring);
 * compact=false/undefined: normál Input-kinézet (dialógusban is használható).
 */

import * as React from 'react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'

import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
// Type-only import: fordításkor törlődik, a korpuszt NEM húzza be a fő chunkba.
import type { Enek } from '@kartoteka/enekeskonyv'

type EnekeskonyvModule = typeof import('@kartoteka/enekeskonyv')

// Module-szintű cache: a csomag egyszer töltődik be, minden mező-példány közös.
let enekeskonyvModule: EnekeskonyvModule | null = null
let enekeskonyvPromise: Promise<EnekeskonyvModule> | null = null

function loadEnekeskonyv(): Promise<EnekeskonyvModule> {
  if (!enekeskonyvPromise) {
    enekeskonyvPromise = import('@kartoteka/enekeskonyv').then((mod) => {
      enekeskonyvModule = mod
      return mod
    })
    // Hiba (pl. hálózat) esetén a következő fókusz újrapróbálhassa
    void enekeskonyvPromise.catch(() => {
      enekeskonyvPromise = null
    })
  }
  return enekeskonyvPromise
}

/** Cella-mód: a közös Input keret nélküli, kompakt változata (tw-merge felülírásokkal). */
const COMPACT_INPUT_CLASSES =
  'h-8 rounded-md border-0 bg-transparent px-2 py-1 shadow-none dark:bg-transparent ' +
  'focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-ring/40 dark:focus-visible:bg-background'

export interface EnekekFieldProps {
  value: string
  onChange: (v: string) => void
  onBlur?: () => void
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>
  className?: string
  placeholder?: string
  /** true: cella-mód (keret nélküli, kompakt); false/undefined: normál Input-kinézet. */
  compact?: boolean
  id?: string
}

export function EnekekField({
  value,
  onChange,
  onBlur,
  onKeyDown,
  className,
  placeholder,
  compact,
  id,
}: EnekekFieldProps) {
  const [libReady, setLibReady] = useState(enekeskonyvModule !== null)
  const [focused, setFocused] = useState(false)
  /** A lenyíló csak gépelés után nyílik (fókusz önmagában nem nyitja). */
  const [listOpen, setListOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const mountedRef = useRef(true)
  const listId = useId()

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // Az éppen gépelt UTOLSÓ token (az utolsó vessző utáni rész)
  const lastToken = useMemo(() => value.slice(value.lastIndexOf(',') + 1).trim(), [value])

  const suggestions = useMemo<Enek[]>(() => {
    const mod = enekeskonyvModule
    if (!libReady || !mod || !listOpen || lastToken === '') return []
    return mod.searchEnek(lastToken, 8)
  }, [libReady, listOpen, lastToken])

  const open = focused && listOpen && suggestions.length > 0

  // Új találati lista → a kiemelés az elejére ugrik
  useEffect(() => {
    setHighlight(0)
  }, [suggestions])

  // A már beírt tokenek feloldása a segédszöveghez (ismeretlen = enek: null)
  const recognized = useMemo(() => {
    const mod = enekeskonyvModule
    if (!libReady || !mod) return []
    return value
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
      .map((token) => ({ token, enek: mod.getEnek(token) }))
  }, [libReady, value])

  function handleFocus() {
    setFocused(true)
    setListOpen(false)
    if (!enekeskonyvModule) {
      loadEnekeskonyv()
        .then(() => {
          if (mountedRef.current) setLibReady(true)
        })
        .catch(() => {
          /* betöltési hiba: a mező sima inputként működik tovább */
        })
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    onChange(e.target.value)
    setListOpen(true)
  }

  /** Javaslat kiválasztása: az utolsó token cserélődik az ének azonosítójára. */
  function pick(enek: Enek) {
    const lastComma = value.lastIndexOf(',')
    const head = lastComma >= 0 ? `${value.slice(0, lastComma + 1).trimEnd()} ` : ''
    onChange(`${head}${enek.azonosito}, `)
    setListOpen(false)
    // Biztonsági fókusz-visszaadás (a mousedown-preventDefault miatt elvileg megmaradt)
    inputRef.current?.focus()
  }

  const handleKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (open) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlight((h) => Math.min(h + 1, suggestions.length - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlight((h) => Math.max(h - 1, 0))
        return
      }
      if (e.key === 'Enter') {
        // NE buborékozzon a sor-mentő Enterhez, amíg a lenyíló nyitva van
        e.preventDefault()
        e.stopPropagation()
        const s = suggestions[highlight]
        if (s) pick(s)
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        setListOpen(false)
        return
      }
    }
    // A saját kezelés UTÁN a kapott handler (el nem fogyasztott eseményekre)
    onKeyDown?.(e)
  }

  function handleBlur() {
    setFocused(false)
    setListOpen(false)
    // Lógó elválasztók levágása ('153, ' → '153'), hogy tiszta érték mentődjön
    const cleaned = value.replace(/[\s,]+$/, '')
    if (cleaned !== value) onChange(cleaned)
    onBlur?.()
  }

  // Compact módban a felismert címek a mező title-tooltipjében
  const tooltip =
    compact && recognized.length > 0
      ? recognized
          .map((r) => (r.enek ? `${r.enek.azonosito} · ${r.enek.cim ?? r.enek.elsoSor}` : `${r.token} — nem található`))
          .join('\n')
      : undefined

  return (
    <div className="relative">
      <Input
        ref={inputRef}
        id={id}
        type="text"
        value={value}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={placeholder ?? 'Pl. 153, 25, 430'}
        title={tooltip}
        autoComplete="off"
        spellCheck={false}
        role="combobox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? `${listId}-opt-${highlight}` : undefined}
        aria-autocomplete="list"
        className={cn(compact && COMPACT_INPUT_CLASSES, className)}
      />

      {/* Javaslat-lenyíló — abszolút pozíció, érintésbarát sorokkal */}
      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute top-full left-0 z-50 mt-1 max-h-64 w-full max-w-[min(90vw,26rem)] min-w-64 overflow-y-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md"
        >
          {suggestions.map((enek, idx) => (
            <li
              key={enek.azonosito}
              id={`${listId}-opt-${idx}`}
              role="option"
              aria-selected={idx === highlight}
              // preventDefault: a kattintás NE vegye el a fókuszt az inputról,
              // különben a blur-mentés a kiválasztás ELŐTT futna le
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(enek)}
              onMouseEnter={() => setHighlight(idx)}
              className={cn(
                'flex cursor-pointer items-baseline gap-2 rounded-md px-2.5 py-2 text-sm',
                idx === highlight && 'bg-accent text-accent-foreground',
              )}
            >
              <span className="shrink-0 font-medium tabular-nums">{enek.azonosito}</span>
              <span className={cn('min-w-0 flex-1 truncate', idx === highlight ? 'opacity-90' : 'text-muted-foreground')}>
                {enek.cim ?? enek.elsoSor}
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* Felismert énekek címei a mező alatt (csak normál módban) */}
      {!compact && recognized.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          {recognized.map((r, i) =>
            r.enek ? (
              <span key={`${r.token}-${i}`} className="max-w-full truncate">
                <span className="font-medium">{r.enek.azonosito}</span> · {r.enek.cim ?? r.enek.elsoSor}
              </span>
            ) : (
              <span key={`${r.token}-${i}`} className="italic opacity-70">
                {r.token} — nem található
              </span>
            ),
          )}
        </div>
      )}
    </div>
  )
}
