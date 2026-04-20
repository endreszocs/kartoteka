'use client'

/**
 * AddressForm — romániai cím-hierarchia bevitel autocomplete-tel.
 *
 * Használat (példa):
 *
 *   <AddressForm
 *     value={addr}
 *     onChange={setAddr}
 *     lang="hu"
 *   />
 *
 * A komponens:
 *   - Megye dropdown (42 romániai megye + "Külföldi")
 *   - Helység autocomplete (a megyén belül — alias-okon is match-el)
 *   - Utca autocomplete (a helségen belül, postakóddal)
 *   - Irányítószám — auto-töltődik a helségből/utcából, felülírható
 *   - Házszám — szöveges input
 *   - Ha "Külföldi" → minden szöveges mezővé változik, ország-input is
 *
 * A value mindig TELJES objektum — se null, se undefined mezők nincsenek.
 * Szöveges fallback mindig jelen van (a hivatalos iratokon ezek jelennek meg).
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, ChevronDown, Globe, Landmark, MapPin, Search, X } from 'lucide-react'

import {
  listCounties,
  searchLocalities,
  searchStreets,
  type CountyRow,
  type LocalityRow,
  type StreetRow,
} from '@/lib/address/actions'
import { formatHouseNumber, formatStreetWithType } from '@/lib/address/format'

/** Null-safe label helper (modul-szint, hogy a rematch effect is használhassa). */
function pickLocalityLabel(l: LocalityRow, lang: 'hu' | 'ro'): string {
  if (lang === 'hu') return l.name_hu || l.name_ro || ''
  return l.name_ro || l.name_hu || ''
}
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

// ────────────────────────────────────────────────────────────────────
// Típusok
// ────────────────────────────────────────────────────────────────────

export interface AddressValue {
  /** adrcounty.id — null ha külföldi vagy még nincs kiválasztva */
  countyId: number | null
  /** adrlocality.id */
  localityId: number | null
  /** adrstreet.id */
  streetId: number | null

  /** Ország név (default: "România"). Külföldi esetén szabadon írható. */
  country: string
  /** Megye neve a választott nyelven */
  county: string
  /** Helység neve */
  locality: string
  /** Utca neve (+ típus, pl. "Strada Mihai Eminescu" vagy "Kossuth Lajos utca") */
  street: string
  /** Házszám + egyéb (pl. "12", "bl. 54/2D, et. 1, ap. 3") */
  houseNumber: string
  /** Irányítószám */
  postalcode: string

  /** Ha true, minden mező szabad szöveg (a megye dropdown "Külföldi" értékén) */
  isForeign: boolean
}

export const EMPTY_ADDRESS: AddressValue = {
  countyId: null,
  localityId: null,
  streetId: null,
  country: 'Románia',
  county: '',
  locality: '',
  street: '',
  houseNumber: '',
  postalcode: '',
  isForeign: false,
}

interface AddressFormProps {
  value: AddressValue
  onChange: (value: AddressValue) => void
  /** Megjelenítési nyelv (default: hu). Ez csak vizuális — a DB minden sort mind a 2 nyelven tart. */
  lang?: 'hu' | 'ro'
  /** Ha true, az `ország` mezőt is külön sorban mutatjuk (az alapesetben csak akkor, ha külföldi). */
  showCountryAlways?: boolean
  /** Hibák field-onként */
  errors?: Partial<Record<keyof AddressValue, string>>
}

// ────────────────────────────────────────────────────────────────────
// Komponens
// ────────────────────────────────────────────────────────────────────

export function AddressForm({
  value,
  onChange,
  lang = 'hu',
  showCountryAlways = false,
  errors = {},
}: AddressFormProps) {
  const [counties, setCounties] = useState<CountyRow[]>([])
  const [countiesLoading, setCountiesLoading] = useState(true)

  // ── Belső countyId state ──
  // A parent state-je (pl. SetupFormState) a megye NEVÉT tárolja (form.megye),
  // a countyId-t NEM — ezért egy AddressForm-onbelüli useState tartja számon.
  // Ez a 2026-04-21 bugfix: korábban a parent `formToAddressValue` helpere
  // mindig `countyId: null`-t adott vissza, ezért a dropdown minden render
  // után visszaugrott üresre. Innen kezdve a select a belső state-ből olvas,
  // és re-match logika kapja be a county-t a value.county szövegből.
  const [internalCountyId, setInternalCountyId] = useState<number | null>(
    value.countyId
  )

  // Megyék betöltése egyszer (a render-kor)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const list = await listCounties()
      if (cancelled) return
      setCounties(list)
      setCountiesLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // county-név meghatározása a választott nyelven (null-safe)
  function countyLabel(c: CountyRow): string {
    if (lang === 'hu') return c.name_hu || c.name_ro || ''
    return c.name_ro || c.name_hu || ''
  }
  function localityLabel(l: LocalityRow): string {
    if (lang === 'hu') return l.name_hu || l.name_ro || ''
    return l.name_ro || l.name_hu || ''
  }

  // ── Re-match (derivált érték, nem effect) ──
  // Ha a parent megadott egy megye-szöveget (pl. form-betöltés után "Cluj"),
  // ÉS még nincs manuálisan választott internalCountyId, akkor a counties
  // listából kikeressük a match-elt megye id-jét. Derivált érték → useMemo,
  // nem effect (a react-hooks/set-state-in-effect szabály miatt).
  //
  // Null-safety: a régi seed-ből származó megyéknél (pl. a 43. "zombi"
  // county) a name_hu vagy a name_ro is null lehet — optional chaining
  // mindkét oldalon.
  const matchedCountyId = useMemo<number | null>(() => {
    if (counties.length === 0) return null
    if (value.isForeign) return null
    if (!value.county) return null
    const needle = value.county.trim().toLowerCase()
    const found = counties.find((c) => {
      const hu = c.name_hu?.toLowerCase()
      const ro = c.name_ro?.toLowerCase()
      return hu === needle || ro === needle
    })
    return found?.id ?? null
  }, [counties, value.county, value.isForeign])

  // A tényleges countyId: manuális választás nyer (internalCountyId),
  // ha az nincs, akkor a név-alapú match.
  const effectiveCountyId = internalCountyId ?? matchedCountyId

  // ── Helyiség-rematch (régi DB-adatból strukturált találat) ──
  // Ha a parent szöveget adott át helyiségre (pl. régi `form.varos = "Kolozsvár"`),
  // de nincs `localityId`, akkor — egyszer, load-kor — megpróbáljuk exact
  // match-elni az adrlocality-ban, és automatikusan rácsatlakozunk a
  // strukturált rekordra. Így a lelkész nem kényszerül újra beírni.
  const localityRematchedRef = useRef(false)
  useEffect(() => {
    if (localityRematchedRef.current) return
    if (!effectiveCountyId) return
    if (value.isForeign) return
    if (value.localityId) return
    const q = value.locality.trim()
    if (q.length < 2) return

    let cancelled = false
    ;(async () => {
      const res = await searchLocalities(effectiveCountyId, q, { limit: 5 })
      if (cancelled) return
      const needle = q.toLowerCase()
      const exact = res.find(
        (r) =>
          r.name_ro?.toLowerCase() === needle ||
          r.name_hu?.toLowerCase() === needle
      )
      // A ref-et akkor is beállítjuk, ha nincs exact match — különben minden
      // render-kor újra lefutna. A user manuálisan kereshet.
      localityRematchedRef.current = true
      if (exact) {
        onChange({
          ...value,
          localityId: exact.id,
          locality: pickLocalityLabel(exact, lang),
          postalcode: value.postalcode || exact.default_postalcode || '',
        })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [effectiveCountyId, value, onChange, lang])

  // ── Megye kiválasztás ──
  const handleCountyChange = (countyIdStr: string) => {
    if (countyIdStr === 'foreign') {
      setInternalCountyId(null)
      onChange({
        ...value,
        isForeign: true,
        countyId: null,
        localityId: null,
        streetId: null,
        country: '',
        county: '',
        locality: '',
        street: '',
      })
      return
    }
    if (countyIdStr === '') {
      setInternalCountyId(null)
      onChange({
        ...value,
        isForeign: false,
        countyId: null,
        localityId: null,
        streetId: null,
        country: 'Románia',
        county: '',
        locality: '',
        street: '',
      })
      return
    }
    const countyId = Number(countyIdStr)
    const county = counties.find((c) => c.id === countyId)
    if (!county) return
    setInternalCountyId(countyId)
    onChange({
      ...value,
      isForeign: false,
      countyId,
      county: countyLabel(county),
      country: 'Románia',
      // Helységet / utcát NEM töröljük — lehet, hogy megyét vált a lelkész és csak javítaná
      // DE ha pl. Kovásznából Harghitába vált, a helység valószínűleg nem a másikban van.
      // Biztos út: ha countyId változik, töröljük a helyi állapotot.
      localityId: null,
      streetId: null,
      locality: '',
      street: '',
      postalcode: '',
    })
  }

  // ── Helység autocomplete ──
  // A helyiség kötelezően a listából választandó — nincs free-text fallback.
  // A 13 832 helség lefedi gyakorlatilag a teljes Romániát, és a hivatalos
  // iratokhoz szükséges a SIRUTA-kód.
  const selectLocality = (loc: LocalityRow) => {
    onChange({
      ...value,
      localityId: loc.id,
      locality: localityLabel(loc),
      streetId: null,
      street: '',
      postalcode: loc.default_postalcode || value.postalcode || '',
    })
  }
  const clearLocality = () => {
    onChange({
      ...value,
      localityId: null,
      locality: '',
      streetId: null,
      street: '',
      postalcode: '',
    })
  }

  // ── Utca autocomplete ──
  // A mentett `street` érték mindig típus-prefixes: „Strada Mihai Eminescu".
  // Ha az adrstreet tartalmaz `street_type_ro`-t, azt használjuk; ha nincs
  // (free-text), a „Strada" a default. A formatStreetWithType idempotens.
  const selectStreet = (str: StreetRow) => {
    onChange({
      ...value,
      streetId: str.id,
      street: formatStreetWithType(str.name_ro, str.street_type_ro),
      postalcode: str.postalcode || value.postalcode || '',
    })
  }
  // „Nem találod? Használd kézzel" — a beírt szöveget menti, streetId = null.
  // Az utca-típusra a „Strada" default kerül, ha nincs benne már prefix.
  const selectStreetFreeText = (q: string) => {
    onChange({
      ...value,
      streetId: null,
      street: formatStreetWithType(q, null),
    })
  }
  const clearStreet = () => {
    onChange({
      ...value,
      streetId: null,
      street: '',
    })
  }

  // ─────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* ORSZÁG / MEGYE — egy sorban */}
      <div className="grid gap-3 md:grid-cols-2">
        {/* Ország (csak látszik, ha külföldi vagy showCountryAlways) */}
        {(value.isForeign || showCountryAlways) && (
          <div className="space-y-1.5">
            <Label htmlFor="addr-country" className="flex items-center gap-1.5">
              <Globe className="size-3.5 text-slate-500" />
              Ország *
            </Label>
            <Input
              id="addr-country"
              value={value.country ?? ''}
              onChange={(e) => onChange({ ...value, country: e.target.value })}
              placeholder="pl. Magyarország"
              disabled={!value.isForeign}
              className={!value.isForeign ? 'bg-slate-50' : ''}
            />
            {errors.country && <p className="text-xs text-rose-600">{errors.country}</p>}
          </div>
        )}

        {/* Megye dropdown */}
        <div className="space-y-1.5">
          <Label htmlFor="addr-county" className="flex items-center gap-1.5">
            <Landmark className="size-3.5 text-slate-500" />
            Megye *
          </Label>
          <select
            id="addr-county"
            value={value.isForeign ? 'foreign' : (effectiveCountyId?.toString() ?? '')}
            onChange={(e) => handleCountyChange(e.target.value)}
            disabled={countiesLoading}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="">
              {countiesLoading ? 'Betöltés…' : '— Válaszd ki —'}
            </option>
            {counties.map((c) => (
              <option key={c.id} value={c.id}>
                {countyLabel(c)}
                {c.auto_code ? ` (${c.auto_code})` : ''}
              </option>
            ))}
            <option value="foreign">— Külföldi cím —</option>
          </select>
          {errors.county && <p className="text-xs text-rose-600">{errors.county}</p>}
        </div>
      </div>

      {/* HELYSÉG */}
      <div className="space-y-1.5">
        <Label className="flex items-center gap-1.5">
          <MapPin className="size-3.5 text-slate-500" />
          Helység / Település *
        </Label>
        {value.isForeign ? (
          <Input
            value={value.locality ?? ''}
            onChange={(e) => onChange({ ...value, locality: e.target.value })}
            placeholder="pl. Budapest"
          />
        ) : effectiveCountyId ? (
          <LocalityAutocomplete
            countyId={effectiveCountyId}
            lang={lang}
            selectedLabel={value.locality}
            hasSelected={value.localityId != null}
            onSelect={selectLocality}
            onClear={clearLocality}
          />
        ) : (
          <Input
            disabled
            value=""
            readOnly
            placeholder="Előbb válaszd ki a megyét"
            className="bg-slate-50"
          />
        )}
        {errors.locality && <p className="text-xs text-rose-600">{errors.locality}</p>}
      </div>

      {/* UTCA — teljes szélességben (külön sor) */}
      <div className="space-y-1.5">
        <Label>Utca *</Label>
        {value.isForeign ? (
          <Input
            value={value.street ?? ''}
            onChange={(e) => onChange({ ...value, street: e.target.value })}
            placeholder="pl. Fő utca"
          />
        ) : value.localityId ? (
          <StreetAutocomplete
            localityId={value.localityId}
            lang={lang}
            selectedLabel={value.street}
            hasSelected={value.streetId != null}
            isFreeText={value.streetId == null && value.street.trim().length > 0}
            onSelect={selectStreet}
            onSelectFreeText={selectStreetFreeText}
            onClear={clearStreet}
          />
        ) : (
          <Input
            disabled
            value=""
            readOnly
            placeholder="Előbb válaszd ki a helységet"
            className="bg-slate-50"
          />
        )}
        {!value.isForeign && (
          <p className="text-[11px] text-slate-500">
            A rendszer automatikusan kiegészíti a &bdquo;Strada&rdquo;/&bdquo;Bd.&rdquo; prefixszel,
            ha nem szerepel.
          </p>
        )}
        {errors.street && <p className="text-xs text-rose-600">{errors.street}</p>}
      </div>

      {/* HÁZSZÁM + POSTAKÓD — mobilon 2 oszlop, desktopon ugyanúgy,
          de nagyobb helyet adva a házszámnak */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="addr-housenum">
            Házszám <span className="text-slate-400 font-normal">(nr.)</span>
          </Label>
          <Input
            id="addr-housenum"
            value={value.houseNumber ?? ''}
            onChange={(e) => onChange({ ...value, houseNumber: e.target.value })}
            onBlur={() => {
              const normalized = formatHouseNumber(value.houseNumber ?? '')
              if (normalized !== (value.houseNumber ?? '')) {
                onChange({ ...value, houseNumber: normalized })
              }
            }}
            placeholder="pl. 12 vagy bl. 4 sc. A ap. 2"
          />
          <p className="text-[11px] text-slate-500">
            Csak a számot / épületi azonosítót írd be — a &bdquo;nr.&rdquo; automatikusan kerül elé.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="addr-postal">Irányítószám</Label>
          <Input
            id="addr-postal"
            value={value.postalcode ?? ''}
            onChange={(e) => onChange({ ...value, postalcode: e.target.value })}
            placeholder="525101"
            className="font-mono text-sm"
          />
          <p className="text-[11px] text-slate-500">
            Automatikusan kitöltődik az utca alapján.
          </p>
        </div>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// LocalityAutocomplete — saját, egyszerű autocomplete
// ────────────────────────────────────────────────────────────────────

interface LocalityAutocompleteProps {
  countyId: number
  lang: 'hu' | 'ro'
  selectedLabel: string
  /** Strukturált találat (van adrlocality_id) */
  hasSelected: boolean
  onSelect: (loc: LocalityRow) => void
  onClear: () => void
}

function LocalityAutocomplete({
  countyId,
  lang,
  selectedLabel,
  hasSelected,
  onSelect,
  onClear,
}: LocalityAutocompleteProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<LocalityRow[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Outside click
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    window.addEventListener('mousedown', onClick)
    return () => window.removeEventListener('mousedown', onClick)
  }, [])

  // Debounced search — a setState-eket a setTimeout callback-jén belül
  // hívjuk, hogy ne legyen synchronous setState az effect body-ban
  // (react-hooks/set-state-in-effect lint szabály).
  useEffect(() => {
    if (hasSelected) return // ha már van kiválasztott, nem keresünk
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      if (query.trim().length < 2) {
        setResults([])
        return
      }
      setLoading(true)
      const res = await searchLocalities(countyId, query.trim(), { limit: 20 })
      setResults(res)
      setLoading(false)
      setOpen(true)
    }, 250)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, countyId, hasSelected])

  function localityLabel(l: LocalityRow): string {
    if (lang === 'hu') return l.name_hu || l.name_ro || ''
    return l.name_ro || l.name_hu || ''
  }

  // Strukturált találat — zöld badge
  if (hasSelected) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2">
        <Check className="size-4 shrink-0 text-emerald-600" />
        <span className="flex-1 text-sm font-medium text-emerald-900">{selectedLabel}</span>
        <button
          type="button"
          onClick={onClear}
          className="rounded p-1 text-emerald-700 hover:bg-emerald-100"
          aria-label="Kiválasztás törlése"
        >
          <X className="size-3.5" />
        </button>
      </div>
    )
  }

  const trimmedQuery = query.trim()

  // A helység kötelezően a listából választandó — nincs „Használd kézzel"
  // fallback (ellentétben az utcával). A 13 832 helség lefedi gyakorlatilag
  // a teljes Romániát; a hivatalos iratokhoz szükséges a SIRUTA-kód.
  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => query.length >= 2 && setOpen(true)}
          placeholder="Kezdj el írni a helység nevéből…"
          className="pl-9"
        />
      </div>

      <AnimatePresence>
        {open && (loading || trimmedQuery.length >= 2) && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute z-50 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg"
          >
            {loading ? (
              <div className="p-3 text-center text-xs text-slate-500">Keresés…</div>
            ) : (
              <ul role="listbox">
                {results.length === 0 && (
                  <li className="px-3 py-3 text-xs text-slate-500">
                    <div className="mb-1">
                      Nincs találat a &bdquo;{trimmedQuery}&rdquo; kifejezésre.
                    </div>
                    <div className="text-slate-400">
                      Próbáld a helség magyar vagy román nevét — a rendszer mindkettőt érti.
                    </div>
                  </li>
                )}
                {results.map((l) => (
                  <li key={l.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onSelect(l)
                        setQuery('')
                        setOpen(false)
                      }}
                      className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-slate-50"
                    >
                      <MapPin className="mt-0.5 size-3.5 shrink-0 text-slate-400" />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-slate-900">
                          {localityLabel(l)}
                        </div>
                        <div className="flex gap-2 text-xs text-slate-500">
                          {lang === 'hu' && l.name_hu && l.name_ro !== l.name_hu && (
                            <span className="italic">{l.name_ro}</span>
                          )}
                          {l.matched_via_alias && (
                            <span className="text-amber-700">
                              ↳ &bdquo;{l.matched_via_alias}&rdquo;
                            </span>
                          )}
                          {l.default_postalcode && (
                            <span className="font-mono">{l.default_postalcode}</span>
                          )}
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// StreetAutocomplete — ugyanaz az elv, utcákhoz
// ────────────────────────────────────────────────────────────────────

interface StreetAutocompleteProps {
  localityId: number
  lang: 'hu' | 'ro'
  selectedLabel: string
  /** Strukturált találat (van adrstreet_id) */
  hasSelected: boolean
  /** Szabad-szöveges választás (nincs adrstreet_id, de van szöveg) */
  isFreeText: boolean
  onSelect: (str: StreetRow) => void
  onSelectFreeText: (query: string) => void
  onClear: () => void
}

function StreetAutocomplete({
  localityId,
  selectedLabel,
  hasSelected,
  isFreeText,
  onSelect,
  onSelectFreeText,
  onClear,
}: StreetAutocompleteProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<StreetRow[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    window.addEventListener('mousedown', onClick)
    return () => window.removeEventListener('mousedown', onClick)
  }, [])

  useEffect(() => {
    if (hasSelected) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      if (query.trim().length < 2) {
        setResults([])
        return
      }
      setLoading(true)
      const res = await searchStreets(localityId, query.trim(), { limit: 25 })
      setResults(res)
      setLoading(false)
      setOpen(true)
    }, 250)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, localityId, hasSelected])

  // Strukturált találat — zöld badge
  if (hasSelected) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2">
        <Check className="size-4 shrink-0 text-emerald-600" />
        <span className="flex-1 truncate text-sm font-medium text-emerald-900">
          {selectedLabel}
        </span>
        <button
          type="button"
          onClick={onClear}
          className="rounded p-1 text-emerald-700 hover:bg-emerald-100"
          aria-label="Kiválasztás törlése"
        >
          <X className="size-3.5" />
        </button>
      </div>
    )
  }

  // Szabad-szöveges választás — amber badge
  if (isFreeText) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2">
        <span className="shrink-0 rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-800">
          kézi
        </span>
        <span className="flex-1 truncate text-sm font-medium text-amber-900">
          {selectedLabel}
        </span>
        <button
          type="button"
          onClick={onClear}
          className="rounded p-1 text-amber-700 hover:bg-amber-100"
          aria-label="Kézi bevitel törlése"
        >
          <X className="size-3.5" />
        </button>
      </div>
    )
  }

  const trimmedQuery = query.trim()
  const showFallback = !loading && trimmedQuery.length >= 2

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => query.length >= 2 && setOpen(true)}
          placeholder="Kezdj el írni az utca nevéből…"
          className="pl-9"
        />
      </div>

      <AnimatePresence>
        {open && (loading || trimmedQuery.length >= 2) && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute z-50 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg"
          >
            {loading ? (
              <div className="p-3 text-center text-xs text-slate-500">Keresés…</div>
            ) : (
              <ul role="listbox">
                {results.length === 0 && (
                  <li className="px-3 py-2 text-xs text-slate-500">
                    Nincs találat a &bdquo;{trimmedQuery}&rdquo; kifejezésre.
                  </li>
                )}
                {results.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onSelect(s)
                        setQuery('')
                        setOpen(false)
                      }}
                      className="flex w-full items-start justify-between gap-2 px-3 py-2 text-left hover:bg-slate-50"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-slate-900 truncate">
                          {s.street_type_ro && (
                            <span className="text-slate-500">{s.street_type_ro} </span>
                          )}
                          {s.name_ro}
                        </div>
                      </div>
                      {s.postalcode && (
                        <span className="shrink-0 font-mono text-xs text-slate-600">
                          {s.postalcode}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
                {showFallback && (
                  <li className="border-t border-slate-100 bg-amber-50/50">
                    <button
                      type="button"
                      onClick={() => {
                        onSelectFreeText(trimmedQuery)
                        setQuery('')
                        setOpen(false)
                      }}
                      className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-amber-50"
                    >
                      <span className="mt-0.5 shrink-0 rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-800">
                        kézi
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-amber-900">
                          Használd kézzel: &bdquo;{trimmedQuery}&rdquo;
                        </div>
                        <div className="text-xs text-amber-700">
                          Az utca nem szerepel a listában — szövegként mentjük.
                        </div>
                      </div>
                    </button>
                  </li>
                )}
              </ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// Ikon-warning ismétlés elkerülve — a ChevronDown nem használt itt
void ChevronDown
