'use client'

/**
 * Tag-kereső kombo-box az anyakönyvi modalokhoz.
 *
 * Endre kérése (2026-04-30): "Az okos keresőkben látszódjon az életkor,
 * a lakhely és utca is, hogy az azonos nevűekkel ne akadjunk össze!"
 *
 * Funkciók:
 *   - Élő keresés (debounce 300ms) a searchMemberForRegistry action-ön keresztül
 *   - Találatok kibővített megjelenítése: csaladnev k_nev | életkor év | adrlocality | adrstreet c_szam
 *   - Opcionális gender-szűrő (férfi/nő — esketésnél vőlegény/menyasszony)
 *   - Kattintás → kiválasztás, callback hívás
 *   - Esc / outside click → bezárás
 *   - Kiválasztott tag megjelenik a trigger-ben életkorral + lakhellyel
 */

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { Check, Loader2, MapPin, Search, User, X } from 'lucide-react'

import { searchMemberForRegistry } from '@/app/(dashboard)/anyakonyv/actions'

export interface MemberSearchResult {
  id: number
  csaladnev: string | null
  k_nev: string | null
  ferfi: boolean | null
  sz_datum: string | null
  cnp: string | null
  c_szam: string | null
  adrlocality?: { name: string | null } | null
  adrstreet?: { name: string | null } | null
}

interface MemberSearchSelectProps {
  /** Kiválasztott tag — null ha még nincs */
  value: MemberSearchResult | null
  onChange: (member: MemberSearchResult | null) => void
  /** Csak férfiakat (true) vagy csak nőket (false) — null ha nincs szűrés */
  genderFilter?: boolean | null
  placeholder?: string
  /** Címke a választható kategóriához — pl. "Vőlegény" / "Menyasszony" / "Szülő" */
  label?: string
  /** Ha igaz, kompakt mód (kisebb input + dropdown) */
  compact?: boolean
}

function calcAge(szDatum: string | null): number | null {
  if (!szDatum) return null
  const m = szDatum.match(/^(\d{4})/)
  if (!m) return null
  const year = parseInt(m[1])
  return new Date().getFullYear() - year
}

function formatAddress(member: MemberSearchResult): string {
  const parts: string[] = []
  const helyseg = member.adrlocality?.name
  const utca = member.adrstreet?.name
  const szam = member.c_szam
  if (helyseg) parts.push(helyseg)
  if (utca) {
    const utcaTrimmed = utca.trim()
    const hasStreetSuffix = /\b(u\.|út|utca|tér|krt\.|körút)\b/i.test(utcaTrimmed)
    const utcaPart = hasStreetSuffix ? utcaTrimmed : `${utcaTrimmed} u.`
    if (szam) parts.push(`${utcaPart} ${szam}`)
    else parts.push(utcaPart)
  } else if (szam) {
    parts.push(szam)
  }
  return parts.join(', ')
}

export function MemberSearchSelect({
  value,
  onChange,
  genderFilter,
  placeholder = 'Keresés (2+ karakter)…',
  compact = false,
}: MemberSearchSelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<MemberSearchResult[]>([])
  const [isSearching, startSearching] = useTransition()
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const runSearch = useCallback((q: string) => {
    if (q.trim().length < 2) {
      setResults([])
      return
    }
    startSearching(async () => {
      const res = await searchMemberForRegistry(q, genderFilter)
      setResults((res || []) as unknown as MemberSearchResult[])
    })
  }, [genderFilter])

  // Debounced keresés
  useEffect(() => {
    if (!open) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => runSearch(query), 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, open, runSearch])

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

  // Esc → bezárás
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
    if (open) setTimeout(() => inputRef.current?.focus(), 50)
  }, [open])

  const sizeClasses = compact
    ? 'h-8 text-xs px-2'
    : 'h-10 text-sm px-3'

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={`flex w-full items-center justify-between gap-2 rounded-lg border bg-white text-left shadow-sm transition focus:outline-none focus:ring-2 ${
          open ? 'border-blue-400 ring-blue-200' : value ? 'border-emerald-300 bg-emerald-50/30' : 'border-slate-300 ring-slate-200'
        } ${sizeClasses}`}
      >
        <span className="min-w-0 flex-1 truncate">
          {value ? (
            <span className="text-slate-800">
              <span className="font-medium">{value.csaladnev} {value.k_nev}</span>
              {(() => {
                const age = calcAge(value.sz_datum)
                return age !== null ? <span className="ml-1.5 text-[11px] text-slate-500">{age} éves</span> : null
              })()}
              {value.adrlocality?.name && (
                <span className="ml-1.5 text-[11px] text-slate-500">— {value.adrlocality.name}</span>
              )}
            </span>
          ) : (
            <span className="text-slate-400">{placeholder}</span>
          )}
        </span>
        {value && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation()
              onChange(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                e.stopPropagation()
                onChange(null)
              }
            }}
            className="shrink-0 cursor-pointer text-slate-400 hover:text-slate-700"
            aria-label="Választás visszavonása"
          >
            <X className="size-4" />
          </span>
        )}
        <Search className="shrink-0 size-4 text-slate-400" />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-[0_24px_60px_-30px_rgba(15,23,42,0.5)]">
          <div className="flex items-center gap-2 border-b border-slate-100 p-2">
            <Search className="size-4 shrink-0 text-slate-400" />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Keresés családnév, keresztnév szerint…"
              className="flex-1 bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
            />
            {isSearching && <Loader2 className="size-4 shrink-0 animate-spin text-blue-500" />}
          </div>

          <div className="max-h-72 overflow-y-auto">
            {!isSearching && query.trim().length >= 2 && results.length === 0 && (
              <div className="p-4 text-center text-xs italic text-slate-500">
                Nincs találat — próbáld a családnév + keresztnév formát.
              </div>
            )}
            {query.trim().length < 2 && (
              <div className="p-4 text-center text-xs text-slate-400">
                Írj be legalább 2 karaktert a kereséshez.
              </div>
            )}
            {results.map((m) => {
              const isPicked = value?.id === m.id
              const age = calcAge(m.sz_datum)
              const address = formatAddress(m)
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    onChange(m)
                    setOpen(false)
                    setQuery('')
                  }}
                  className={`flex w-full items-start justify-between gap-2 border-b border-slate-100 px-3 py-2 text-left transition last:border-b-0 ${
                    isPicked ? 'bg-emerald-50' : 'hover:bg-blue-50/50'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <User className="size-3.5 shrink-0 text-slate-400" />
                      <span className="text-sm font-medium text-slate-800">
                        {m.csaladnev} {m.k_nev}
                      </span>
                      {m.ferfi !== null && (
                        <span className="text-xs text-slate-400">
                          {m.ferfi ? '♂' : '♀'}
                        </span>
                      )}
                      {age !== null && (
                        <span className="text-xs text-slate-500">{age} éves</span>
                      )}
                      {m.sz_datum && (
                        <span className="text-[10px] text-slate-400">
                          (sz: {m.sz_datum.split('T')[0]})
                        </span>
                      )}
                    </div>
                    {address && (
                      <div className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-500">
                        <MapPin className="size-3 shrink-0" />
                        {address}
                      </div>
                    )}
                  </div>
                  {isPicked && <Check className="size-4 shrink-0 text-emerald-600" />}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
