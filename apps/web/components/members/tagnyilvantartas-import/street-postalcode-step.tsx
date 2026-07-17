'use client'

/**
 * Utca-postakód-egyeztetés wizard lépés (Helység-egyeztetés UTÁN, Preview ELŐTT).
 *
 * ÁTUGORHATÓ — csak akkor jelenik meg, ha az importban vannak multi-postakódú
 * nagyvárosok (Bukarest, Kolozsvár, Marosvásárhely, Brassó, ...).
 *
 * A wizard:
 *   - Csoportosítja az unikális (helyseg+utca) párokat azokra, amik nagyvárosban vannak
 *   - Az `is_multi_postalcode_locality()` döntése alapján szűr
 *   - A lelkész utcánként megadhatja a pontos postakódot (autocomplete: meglévő utcák)
 *   - Üresen hagyhatja → a default helység-postakód lesz fallback
 *   - "Átugrás" gomb: minden default postakód
 */

import { useEffect, useMemo, useState, useTransition } from 'react'
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Loader2,
  MapPinned,
  SkipForward,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  isMultiPostalcodeLocality,
  findStreetsWithPostalcode,
  type StreetCandidate,
} from '@/lib/import/street-postalcode-actions'
// 2026-07-17 (PR-1): a normalize-helper a közös lib-be került, hogy a helység-map
// kulcsképzés és a postakód-kulcsképzés bitre azonos legyen a SQL normalize_name-mel.
import { normalizeNameClient } from '@/lib/import/normalize'
import type { LocalityResolutionMap } from './locality-match-step'

// ─── Típusok ─────────────────────────────────────────────────────────────

export interface StreetPostalcodeMap {
  /** Kulcs: "<helyseg_normalized>|<utca_normalized>", érték: postakód */
  [key: string]: string
}

interface StreetPostalcodeStepProps {
  /** A teljes import-row tömb (a wizard state-ből) */
  rows: Array<Record<string, string | number | null>>
  /** Az XML-fejlécek a Helység és Utca oszlopokra */
  helysegHeader: string | null
  utcaHeader: string | null
  /** A 3. lépés (helység-egyeztetés) eredménye — innen tudjuk, hogy van-e adott helység-locality_id */
  resolvedLocalityMap: LocalityResolutionMap
  /** Felhasználó döntései (state controlled) */
  resolvedPostalcodes: StreetPostalcodeMap
  onPostalcodeChange: (key: string, postalcode: string) => void
  /** Vissza/tovább/kihagyás */
  onBack: () => void
  onContinue: () => void
  onSkip: () => void
}

interface MultiPostalGroup {
  helyseg: string
  localityId: number | null
  isMulti: boolean
  uniqueStreets: Array<{ utca: string; rowCount: number; key: string }>
}

// ─── Komponens ───────────────────────────────────────────────────────────

export function StreetPostalcodeStep({
  rows,
  helysegHeader,
  utcaHeader,
  resolvedLocalityMap,
  resolvedPostalcodes,
  onPostalcodeChange,
  onBack,
  onContinue,
  onSkip,
}: StreetPostalcodeStepProps) {
  const [multiPostalLocalityIds, setMultiPostalLocalityIds] = useState<Set<number>>(new Set())
  const [isLoading, startLoading] = useTransition()

  // ─── Helység+utca csoportosítás (memoizált, nem state-ben) ─────────
  const candidateGroups = useMemo<MultiPostalGroup[]>(() => {
    if (!helysegHeader || !utcaHeader) return []

    // Egyedi (helyseg, utca) párok + sorszám
    const pairMap = new Map<string, { helyseg: string; utca: string; count: number }>()
    for (const row of rows) {
      const helyseg = String(row[helysegHeader] || '').trim()
      const utca = String(row[utcaHeader] || '').trim()
      if (!helyseg || !utca) continue
      const key = `${normalizeNameClient(helyseg)}|${normalizeNameClient(utca)}`
      const existing = pairMap.get(key)
      if (existing) {
        existing.count += 1
      } else {
        pairMap.set(key, { helyseg, utca, count: 1 })
      }
    }

    // Helység-csoportosítás
    const helysegMap = new Map<string, MultiPostalGroup>()
    for (const pair of pairMap.values()) {
      const normHelyseg = normalizeNameClient(pair.helyseg)
      const resolution = resolvedLocalityMap[pair.helyseg]
      let localityId: number | null = null
      if (resolution) {
        if (resolution.kind === 'auto' || resolution.kind === 'manual_pick') {
          localityId = resolution.locality.locality_id
        } else if (resolution.kind === 'new_locality') {
          localityId = resolution.localityId
        }
      }

      const existing = helysegMap.get(normHelyseg)
      const streetEntry = {
        utca: pair.utca,
        rowCount: pair.count,
        key: `${normHelyseg}|${normalizeNameClient(pair.utca)}`,
      }
      if (existing) {
        existing.uniqueStreets.push(streetEntry)
      } else {
        helysegMap.set(normHelyseg, {
          helyseg: pair.helyseg,
          localityId,
          isMulti: false, // backfill később
          uniqueStreets: [streetEntry],
        })
      }
    }

    return Array.from(helysegMap.values())
  }, [rows, helysegHeader, utcaHeader, resolvedLocalityMap])

  // is_multi_postalcode check minden helységre — csak az ID-kat tartjuk Set-ben.
  // A `groups` ezután derived (useMemo) a candidateGroups + multiPostalLocalityIds-ből.
  useEffect(() => {
    startLoading(async () => {
      const ids = new Set<number>()
      for (const g of candidateGroups) {
        if (g.localityId === null) continue
        const result = await isMultiPostalcodeLocality(g.localityId)
        if (result.data) ids.add(g.localityId)
      }
      setMultiPostalLocalityIds(ids)
    })
  }, [candidateGroups])

  // A megjelenítendő groupok: a candidateGroups-ból szűrve, csak multi-postakódúak
  const groups = useMemo<MultiPostalGroup[]>(
    () =>
      candidateGroups
        .filter((g) => g.localityId !== null && multiPostalLocalityIds.has(g.localityId))
        .map((g) => ({ ...g, isMulti: true })),
    [candidateGroups, multiPostalLocalityIds],
  )

  const totalStreets = useMemo(
    () => groups.reduce((sum, g) => sum + g.uniqueStreets.length, 0),
    [groups],
  )
  const filledStreets = useMemo(() => {
    let count = 0
    for (const g of groups) {
      for (const s of g.uniqueStreets) {
        if (resolvedPostalcodes[s.key]) count++
      }
    }
    return count
  }, [groups, resolvedPostalcodes])

  // ─── Render ────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Hero */}
      <div className="rounded-[1.75rem] bg-gradient-to-br from-emerald-50 to-teal-50 p-6 ring-1 ring-emerald-200">
        <div className="flex flex-col items-center gap-3 text-center sm:flex-row sm:text-left">
          <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-[0_18px_36px_-22px_rgba(5,150,105,0.55)]">
            <MapPinned className="size-7" />
          </div>
          <div className="flex-1">
            <p className="font-serif text-xl text-slate-800 sm:text-2xl">
              Utca-postakód-egyeztetés
            </p>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">
              {isLoading
                ? 'Multi-postakódú helységek elemzése…'
                : groups.length === 0
                  ? 'Nincs nagyváros az importban — átugorhatod ezt a lépést.'
                  : `${groups.length} nagyvárosban ${totalStreets} egyedi utcára adhatsz pontos postakódot.`}
            </p>
          </div>
        </div>
      </div>

      {/* Magyarázat (csak ha vannak groups) */}
      {groups.length > 0 && (
        <div className="rounded-2xl bg-amber-50/60 p-4 text-sm text-amber-900 ring-1 ring-amber-100">
          <p className="flex items-start gap-2 font-semibold">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            Multi-postakódú nagyvárosok
          </p>
          <p className="mt-1 leading-relaxed">
            Ezekben a városokban (Bukarest, Kolozsvár, Marosvásárhely…) az utcák szerint
            eltérhet a postakód. Add meg utcánként, vagy hagyd üresen — akkor a város default
            postakódja kerül be (a tag-adatlapon később mindig módosítható).
          </p>
        </div>
      )}

      {/* Loading */}
      {isLoading && groups.length === 0 && (
        <div className="rounded-2xl bg-white/85 p-8 text-center ring-1 ring-slate-100">
          <Loader2 className="mx-auto size-8 animate-spin text-emerald-600" />
          <p className="mt-2 text-sm text-slate-600">Helységek ellenőrzése…</p>
        </div>
      )}

      {/* Helység-csoportok listája */}
      {groups.map((group) => (
        <HelysegStreetGroup
          key={group.helyseg}
          group={group}
          resolvedPostalcodes={resolvedPostalcodes}
          onPostalcodeChange={onPostalcodeChange}
        />
      ))}

      {/* Összegző sáv */}
      {groups.length > 0 && (
        <div className="rounded-2xl bg-emerald-50/60 p-4 text-sm text-emerald-900 ring-1 ring-emerald-100">
          {filledStreets} / {totalStreets} utca postakódja megadva.
          {filledStreets < totalStreets && (
            <span className="ml-1">A többi a város default postakódját kapja.</span>
          )}
        </div>
      )}

      {/* Vissza / Átugrás / Tovább */}
      <div className="flex flex-col-reverse items-stretch gap-2 sm:flex-row sm:justify-between">
        <Button type="button" variant="outline" onClick={onBack} className="rounded-full">
          <ArrowLeft className="mr-1.5 size-4" />
          Vissza
        </Button>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button
            type="button"
            variant="ghost"
            onClick={onSkip}
            className="rounded-full text-slate-500 hover:text-slate-700"
          >
            <SkipForward className="mr-1.5 size-4" />
            Átugrás (default postakód)
          </Button>
          <Button
            type="button"
            onClick={onContinue}
            className="rounded-full bg-emerald-600 hover:bg-emerald-700"
          >
            Tovább az előnézethez
            <ArrowRight className="ml-1.5 size-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Sub-komponens: egy helység csoportja az utcákkal ────────────────────

function HelysegStreetGroup({
  group,
  resolvedPostalcodes,
  onPostalcodeChange,
}: {
  group: MultiPostalGroup
  resolvedPostalcodes: StreetPostalcodeMap
  onPostalcodeChange: (key: string, postalcode: string) => void
}) {
  return (
    <div className="overflow-hidden rounded-[1.5rem] bg-white/85 ring-1 ring-emerald-100 shadow-[0_18px_40px_-30px_rgba(5,150,105,0.25)]">
      <div className="border-b border-emerald-100 bg-emerald-50/40 px-4 py-3">
        <p className="text-sm font-semibold text-slate-800">
          <MapPinned className="mr-1.5 inline size-4 text-emerald-600" />
          {group.helyseg}
          <span className="ml-2 text-xs font-normal text-slate-500">
            ({group.uniqueStreets.length} egyedi utca)
          </span>
        </p>
      </div>

      <div className="divide-y divide-slate-50">
        {group.uniqueStreets.map((street) => (
          <StreetRow
            key={street.key}
            localityId={group.localityId}
            street={street}
            postalcode={resolvedPostalcodes[street.key] || ''}
            onPostalcodeChange={(v) => onPostalcodeChange(street.key, v)}
          />
        ))}
      </div>
    </div>
  )
}

function StreetRow({
  localityId,
  street,
  postalcode,
  onPostalcodeChange,
}: {
  localityId: number | null
  street: { utca: string; rowCount: number; key: string }
  postalcode: string
  onPostalcodeChange: (v: string) => void
}) {
  const [suggestions, setSuggestions] = useState<StreetCandidate[]>([])
  const [isSearching, startSearching] = useTransition()

  // Autocomplete: amikor a felhasználó beír valamit, keresünk
  useEffect(() => {
    if (!localityId || !street.utca || street.utca.trim() === '') return
    startSearching(async () => {
      const result = await findStreetsWithPostalcode(localityId, street.utca, 10)
      if (result.data) {
        setSuggestions(result.data.filter((s) => s.postalcode && s.postalcode.trim() !== ''))
      }
    })
  }, [localityId, street.utca])

  return (
    <div className="px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-700">{street.utca}</p>
          <p className="mt-0.5 text-xs text-slate-400">
            {street.rowCount} sor használja
          </p>
          {/* Suggestion chips */}
          {suggestions.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {suggestions.slice(0, 3).map((s) => (
                <button
                  key={s.street_id}
                  type="button"
                  onClick={() => {
                    onPostalcodeChange(s.postalcode || '')
                  }}
                  className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100"
                >
                  {s.postalcode}
                </button>
              ))}
              {isSearching && (
                <span className="inline-flex items-center text-xs text-slate-400">
                  <Loader2 className="size-3 animate-spin" />
                </span>
              )}
            </div>
          )}
        </div>
        <input
          type="text"
          value={postalcode}
          onChange={(e) => onPostalcodeChange(e.target.value)}
          placeholder="postakód"
          maxLength={16}
          className="h-9 w-32 rounded-lg border border-slate-200 bg-white px-3 text-right text-sm font-mono text-slate-700 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200"
        />
      </div>
    </div>
  )
}
