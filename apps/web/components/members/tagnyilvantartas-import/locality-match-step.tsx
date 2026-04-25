'use client'

/**
 * Helység-egyeztetés wizard lépés (Preview ELŐTT, Mapping UTÁN).
 *
 * Csak akkor jelenik meg, ha vannak nem-egyértelmű helységek az importban:
 *   - exact_single → automatikus, nem mutatja
 *   - exact_multiple → manuális választás (több megyében ugyanaz a név)
 *   - fuzzy_only → "Talán?" review jelölt-jelzéssel
 *   - no_match → "Új helység" / "Külföldi" / "Üresen hagy" 3 opció
 *
 * A felhasználó döntései eltárolódnak a `resolvedMap` (Map<input, ResolvedLocality>)
 * objektumban, amit a wizard átad az import RPC-nek mint `p_resolved_locality_map`.
 */

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Globe,
  Home,
  Loader2,
  MapPin,
  Plus,
  RefreshCw,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  findLocalityMatchBatch,
  addLocalityForReview,
  listCountries,
  listCounties,
  type LocalityCandidate,
  type LocalitySearchResult,
} from '@/lib/import/locality-matching-actions'

// ─── Típusok ─────────────────────────────────────────────────────────────

export type LocalityResolution =
  | { kind: 'auto'; locality: LocalityCandidate }
  | { kind: 'manual_pick'; locality: LocalityCandidate }
  | { kind: 'new_locality'; localityId: number; name: string }
  | { kind: 'foreign'; countryId: number; countryName: string }
  | { kind: 'skip' }

export interface LocalityResolutionMap {
  /** Kulcs: az XML-ben szereplő helység-név (eredeti, nem normalizált) */
  [helysegInput: string]: LocalityResolution
}

interface LocalityMatchStepProps {
  /** Az importban szereplő egyedi helység-nevek listája */
  uniqueLocalityInputs: string[]
  /** Felhasználó döntései (state controlled) */
  resolvedMap: LocalityResolutionMap
  /** Update callback */
  onResolutionChange: (input: string, resolution: LocalityResolution) => void
  /** Vissza/tovább */
  onBack: () => void
  onContinue: () => void
}

interface SearchedItem {
  input: string
  result: LocalitySearchResult
}

interface CountryOption {
  id: number
  name: string
  sname: string | null
}

interface CountyOption {
  id: number
  name: string
  sname: string | null
}

// ─── Komponens ───────────────────────────────────────────────────────────

export function LocalityMatchStep({
  uniqueLocalityInputs,
  resolvedMap,
  onResolutionChange,
  onBack,
  onContinue,
}: LocalityMatchStepProps) {
  const [items, setItems] = useState<SearchedItem[]>([])
  const [isLoading, startLoading] = useTransition()
  const [countries, setCountries] = useState<CountryOption[]>([])
  const [counties, setCounties] = useState<CountyOption[]>([])
  const [isAddingNew, setIsAddingNew] = useState<string | null>(null)
  const [newLocalityName, setNewLocalityName] = useState('')
  const [newLocalityCountyId, setNewLocalityCountyId] = useState<number | null>(null)

  // ─── Indító batch keresés ──────────────────────────────────
  useEffect(() => {
    if (uniqueLocalityInputs.length === 0) {
      setItems([])
      return
    }
    startLoading(async () => {
      const result = await findLocalityMatchBatch(uniqueLocalityInputs, 'RO', 0.6)
      if (result.error || !result.data) {
        toast.error(result.error || 'Sikertelen helység-keresés.')
        return
      }
      setItems(result.data.map((r) => ({ input: r.input, result: r })))

      // Auto-resolve: ha exact_single, automatikusan beállítjuk
      result.data.forEach((r) => {
        if (r.resolution === 'exact_single' && r.candidates[0]) {
          onResolutionChange(r.input, { kind: 'auto', locality: r.candidates[0] })
        }
      })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uniqueLocalityInputs])

  // ─── Országok + megyék betöltése (új helység / külföld funkcióhoz) ─
  useEffect(() => {
    listCountries().then((r) => setCountries(r.data || []))
    listCounties('RO').then((r) => setCounties(r.data || []))
  }, [])

  // ─── Statisztikák ───────────────────────────────────────────
  const stats = useMemo(() => {
    const auto = items.filter((i) => i.result.resolution === 'exact_single').length
    const ambiguous = items.filter((i) =>
      ['exact_multiple', 'fuzzy_only', 'no_match'].includes(i.result.resolution),
    ).length
    const resolved = Object.values(resolvedMap).filter((r) => r.kind !== 'skip').length
    const unresolved = items.length - resolved
    return { auto, ambiguous, resolved, unresolved }
  }, [items, resolvedMap])

  // Csak az ambiguous tételeket mutatjuk a részletes listában
  const ambiguousItems = useMemo(
    () =>
      items.filter((i) =>
        ['exact_multiple', 'fuzzy_only', 'no_match'].includes(i.result.resolution),
      ),
    [items],
  )

  const allResolved = stats.unresolved === 0

  // ─── Új helység handler ────────────────────────────────────
  const handleAddNew = useCallback(
    (input: string, isRomanian: boolean) => {
      if (!newLocalityName.trim()) {
        toast.error('Add meg a helység nevét.')
        return
      }
      startLoading(async () => {
        const result = await addLocalityForReview(newLocalityName, {
          countyId: isRomanian ? newLocalityCountyId ?? undefined : undefined,
          countryCode: 'RO',
          reviewSource: 'tagnyilvantartas-import-2026-04-26',
        })
        if (result.error || !result.localityId) {
          toast.error(result.error || 'Sikertelen helység beszúrás.')
          return
        }
        onResolutionChange(input, {
          kind: 'new_locality',
          localityId: result.localityId,
          name: newLocalityName,
        })
        toast.success(`"${newLocalityName}" hozzáadva (felülvizsgálandó).`)
        setIsAddingNew(null)
        setNewLocalityName('')
        setNewLocalityCountyId(null)
      })
    },
    [newLocalityName, newLocalityCountyId, onResolutionChange],
  )

  // ─── Render ────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Hero */}
      <div className="rounded-[1.75rem] bg-gradient-to-br from-emerald-50 to-teal-50 p-6 ring-1 ring-emerald-200">
        <div className="flex flex-col items-center gap-3 text-center sm:flex-row sm:text-left">
          <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-[0_18px_36px_-22px_rgba(5,150,105,0.55)]">
            <MapPin className="size-7" />
          </div>
          <div className="flex-1">
            <p className="font-serif text-xl text-slate-800 sm:text-2xl">Helység-egyeztetés</p>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">
              {isLoading
                ? 'Helységek keresése a román adatbázisban…'
                : stats.ambiguous === 0
                  ? `Mind a ${items.length} helység egyértelmű — folytathatod az előnézethez.`
                  : `${stats.ambiguous} helység nem egyértelmű — egyeztesd, mielőtt importálnánk.`}
            </p>
          </div>
        </div>
      </div>

      {/* Statisztikák */}
      <div className="grid gap-3 sm:grid-cols-4">
        <StatCard label="Összes helység" value={items.length} tone="slate" icon={<Home className="size-4" />} />
        <StatCard label="Automatikus" value={stats.auto} tone="emerald" icon={<CheckCircle2 className="size-4" />} />
        <StatCard label="Egyeztetendő" value={stats.ambiguous} tone={stats.ambiguous > 0 ? 'amber' : 'slate'} icon={<AlertTriangle className="size-4" />} />
        <StatCard label="Megfontolva" value={stats.resolved} tone="indigo" icon={<CheckCircle2 className="size-4" />} />
      </div>

      {/* Loading */}
      {isLoading && items.length === 0 && (
        <div className="rounded-2xl bg-white/85 p-8 text-center ring-1 ring-slate-100">
          <Loader2 className="mx-auto size-8 animate-spin text-emerald-600" />
          <p className="mt-2 text-sm text-slate-600">Helység-elemzés folyamatban…</p>
        </div>
      )}

      {/* Ambiguous tételek listája */}
      {ambiguousItems.length > 0 && (
        <div className="space-y-3">
          {ambiguousItems.map((item) => {
            const resolution = resolvedMap[item.input]
            return (
              <AmbiguousLocalityCard
                key={item.input}
                item={item}
                resolution={resolution}
                onResolutionChange={(r) => onResolutionChange(item.input, r)}
                onAddNewClicked={() => {
                  setIsAddingNew(item.input)
                  setNewLocalityName(item.input)
                }}
                onForeignSelected={(country) => {
                  onResolutionChange(item.input, {
                    kind: 'foreign',
                    countryId: country.id,
                    countryName: country.name,
                  })
                }}
                countries={countries}
              />
            )
          })}
        </div>
      )}

      {/* Új helység modal (egyszerű inline) */}
      {isAddingNew && (
        <NewLocalityInlineModal
          input={isAddingNew}
          name={newLocalityName}
          onNameChange={setNewLocalityName}
          countyId={newLocalityCountyId}
          onCountyChange={setNewLocalityCountyId}
          counties={counties}
          isLoading={isLoading}
          onCancel={() => {
            setIsAddingNew(null)
            setNewLocalityName('')
            setNewLocalityCountyId(null)
          }}
          onConfirm={(isRomanian) => handleAddNew(isAddingNew, isRomanian)}
        />
      )}

      {/* Vissza / Tovább */}
      <div className="flex flex-col-reverse items-stretch gap-2 sm:flex-row sm:justify-between">
        <Button type="button" variant="outline" onClick={onBack} className="rounded-full">
          <ArrowLeft className="mr-1.5 size-4" />
          Vissza az oszlopokhoz
        </Button>
        <Button
          type="button"
          onClick={onContinue}
          disabled={!allResolved}
          className="rounded-full bg-emerald-600 hover:bg-emerald-700"
        >
          {allResolved ? 'Tovább az előnézethez' : `Még ${stats.unresolved} helység vár döntésre`}
          <ArrowRight className="ml-1.5 size-4" />
        </Button>
      </div>
    </div>
  )
}

// ─── Sub-komponensek ──────────────────────────────────────────────────

function AmbiguousLocalityCard({
  item,
  resolution,
  onResolutionChange,
  onAddNewClicked,
  onForeignSelected,
  countries,
}: {
  item: SearchedItem
  resolution: LocalityResolution | undefined
  onResolutionChange: (r: LocalityResolution) => void
  onAddNewClicked: () => void
  onForeignSelected: (country: CountryOption) => void
  countries: CountryOption[]
}) {
  const [showForeignDropdown, setShowForeignDropdown] = useState(false)
  const isResolved = resolution && resolution.kind !== 'skip'

  return (
    <div
      className={`overflow-hidden rounded-[1.5rem] bg-white/85 ring-1 shadow-[0_18px_40px_-30px_rgba(15,118,110,0.25)] ${
        isResolved ? 'ring-emerald-100' : 'ring-amber-100'
      }`}
    >
      {/* Header */}
      <div className={`px-4 py-3 ${isResolved ? 'bg-emerald-50/40' : 'bg-amber-50/40'}`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold text-slate-800">
              <MapPin className="mr-1 inline size-4 text-amber-600" />
              {item.input}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              {item.result.resolution === 'exact_multiple' &&
                `${item.result.candidates.length} jelölt — több megyében`}
              {item.result.resolution === 'fuzzy_only' &&
                `${item.result.candidates.length} hasonló helység (fuzzy)`}
              {item.result.resolution === 'no_match' && 'Nincs találat — más opciók szükségesek'}
            </p>
          </div>
          {isResolved && (
            <span className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
              <CheckCircle2 className="size-3.5" /> Megfontolva
            </span>
          )}
        </div>
      </div>

      {/* Jelöltek listája */}
      {item.result.candidates.length > 0 && (
        <div className="border-t border-slate-100 p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Jelöltek a román adatbázisból:
          </p>
          <div className="space-y-1.5">
            {item.result.candidates.map((c) => {
              const isPicked =
                resolution?.kind === 'manual_pick' && resolution.locality.locality_id === c.locality_id
              return (
                <button
                  key={c.locality_id}
                  type="button"
                  onClick={() =>
                    onResolutionChange({ kind: 'manual_pick', locality: c })
                  }
                  className={`w-full rounded-xl border p-3 text-left transition ${
                    isPicked
                      ? 'border-emerald-300 bg-emerald-50/80 shadow-[0_8px_20px_-14px_rgba(5,150,105,0.5)]'
                      : 'border-slate-200 bg-white hover:border-emerald-200 hover:bg-emerald-50/30'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-800">
                        {c.name}
                        {c.name_hu && c.name_hu !== c.name && (
                          <span className="ml-2 text-xs font-normal text-slate-500">
                            ({c.name_hu})
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {c.county_name} megye
                        {c.default_postalcode && ` • ${c.default_postalcode}`}
                        {c.match_type === 'fuzzy' && (
                          <span className="ml-1 text-amber-600">
                            • hasonlóság: {Math.round(c.similarity * 100)}%
                          </span>
                        )}
                        {c.match_type === 'alias' && (
                          <span className="ml-1 text-sky-600">• alias-ból</span>
                        )}
                      </p>
                    </div>
                    {isPicked && <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Egyéb opciók (új helység, külföld) */}
      <div className="border-t border-slate-100 bg-slate-50/40 p-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          Vagy:
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onAddNewClicked}
            className="rounded-full text-xs"
          >
            <Plus className="mr-1 size-3.5" />
            Új helység (felülvizsgálandó)
          </Button>
          <div className="relative">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowForeignDropdown((v) => !v)}
              className="rounded-full text-xs"
            >
              <Globe className="mr-1 size-3.5" />
              Külföldi cím
            </Button>
            {showForeignDropdown && (
              <div className="absolute left-0 top-full z-10 mt-1 max-h-60 w-64 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
                {countries.length === 0 ? (
                  <p className="p-3 text-xs text-slate-500">Országlista betöltése…</p>
                ) : (
                  countries.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        onForeignSelected(c)
                        setShowForeignDropdown(false)
                      }}
                      className="block w-full px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-emerald-50"
                    >
                      {c.name}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onResolutionChange({ kind: 'skip' })}
            className="rounded-full text-xs text-slate-500 hover:text-slate-700"
          >
            Üresen hagyom
          </Button>
        </div>
      </div>

      {/* Resolution summary */}
      {isResolved && (
        <div className="border-t border-emerald-100 bg-emerald-50/30 px-4 py-2 text-xs text-emerald-800">
          <CheckCircle2 className="mr-1 inline size-3.5" />
          {resolution.kind === 'auto' && (
            <>
              Automatikus: <strong>{resolution.locality.name}</strong> ({resolution.locality.county_name})
            </>
          )}
          {resolution.kind === 'manual_pick' && (
            <>
              Választott: <strong>{resolution.locality.name}</strong>
              {resolution.locality.default_postalcode && ` • ${resolution.locality.default_postalcode}`}
            </>
          )}
          {resolution.kind === 'new_locality' && (
            <>
              Új helység: <strong>{resolution.name}</strong> (felülvizsgálandó, ID #{resolution.localityId})
            </>
          )}
          {resolution.kind === 'foreign' && (
            <>
              Külföldi cím: <strong>{resolution.countryName}</strong>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function NewLocalityInlineModal({
  input,
  name,
  onNameChange,
  countyId,
  onCountyChange,
  counties,
  isLoading,
  onCancel,
  onConfirm,
}: {
  input: string
  name: string
  onNameChange: (v: string) => void
  countyId: number | null
  onCountyChange: (v: number | null) => void
  counties: CountyOption[]
  isLoading: boolean
  onCancel: () => void
  onConfirm: (isRomanian: boolean) => void
}) {
  const [step, setStep] = useState<'choose' | 'romanian' | 'foreign'>('choose')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-md rounded-[1.5rem] bg-white p-6 shadow-[0_40px_80px_-30px_rgba(15,23,42,0.4)] ring-1 ring-emerald-100">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
            <RefreshCw className="size-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-600">
              Új helység beszúrása
            </p>
            <p className="mt-0.5 text-sm font-semibold text-slate-800">
              Eredeti név: {input}
            </p>
          </div>
        </div>

        {step === 'choose' && (
          <div className="mt-5 space-y-3">
            <p className="text-sm text-slate-600">Romániában van ez a cím?</p>
            <div className="flex gap-2">
              <Button
                type="button"
                onClick={() => setStep('romanian')}
                className="flex-1 rounded-full bg-emerald-600 hover:bg-emerald-700"
              >
                Igen, romániai
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep('foreign')}
                className="flex-1 rounded-full"
              >
                Nem, külföldi
              </Button>
            </div>
            <Button
              type="button"
              variant="ghost"
              onClick={onCancel}
              className="w-full rounded-full text-slate-500"
            >
              Mégsem
            </Button>
          </div>
        )}

        {step === 'romanian' && (
          <div className="mt-5 space-y-3">
            <p className="text-sm text-slate-600">
              Add meg a helység pontos nevét és a megyéjét. A rendszer
              {' '}{'"'}felülvizsgálandó{'"'}{' '}jelöléssel veszi fel — a rendszergazda később ellenőrzi.
            </p>
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Helység neve
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => onNameChange(e.target.value)}
                placeholder="pl. Szárazpatak"
                className="h-10 w-full rounded-xl border border-emerald-200 bg-white px-3 text-sm shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Megye (opcionális — ha üres, a Kovászna lesz default)
              </label>
              <select
                value={countyId ?? ''}
                onChange={(e) =>
                  onCountyChange(e.target.value ? Number(e.target.value) : null)
                }
                className="h-10 w-full rounded-xl border border-emerald-200 bg-white px-3 text-sm shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200"
              >
                <option value="">— Default (Kovászna) —</option>
                {counties.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep('choose')}
                className="rounded-full"
              >
                Vissza
              </Button>
              <Button
                type="button"
                onClick={() => onConfirm(true)}
                disabled={isLoading || !name.trim()}
                className="flex-1 rounded-full bg-emerald-600 hover:bg-emerald-700"
              >
                {isLoading ? <Loader2 className="size-4 animate-spin" /> : 'Hozzáadás'}
              </Button>
            </div>
          </div>
        )}

        {step === 'foreign' && (
          <div className="mt-5 space-y-3">
            <p className="text-sm text-slate-600">
              A cím a teljes szövegben ({'"'}c_szcim{'"'} mezőben) marad — válassz ki egy országot
              a tag-adatlapon. Most egyszerűen válassz az Egyéb opció gombokból a fő nézeten.
            </p>
            <Button
              type="button"
              onClick={onCancel}
              variant="outline"
              className="w-full rounded-full"
            >
              Vissza a választáshoz
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  tone,
  icon,
}: {
  label: string
  value: number
  tone: 'emerald' | 'amber' | 'slate' | 'indigo'
  icon?: React.ReactNode
}) {
  const toneClasses = {
    emerald: 'bg-emerald-50/80 ring-emerald-100 text-emerald-700',
    amber: 'bg-amber-50/80 ring-amber-100 text-amber-700',
    slate: 'bg-slate-50/80 ring-slate-100 text-slate-700',
    indigo: 'bg-indigo-50/80 ring-indigo-100 text-indigo-700',
  } as const
  return (
    <div className={`rounded-2xl px-4 py-3 ring-1 ${toneClasses[tone]}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] opacity-75">
          {label}
        </p>
        {icon}
      </div>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  )
}
