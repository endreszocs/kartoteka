'use client'

import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Sparkles, TriangleAlert } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { getFamilyPartnership, saveFamily, searchFamilyMember } from '@/app/(dashboard)/tagnyilvantartas/family-actions'
import type { FamilyRow } from '@/app/(dashboard)/tagnyilvantartas/family-actions'
import type { AssignConflict } from '@/lib/family/family-membership'
import { getDistricts, type DistrictRow } from '@/app/(dashboard)/tagnyilvantartas/presbyter-actions'
import { toast } from 'sonner'
import { FamilyCardModern, type FamilyCardModernData } from '@kartoteka/ui-app'

interface SearchResult {
  id: number
  csaladnev: string
  k_nev: string
  cnp: string | null
  sz_datum: string | null
  c_szam: string | null
  c_utcaid: number | null
  adrlocality: { name: string } | null
  adrstreet: { name: string } | null
  /** 2026-08-01 (PR-18): a találat már EGY MÁSIK család tagja — figyelmeztető jelvény */
  masikCsalad?: { id: number; name: string; role: 'felnott' | 'gyermek' } | null
  /** 2026-08-04 (PR-32): felnőtt (saját családot alapított) — gyermekként csak
   *  rokoni kapcsolatként vehető fel, a háztartásba nem kerül be */
  felnottMashol?: boolean
  /** 2026-08-04 (PR-44): egy LEZÁRT kartonon foglalja a férj/feleség helyet.
   *  Az adatbázis egyediségi indexe a lezárt kartonokra is érvényes, ezért a
   *  kiválasztása „duplicate key" hibába futna — előbb a válást kell rögzíteni. */
  lezartKartonon?: boolean
}

type EditableFamilyRow = FamilyRow & { c_utcaid?: number | null }

interface FamilyFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editFamily: EditableFamilyRow | null
}

// 2026-06-02: jól látható input-stílus — a default bg-card/78 (78% áttetszős)
// egybeolvad a dialog-háttérrel. Ez a stílus tisztán fehér háttérrel + finom
// shadow-val tér el — mint a baptism-dialog mintában.
const FIELD_INPUT_CLASS = 'h-11 rounded-xl border-input bg-card shadow-sm focus-visible:ring-ring'

type PersonRef = { id: number; name: string; age?: number | null }

// ── Keresőmezők közös állapota (2026-08-04, PR-34) ─────────────────────────
//
// A három kereső (férj / feleség / gyermek) eddig 9 külön state-ben élt, és
// mindhárom ugyanazokat a hibákat hordozta: nem volt késleltetés (minden
// leütésre szerver-hívás), nem volt kérés-sorszám (a LASSABB, korábbi válasz
// felülírta a frissebbet), és a lista nem záródott be kívülre kattintásra.
// Egy közös alakzattal mindhárom mező egyszerre javul.
type SearchType = 'husband' | 'wife' | 'child'

interface SearchFieldState {
  query: string
  results: SearchResult[]
  /** nyitva van-e a találatlista */
  open: boolean
  /** billentyűzettel kijelölt sor indexe (-1 = nincs kijelölés) */
  active: number
  loading: boolean
  /** lefutott-e már keresés — az üres lista így megkülönböztethető a „még nem kerestünk" állapottól */
  searched: boolean
}

const EMPTY_SEARCH_FIELD: SearchFieldState = {
  query: '',
  results: [],
  open: false,
  active: -1,
  loading: false,
  searched: false,
}

const EMPTY_SEARCH_STATE: Record<SearchType, SearchFieldState> = {
  husband: EMPTY_SEARCH_FIELD,
  wife: EMPTY_SEARCH_FIELD,
  child: EMPTY_SEARCH_FIELD,
}

const SEARCH_TYPES: SearchType[] = ['husband', 'wife', 'child']

const SEARCH_LABELS: Record<SearchType, string> = {
  husband: 'Férj',
  wife: 'Feleség',
  child: 'Gyermek',
}

/** A keresés késleltetése (ms) — enélkül minden leütés külön szerver-hívás volt. */
const SEARCH_DEBOUNCE_MS = 250

const DROPDOWN_BOX_CLASS =
  'absolute left-0 right-0 top-full z-30 mt-1 max-h-60 overflow-y-auto overscroll-contain rounded-xl border border-border bg-popover p-1 shadow-xl'

export function FamilyFormDialog({ open, onOpenChange, editFamily }: FamilyFormDialogProps) {
  const [loading, setLoading] = useState(false)
  const [husband, setHusband] = useState<PersonRef | null>(null)
  const [wife, setWife] = useState<PersonRef | null>(null)
  const [children, setChildren] = useState<PersonRef[]>([])
  const [cSzam, setCSzam] = useState('')
  const [cUtcaid, setCUtcaid] = useState<number | undefined>(undefined)
  const [cUtcaName, setCUtcaName] = useState('')
  const [idCsoport, setIdCsoport] = useState<string>('')
  const [districts, setDistricts] = useState<DistrictRow[]>([])
  // 2026-08-01 (PR-18): a szerver dupla-tagsági figyelmeztetése — explicit
  // áthelyezési megerősítést kér a mentés előtt.
  const [pendingConflicts, setPendingConflicts] = useState<{ conflicts: AssignConflict[]; warning: string } | null>(null)
  const conflictRef = useRef<HTMLDivElement>(null)
  // 2026-08-04 (PR-27): a felnőtt pár kapcsolatának jellege és kezdete
  const [parkapcsolat, setParkapcsolat] = useState<'hazastars' | 'elettars' | null>(null)
  const [parDatum, setParDatum] = useState('')
  // 2026-08-04 (PR-34): melyik PÁROSHOZ tartozik a fenti jelölés. Eddig csak a
  // „férj cseréje másik személyre" ág törölte a jelölést, a férj/feleség
  // ELTÁVOLÍTÁSA nem — így a házasság+dátum átragadhatott a következő félre.
  // Származtatva ellenőrizzük: ha a páros már nem ugyanaz, a jelölés nem él.
  const [parPair, setParPair] = useState<{ ferfiId: number | null; noId: number | null } | null>(null)

  // A figyelmeztető panel az űrlap alján van — hosszú űrlapon / mobilon a
  // viewport alá esne, és a mentés „nem csinál semmit" érzést keltene.
  useEffect(() => {
    if (pendingConflicts) conflictRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [pendingConflicts])

  // Keresők — közös állapot (lásd a SearchFieldState kommentjét)
  const [search, setSearch] = useState<Record<SearchType, SearchFieldState>>(EMPTY_SEARCH_STATE)
  /** A keresők állapotának tükre a natív (nem React) eseménykezelőkhöz. */
  const searchRef = useRef(search)
  /** A mezők konténer-elemei — a „kívülre kattintás zárja a listát" logikához. */
  const fieldRefs = useRef<Record<SearchType, HTMLDivElement | null>>({ husband: null, wife: null, child: null })
  /** Késleltető időzítők mezőnként. */
  const searchTimersRef = useRef<Record<SearchType, ReturnType<typeof setTimeout> | null>>({
    husband: null, wife: null, child: null,
  })
  /** Kérés-sorszám mezőnként: csak a LEGUTÓBB indított keresés válasza számít. */
  const searchSeqRef = useRef<Record<SearchType, number>>({ husband: 0, wife: 0, child: 0 })

  // 2026-08-04 (PR-34): az inicializálás kulcsa a szerkesztett család
  // AZONOSÍTÓJA — nem az `editFamily` objektum-referencia.
  //
  // Miért: a hívó helyek egy része inline objektum-literált ad át (pl. a családi
  // karton „Szerkesztés" gombja a family-details-dialog-refined.tsx-ben), ezért
  // MINDEN szülő-újrarenderelésnél új referencia keletkezik. A korábbi
  // `[open, editFamily]` függőség emiatt NYITOTT ablaknál is újra lefuttatta a
  // teljes resetet: a felhasználó elvesztette a kiválasztott férjet/feleséget/
  // gyermekeket és a beírt keresőszöveget („egyszer csak eltűnik, amit
  // kiválasztottam"). Most csak az ablak nyitása / másik család betöltése
  // inicializál újra.
  const editFamilyId = editFamily?.id ?? null
  const editFamilyRef = useRef(editFamily)
  const initializedKeyRef = useRef<string | null>(null)
  /**
   * A ténylegesen szerkesztett család azonosítója — az inicializáláskor rögzítjük.
   * A mentés és a kereső EZT használja: ha a szülő nyitott ablaknál átmenetileg
   * null-t adna, a mentés attól még NEM válhat „új család létrehozásává".
   */
  const activeFamilyIdRef = useRef<number | null>(null)

  // A legfrissebb prop-érték olvasásra — a referencia-változás nem indíthat
  // újra-inicializálást, ezért nem függősége az inicializáló effektnek.
  useEffect(() => {
    editFamilyRef.current = editFamily
  })

  useEffect(() => {
    searchRef.current = search
  }, [search])

  // Körzetek: az ablak megnyitásakor egyszer. (Korábban az inicializáló
  // effektben volt, catch nélkül — a hálózati hiba kezeletlen promise-t dobott.)
  useEffect(() => {
    if (!open) return
    let cancelled = false
    getDistricts()
      .then((data) => { if (!cancelled) setDistricts(data) })
      .catch((error) => {
        console.warn('[FamilyFormDialog] A körzetek betöltése sikertelen:', error)
      })
    return () => { cancelled = true }
  }, [open])

  // Az űrlap feltöltése / ürítése
  useEffect(() => {
    if (!open) {
      // Záráskor takarítunk: a következő megnyitás mindig friss állapotból indul.
      initializedKeyRef.current = null
      activeFamilyIdRef.current = null
      for (const type of SEARCH_TYPES) {
        const timer = searchTimersRef.current[type]
        if (timer) { clearTimeout(timer); searchTimersRef.current[type] = null }
        searchSeqRef.current[type] += 1
      }
      setSearch(EMPTY_SEARCH_STATE)
      setPendingConflicts(null)
      return
    }
    // Ha a szülő NYITOTT ablaknál átmenetileg null-t ad (pl. épp újratölti a
    // karton adatait), nem váltunk „új család" módba — az űrlap tartalma marad.
    if (editFamilyId == null && initializedKeyRef.current !== null) return

    const key = editFamilyId != null ? `csalad:${editFamilyId}` : 'uj-csalad'
    if (initializedKeyRef.current === key) return
    initializedKeyRef.current = key
    activeFamilyIdRef.current = editFamilyId

    const current = editFamilyRef.current
    if (current && current.id === editFamilyId) {
      const ageOf = (d: string | null | undefined) =>
        d ? new Date().getFullYear() - new Date(d).getFullYear() : null
      const ferfiId = current.ferfi?.id ?? null
      const noId = current.no?.id ?? null
      setHusband(current.ferfi
        ? { id: current.ferfi.id, name: `${current.ferfi.csaladnev} ${current.ferfi.k_nev}`, age: ageOf(current.ferfi.sz_datum) }
        : null)
      setWife(current.no
        ? { id: current.no.id, name: `${current.no.csaladnev} ${current.no.k_nev}`, age: ageOf(current.no.sz_datum) }
        : null)
      setCSzam(current.c_szam || '')
      setCUtcaName(current.utca?.name || '')
      setCUtcaid(current.c_utcaid ?? undefined)
      setIdCsoport(current.id_csoport ? String(current.id_csoport) : '')
      // A felnőtt slotokban ülő személy nem lehet egyben gyermek is (a szerver
      // amúgy is kiszűrné) — a hibás korábbi adat így nem jelenik meg duplán.
      const seenChildIds = new Set<number>()
      setChildren((current.gyerekek ?? [])
        .filter((child) => {
          if (child.id === ferfiId || child.id === noId) return false
          if (seenChildIds.has(child.id)) return false
          seenChildIds.add(child.id)
          return true
        })
        .map((child) => ({
          id: child.id,
          name: `${child.csaladnev ?? ''} ${child.k_nev ?? ''}`.trim() || 'Névtelen gyermek',
          age: ageOf(child.sz_datum),
        })))
      // A meglévő párkapcsolat-jelölés betöltése (PR-27) — enélkül a mentés
      // felülírná a már rögzített (pl. anyakönyvi) adatot
      setParkapcsolat(null)
      setParDatum('')
      setParPair(null)
      if (ferfiId && noId) {
        getFamilyPartnership({ ferfiId, noId })
          .then((p) => {
            // Közben másik családra / új családra váltottunk → eldobjuk
            if (initializedKeyRef.current !== key) return
            setParkapcsolat(p.tipus)
            setParDatum(p.datum ?? '')
            setParPair({ ferfiId, noId })
          })
          .catch((error) => {
            console.warn('[FamilyFormDialog] A párkapcsolat betöltése sikertelen:', error)
          })
      }
    } else {
      setHusband(null)
      setWife(null)
      setChildren([])
      setCSzam('')
      setCUtcaName('')
      setCUtcaid(undefined)
      setIdCsoport('')
      setParkapcsolat(null)
      setParDatum('')
      setParPair(null)
    }
    setSearch(EMPTY_SEARCH_STATE)
    setPendingConflicts(null)
  }, [open, editFamilyId])

  // Az időzítők takarítása lecsatoláskor (különben egy már eltűnt ablak
  // keresése futna le a háttérben).
  useEffect(() => {
    const timers = searchTimersRef.current
    return () => {
      for (const type of SEARCH_TYPES) {
        const timer = timers[type]
        if (timer) clearTimeout(timer)
      }
    }
  }, [])

  // Kívülre kattintás zárja a találatlistát (eddig nyitva ragadt, és eltakarta
  // az alatta lévő mezőket).
  useEffect(() => {
    if (!open) return
    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node | null
      if (!target) return
      const closing = SEARCH_TYPES.filter((type) => {
        if (!searchRef.current[type].open) return false
        const container = fieldRefs.current[type]
        return !(container && container.contains(target))
      })
      if (closing.length === 0) return
      for (const type of closing) {
        const timer = searchTimersRef.current[type]
        if (timer) { clearTimeout(timer); searchTimersRef.current[type] = null }
        // A folyamatban lévő kérés válasza ne nyissa vissza a bezárt listát.
        searchSeqRef.current[type] += 1
      }
      setSearch((prev) => {
        const next = { ...prev }
        for (const type of closing) {
          next[type] = { ...prev[type], open: false, active: -1, loading: false }
        }
        return next
      })
    }
    document.addEventListener('pointerdown', handlePointerDown, true)
    return () => document.removeEventListener('pointerdown', handlePointerDown, true)
  }, [open])

  // Escape: ha nyitva van egy találatlista, CSAK azt zárjuk be.
  //
  // Miért capture fázisban, natív figyelővel: a dialógus-primitív (Base UI) az
  // Escape-et a `document` BUBORÉK fázisában figyeli, ezért a React-es
  // onKeyDown + stopPropagation már elkésne — az Esc bezárta volna a teljes
  // ablakot, és a felhasználó minden beírt adatot elveszített volna.
  useEffect(() => {
    if (!open) return
    function handleEscape(event: globalThis.KeyboardEvent) {
      if (event.key !== 'Escape') return
      const openType = SEARCH_TYPES.find((type) => searchRef.current[type].open)
      if (!openType) return
      event.preventDefault()
      event.stopPropagation()
      const timer = searchTimersRef.current[openType]
      if (timer) { clearTimeout(timer); searchTimersRef.current[openType] = null }
      searchSeqRef.current[openType] += 1
      setSearch((prev) => ({ ...prev, [openType]: { ...prev[openType], open: false, active: -1, loading: false } }))
    }
    document.addEventListener('keydown', handleEscape, true)
    return () => document.removeEventListener('keydown', handleEscape, true)
  }, [open])

  function patchSearch(type: SearchType, patch: Partial<SearchFieldState>) {
    setSearch((prev) => ({ ...prev, [type]: { ...prev[type], ...patch } }))
  }

  /** Késleltetés törlése + a folyamatban lévő kérés eredményének eldobása. */
  function cancelPendingSearch(type: SearchType) {
    const timer = searchTimersRef.current[type]
    if (timer) { clearTimeout(timer); searchTimersRef.current[type] = null }
    searchSeqRef.current[type] += 1
  }

  async function runSearch(type: SearchType, query: string, seq: number) {
    const role = type === 'husband' ? 'ferfi' as const : type === 'wife' ? 'no' as const : 'gyerek' as const
    try {
      const results = await searchFamilyMember(query, role, activeFamilyIdRef.current ?? undefined)
      // Elavult válasz (közben újabb keresés indult vagy választottunk) — eldobjuk.
      if (searchSeqRef.current[type] !== seq) return
      patchSearch(type, {
        results: results as unknown as SearchResult[],
        open: true,
        loading: false,
        searched: true,
        active: -1,
      })
    } catch (error) {
      if (searchSeqRef.current[type] !== seq) return
      // Eddig a hívó nem várta meg a promise-t → a hiba kezeletlen maradt, és a
      // felhasználó csak annyit látott, hogy „nem történik semmi".
      console.error('[FamilyFormDialog] A tagkeresés sikertelen:', error)
      patchSearch(type, { results: [], open: false, loading: false, searched: false, active: -1 })
      toast.error('A keresés nem sikerült. Ellenőrizd a kapcsolatot, majd próbáld újra.')
    }
  }

  function handleQueryChange(type: SearchType, value: string) {
    cancelPendingSearch(type)
    const trimmed = value.trim()
    if (trimmed.length < 2) {
      patchSearch(type, { query: value, results: [], open: false, loading: false, searched: false, active: -1 })
      return
    }
    patchSearch(type, { query: value, open: true, loading: true, active: -1 })
    const seq = searchSeqRef.current[type]
    searchTimersRef.current[type] = setTimeout(() => {
      searchTimersRef.current[type] = null
      void runSearch(type, trimmed, seq)
    }, SEARCH_DEBOUNCE_MS)
  }

  function handleSearchKeyDown(event: ReactKeyboardEvent<HTMLInputElement>, type: SearchType) {
    const state = search[type]
    // Az Escape-et a fenti capture-fázisú natív figyelő kezeli (lásd ott a
    // magyarázatot) — ide már el sem jut, ha nyitva van a találatlista.
    if (!state.open || state.results.length === 0) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      patchSearch(type, { active: (state.active + 1) % state.results.length })
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      patchSearch(type, { active: state.active <= 0 ? state.results.length - 1 : state.active - 1 })
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const picked = state.results[state.active >= 0 ? state.active : 0]
      if (picked) selectPerson(picked, type)
    }
  }

  function selectPerson(r: SearchResult, type: SearchType) {
    const name = `${r.csaladnev ?? ''} ${r.k_nev ?? ''}`.trim() || `#${r.id}`
    const age = r.sz_datum ? new Date().getFullYear() - new Date(r.sz_datum).getFullYear() : null

    // 2026-08-04 (PR-34): SZEREP-ÜTKÖZÉS. Ugyanaz a személy nem lehet egyszerre
    // férj és feleség, és felnőttként sem szerepelhet a saját gyermekei között.
    // A szerver a gyerek-listából némán kiszűri az ilyet (saveFamily), így a
    // lelkész azt hitte, elmentette — most a kiválasztáskor szólunk.
    if (type === 'husband' && wife?.id === r.id) {
      toast.error(`${name} már a feleség helyén szerepel — egy személy nem lehet egyszerre mindkét fél.`)
      return
    }
    if (type === 'wife' && husband?.id === r.id) {
      toast.error(`${name} már a férj helyén szerepel — egy személy nem lehet egyszerre mindkét fél.`)
      return
    }
    if (type === 'child' && (husband?.id === r.id || wife?.id === r.id)) {
      toast.error(`${name} ennek a családnak felnőtt tagja — gyermekként nem vehető fel ugyanide.`)
      return
    }

    // 2026-08-01 (PR-18): azonnali figyelmeztetés dupla tagságnál — a mentéskor
    // a szerver úgyis megerősítést kér, de a felhasználó már itt lássa.
    if (r.felnottMashol && type === 'child') {
      toast.info(
        `${name} saját családot alapított — a háztartáshoz nem adjuk hozzá, de a szülő–gyermek kapcsolatot rögzítjük, így a családfán itt is megjelenik.`,
        { duration: 8000 },
      )
    } else if (r.masikCsalad) {
      toast.warning(
        `${name} már a(z) ${r.masikCsalad.name} tagja (${r.masikCsalad.role === 'felnott' ? 'családfő/házastárs' : 'gyermek'}). Mentéskor a rendszer rákérdez az áthelyezésre.`,
        { duration: 6000 },
      )
    }

    // A folyamatban lévő (elavult) keresés válasza ne nyissa vissza a listát.
    cancelPendingSearch(type)
    patchSearch(type, { ...EMPTY_SEARCH_FIELD })

    if (type === 'husband' || type === 'wife') {
      // Ha eddig gyermekként szerepelt, felnőttként vesszük fel — a szerver is
      // így jár el, de eddig szó nélkül tette, itt viszont látszik a listán.
      if (children.some((c) => c.id === r.id)) {
        setChildren((prev) => prev.filter((c) => c.id !== r.id))
        toast.info(`${name} eddig a gyermekek között szerepelt — felnőttként vettük fel, ezért onnan kikerült.`)
      }
    }

    // 2026-08-04 (PR-27 + PR-34): a pár jelölése (házasság/élettárs + dátum)
    // NEM ragadhat át egy másik párosra — ezt már a `parPair` összevetése
    // intézi (lásd `parkapcsolatErvenyes`), itt nincs külön törlés.
    if (type === 'husband') {
      setHusband({ id: r.id, name, age })
      // Cím auto-töltés a férj lakcíméből
      if (r.adrstreet?.name) { setCUtcaName(r.adrstreet.name); setCUtcaid(r.c_utcaid ?? undefined) }
      if (r.c_szam) setCSzam(r.c_szam)
    } else if (type === 'wife') {
      setWife({ id: r.id, name, age })
      // Ha nincs még cím → a feleség lakcíméből tölt
      if (!cUtcaName && r.adrstreet?.name) { setCUtcaName(r.adrstreet.name); setCUtcaid(r.c_utcaid ?? undefined) }
      if (!cSzam && r.c_szam) setCSzam(r.c_szam)
    } else {
      // Funkcionális frissítés + duplikátum-szűrés: két gyors kiválasztás sem
      // tud kétszer beszúrni ugyanazt.
      setChildren((prev) => (prev.some((c) => c.id === r.id) ? prev : [...prev, { id: r.id, name, age }]))
    }
  }

  // 2026-08-04 (PR-34): a pár jelölése CSAK arra a párosra érvényes, amelyikre
  // rögzítettük. Ha bármelyik fél kicserélődött vagy kikerült, a jelölés nem él
  // (és mentéskor sem küldjük) — így nem öröklődik át a következő félre.
  const parkapcsolatErvenyes =
    parPair !== null
    && parPair.ferfiId === (husband?.id ?? null)
    && parPair.noId === (wife?.id ?? null)
  const aktivParkapcsolat = parkapcsolatErvenyes ? parkapcsolat : null
  const aktivParDatum = parkapcsolatErvenyes ? parDatum : ''

  /** A pár jelölése mindig az ÉPPEN kiválasztott párosra vonatkozik. */
  function chooseParkapcsolat(value: 'hazastars' | 'elettars') {
    setParkapcsolat(value)
    setParPair({ ferfiId: husband?.id ?? null, noId: wife?.id ?? null })
    if (!parkapcsolatErvenyes) setParDatum('')
  }

  function removeChild(id: number) {
    setChildren(prev => prev.filter(c => c.id !== id))
  }

  /** Dupla mentés elleni őr — a `loading` state a két gyors kattintás közt még nem ért át. */
  const submitInFlightRef = useRef(false)

  async function handleSubmit(allowMoves = false) {
    if (submitInFlightRef.current) return
    if (!husband && !wife) { toast.error('Legalább egy felet (férj vagy feleség) meg kell adni.'); return }
    submitInFlightRef.current = true
    setLoading(true)
    try {
      // Biztonsági háló: dedup + a felnőtt slotok kizárása (a szerver is ezt
      // teszi, de így a felület és a küldött adat mindig egyezik).
      const gyerekIds = [...new Set(children.map(c => c.id))]
        .filter((id) => id !== husband?.id && id !== wife?.id)
      const result = await saveFamily({
        id: activeFamilyIdRef.current ?? undefined,
        id_ferfi: husband?.id ?? null,
        id_no: wife?.id ?? null,
        gyerekIds,
        c_utcaid: cUtcaid,
        c_szam: cSzam || undefined,
        id_csoport: idCsoport ? parseInt(idCsoport) : null,
        allowMoves,
        // Csak akkor küldjük, ha van pár ÉS a felhasználó jelölt is valamit —
        // különben nem nyúlunk a meglévő (pl. anyakönyvi) kapcsolathoz
        parkapcsolat: husband && wife ? aktivParkapcsolat : null,
        parkapcsolat_datum: husband && wife && aktivParkapcsolat ? (aktivParDatum || null) : null,
      })
      if (result.error) {
        toast.error(result.error)
        setPendingConflicts(null)
      } else if (result.conflicts && result.conflicts.length > 0) {
        // 2026-08-01 (PR-18): dupla tagság — a mentés csak explicit
        // áthelyezéssel mehet tovább. Toast is szól, hogy a görgetés előtt is
        // legyen látható visszajelzés.
        setPendingConflicts({
          conflicts: result.conflicts,
          warning: result.warning ?? 'Egy kiválasztott személy már másik család tagja.',
        })
        toast.warning(result.warning ?? 'Egy kiválasztott személy már másik család tagja — erősítsd meg az áthelyezést a lap alján.', { duration: 8000 })
      } else {
        toast.success(activeFamilyIdRef.current ? 'Család frissítve!' : 'Család létrehozva!')
        // 2026-06-10 (Fázis 2): a háztartás-sync hibája nem néma többé
        if (result.warning) toast.warning(result.warning, { duration: 8000 })
        setPendingConflicts(null)
        onOpenChange(false)
      }
    } catch (error) {
      console.error('[FamilyFormDialog] A család mentése sikertelen:', error)
      toast.error('A család mentése nem sikerült. Próbáld újra.')
    } finally {
      submitInFlightRef.current = false
      setLoading(false)
    }
  }

  function renderSearchDropdown(type: SearchType) {
    const state = search[type]
    if (!state.open) return null
    const label = SEARCH_LABELS[type]

    if (state.results.length === 0) {
      // Eddig üres válasznál egyszerűen NEM jelent meg semmi — a felhasználó
      // nem tudta eldönteni, hogy fut-e még a keresés, vagy nincs találat.
      if (state.loading) {
        return (
          <div id={`family-${type}-results`} role="status" className={`${DROPDOWN_BOX_CLASS} px-3 py-2 text-sm text-muted-foreground`}>
            Keresés…
          </div>
        )
      }
      if (!state.searched) return null
      return (
        <div id={`family-${type}-results`} role="status" className={`${DROPDOWN_BOX_CLASS} px-3 py-2 text-sm text-muted-foreground`}>
          Nincs találat erre a névre.
          {type !== 'child' && ' A más családban már bejegyzett felnőttek nem jelennek meg ebben a listában — ha valaki elvált, előbb a régi kartonján a „Válás / kapcsolat felbontása” gombbal rögzítsd a válást, utána itt kereshető lesz.'}
        </div>
      )
    }

    return (
      <div
        id={`family-${type}-results`}
        role="listbox"
        aria-label={`${label} keresési találatok`}
        className={DROPDOWN_BOX_CLASS}
      >
        {state.results.map((r, index) => (
          <button
            key={r.id}
            id={`family-${type}-option-${r.id}`}
            type="button"
            role="option"
            aria-selected={index === state.active}
            ref={index === state.active ? (el) => { el?.scrollIntoView({ block: 'nearest' }) } : undefined}
            className={`block min-h-11 w-full rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-primary/5 focus-visible:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none ${index === state.active ? 'bg-primary/10' : ''}`}
            onClick={() => selectPerson(r, type)}
          >
            <span className="block font-semibold text-foreground">{r.csaladnev} {r.k_nev}</span>
            <span className="block text-xs text-muted-foreground">
              {r.sz_datum ? `${new Date().getFullYear() - new Date(r.sz_datum).getFullYear()} éves` : '?'} · {r.adrlocality?.name || ''} {r.adrstreet?.name || ''} {r.c_szam || ''}
            </span>
            {r.masikCsalad && (
              <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                <TriangleAlert className="size-3" />
                már a(z) {r.masikCsalad.name} tagja
              </span>
            )}
            {/* 2026-08-04 (PR-44): eddig ez a találat NÉMÁN „duplicate key"
                hibába futott a mentésnél — most a lelkész előre látja, mi a teendő. */}
            {r.lezartKartonon && (
              <span className="mt-0.5 block text-[11px] font-semibold leading-4 text-amber-800 dark:text-amber-300">
                <TriangleAlert className="mr-1 inline size-3" />
                Lezárt családi kartonon szerepel férjként/feleségként — előbb ott a válást kell rögzíteni,
                különben a mentés nem sikerül.
              </span>
            )}
          </button>
        ))}
      </div>
    )
  }

  /** Közös kereső-input a három mezőhöz (combobox-attribútumokkal). */
  function renderSearchInput(type: SearchType, id: string, placeholder: string) {
    const state = search[type]
    const activeOption = state.active >= 0 ? state.results[state.active] : undefined
    return (
      <Input
        id={id}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={state.open}
        aria-controls={`family-${type}-results`}
        aria-activedescendant={activeOption ? `family-${type}-option-${activeOption.id}` : undefined}
        autoComplete="off"
        placeholder={placeholder}
        value={state.query}
        onChange={(e) => handleQueryChange(type, e.target.value)}
        onKeyDown={(e) => handleSearchKeyDown(e, type)}
        className={FIELD_INPUT_CLASS}
      />
    )
  }

  // 2026-06-02: élő kártya-előnézet — minden state-frissítésre újraszámol.
  // A „familyName" a férj családnevéből vesszük (vagy a feleségéből, ha nincs férj).
  const previewData: FamilyCardModernData = useMemo(() => {
    const husbandLastName = husband?.name.split(' ')[0]
    const wifeLastName = wife?.name.split(' ')[0]
    const familyName = husbandLastName || wifeLastName || null
    const districtName = idCsoport
      ? districts.find((d) => String(d.id) === idCsoport)?.nev ?? null
      : null
    return {
      familyId: editFamilyId ?? 0,
      familyName,
      members: [
        ...(husband ? [{ id: husband.id, name: husband.name, age: husband.age ?? null, role: 'csaladfo' as const }] : []),
        ...(wife ? [{ id: wife.id, name: wife.name, age: wife.age ?? null, role: 'hazastars' as const }] : []),
        ...children.map((child) => ({ id: child.id, name: child.name, age: child.age ?? null, role: 'gyerek' as const })),
      ],
      street: cUtcaName || null,
      houseNumber: cSzam || null,
      districtName,
      isActive: true,
      paymentStatus: 'unknown',
    }
  }, [husband, wife, children, cUtcaName, cSzam, idCsoport, districts, editFamilyId])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] overflow-y-auto overscroll-contain rounded-[1.75rem] border-border bg-card p-0 sm:w-[calc(100vw-2rem)] sm:max-w-3xl md:max-w-5xl lg:max-w-6xl [&_[data-slot=dialog-close]]:z-30 [&_[data-slot=dialog-close]]:size-11">
        <DialogHeader className="sticky top-0 z-20 border-b border-border/70 bg-gradient-to-br from-primary/10 via-card to-amber-50/45 px-5 py-5 pr-14 backdrop-blur dark:to-card sm:px-6">
          <DialogTitle className="flex flex-wrap items-center gap-2 font-heading text-xl text-foreground sm:text-2xl">
            {editFamilyId ? 'Család szerkesztése' : 'Új család létrehozása'}
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300">
              <Sparkles className="size-3.5" />
              élő karton-előnézet
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-5 px-4 py-5 sm:px-6 md:grid-cols-[minmax(0,1fr)_minmax(300px,360px)]">
          <div className="space-y-4">
          {/* Férj */}
          <div
            ref={(el) => { fieldRefs.current.husband = el }}
            className="relative space-y-2 rounded-2xl border border-border/60 bg-background/50 p-4"
          >
            <Label htmlFor={husband ? undefined : 'family-husband-search'} className="font-semibold text-foreground">Férj</Label>
            {husband ? (
              <div className="flex items-center justify-between gap-2 rounded-xl border border-primary/10 bg-primary/5 p-2">
                <Badge className="min-h-8 bg-primary/10 text-primary hover:bg-primary/10">♂ {husband.name}</Badge>
                <Button variant="ghost" size="icon" className="size-11 shrink-0 rounded-xl text-destructive" onClick={() => setHusband(null)} aria-label="Férj eltávolítása">✕</Button>
              </div>
            ) : (
              renderSearchInput('husband', 'family-husband-search', 'Keresés név alapján (2+ karakter)…')
            )}
            {!husband && renderSearchDropdown('husband')}
          </div>

          {/* Feleség */}
          <div
            ref={(el) => { fieldRefs.current.wife = el }}
            className="relative space-y-2 rounded-2xl border border-border/60 bg-background/50 p-4"
          >
            <Label htmlFor={wife ? undefined : 'family-wife-search'} className="font-semibold text-foreground">Feleség</Label>
            {wife ? (
              <div className="flex items-center justify-between gap-2 rounded-xl border border-primary/10 bg-primary/5 p-2">
                <Badge className="min-h-8 bg-primary/10 text-primary hover:bg-primary/10">♀ {wife.name}</Badge>
                <Button variant="ghost" size="icon" className="size-11 shrink-0 rounded-xl text-destructive" onClick={() => setWife(null)} aria-label="Feleség eltávolítása">✕</Button>
              </div>
            ) : (
              renderSearchInput('wife', 'family-wife-search', 'Keresés név alapján (2+ karakter)…')
            )}
            {!wife && renderSearchDropdown('wife')}
          </div>

          {/* Párkapcsolat (2026-08-04, PR-27) — csak ha mindkét fél megvan */}
          {husband && wife && (
            <div className="space-y-3 rounded-2xl border border-border/60 bg-background/50 p-4">
              <Label className="font-semibold text-foreground">A pár kapcsolata</Label>
              <div className="flex flex-col gap-2 min-[420px]:flex-row">
                {([
                  { value: 'hazastars' as const, label: 'Házasság', hint: 'anyakönyvezett' },
                  { value: 'elettars' as const, label: 'Élettársi kapcsolat', hint: 'nem anyakönyvezett' },
                ]).map((opt) => (
                  <label
                    key={opt.value}
                    className={`flex min-h-11 flex-1 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm transition-colors ${
                      aktivParkapcsolat === opt.value
                        ? 'border-primary/40 bg-primary/10 text-primary'
                        : 'border-border/60 bg-background/70'
                    }`}
                  >
                    <input
                      type="radio"
                      name="family-parkapcsolat"
                      className="size-4"
                      checked={aktivParkapcsolat === opt.value}
                      onChange={() => chooseParkapcsolat(opt.value)}
                    />
                    <span className="font-medium">{opt.label}</span>
                    <span className="text-xs text-muted-foreground">({opt.hint})</span>
                  </label>
                ))}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="family-par-datum" className="text-xs font-medium text-muted-foreground">
                  {aktivParkapcsolat === 'elettars' ? 'Az együttélés kezdete (ha ismert)' : 'Házasságkötés dátuma (ha ismert)'}
                </Label>
                <Input
                  id="family-par-datum"
                  type="date"
                  value={aktivParDatum}
                  disabled={!aktivParkapcsolat}
                  onChange={(e) => setParDatum(e.target.value)}
                  className={FIELD_INPUT_CLASS}
                />
                <p className="text-xs leading-5 text-muted-foreground">
                  A jelölés a családfán is megjelenik. Ha a házasság szerepel az anyakönyvben, a dátum onnan is
                  automatikusan rögzül — itt csak akkor írd felül, ha pontosabbat tudsz.
                </p>
              </div>
            </div>
          )}

          {/* Gyerekek */}
          <div
            ref={(el) => { fieldRefs.current.child = el }}
            className="relative space-y-2 rounded-2xl border border-border/60 bg-background/50 p-4"
          >
            <Label htmlFor="family-child-search" className="font-semibold text-foreground">Gyermekek</Label>
            {children.length > 0 && (
              <div className="mb-1 flex flex-wrap gap-2">
                {children.map(c => (
                  <Badge key={c.id} variant="outline" className="min-h-11 gap-1 rounded-full border-primary/15 bg-primary/5 pl-3 pr-0.5 text-xs text-primary">
                    {c.name}
                    <button
                      type="button"
                      className="inline-flex size-11 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => removeChild(c.id)}
                      aria-label={`${c.name} eltávolítása`}
                    >
                      ✕
                    </button>
                  </Badge>
                ))}
              </div>
            )}
            {renderSearchInput('child', 'family-child-search', 'Gyermek hozzáadása (keresés)…')}
            {renderSearchDropdown('child')}
          </div>

          {/* Cím */}
          <div className="grid grid-cols-1 gap-3 rounded-2xl border border-border/60 bg-background/50 p-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="family-street" className="font-semibold text-foreground">Utca</Label>
              <Input
                id="family-street"
                value={cUtcaName}
                readOnly
                placeholder="A kiválasztott tag címéből"
                className={`${FIELD_INPUT_CLASS} bg-muted/45 text-muted-foreground`}
              />
              <p className="text-xs text-muted-foreground">A kiválasztott fél lakcíméből töltődik</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="family-house-number" className="font-semibold text-foreground">Házszám</Label>
              <Input id="family-house-number" value={cSzam} onChange={e => setCSzam(e.target.value)}
                placeholder="Pl. 12/A" className={FIELD_INPUT_CLASS} />
            </div>
          </div>

          {/* Körzet — opcionális */}
          <div className="space-y-2 rounded-2xl border border-border/60 bg-background/50 p-4">
            <Label htmlFor="family-district" className="font-semibold text-foreground">Körzet</Label>
            <select
              id="family-district"
              value={idCsoport}
              onChange={e => setIdCsoport(e.target.value)}
              className={'w-full px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring/20 ' + FIELD_INPUT_CLASS}
            >
              <option value="">— Nincs körzet —</option>
              {districts.map(d => (
                <option key={d.id} value={d.id}>{d.nev}</option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              A család körzethez rendelése — a presbiteri látogatások és körzeti riportok ide csoportosítják.
            </p>
          </div>

          </div>

          {/* ─── JOBB OSZLOP: Élő karton-előnézet ─── */}
          <aside className="md:sticky md:top-[5.75rem] md:self-start">
            <div className="mb-3 rounded-2xl border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-900 dark:bg-amber-950/30">
              <p className="text-[11px] leading-relaxed text-amber-900 dark:text-amber-200">
                <Sparkles className="size-3 inline mr-1 text-amber-600" />
                Ahogy gépeled / választod az adatokat, a családi karton automatikusan
                kitöltődik. A sárga figyelmeztetésnél a kártya megmutatja, mi hiányzik még.
              </p>
            </div>
            <FamilyCardModern data={previewData} />
          </aside>
        </div>

        {/* ─── Dupla-tagsági figyelmeztetés (PR-18) ─── */}
        {pendingConflicts && (
          <div ref={conflictRef} className="mx-4 mb-2 space-y-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/50 sm:mx-6">
            <div className="flex items-start gap-2">
              <TriangleAlert className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400" />
              <div className="text-sm leading-6 text-amber-900 dark:text-amber-100">
                <p className="font-semibold">Figyelem: dupla családtagság!</p>
                <p className="mt-1 text-xs leading-5">{pendingConflicts.warning}</p>
                <ul className="mt-1.5 space-y-0.5 text-xs">
                  {pendingConflicts.conflicts.map((c) => (
                    <li key={`${c.personId}-${c.familyId}`}>
                      <strong>{c.personName}</strong> — jelenleg: {c.familyName}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="flex flex-col gap-2 min-[420px]:flex-row">
              <Button
                className="min-h-11 flex-1 rounded-xl bg-amber-600 text-white hover:bg-amber-700"
                disabled={loading}
                onClick={() => void handleSubmit(true)}
              >
                {loading ? 'Mentés…' : 'Áthelyezés és mentés'}
              </Button>
              <Button variant="outline" className="min-h-11 rounded-xl" disabled={loading} onClick={() => setPendingConflicts(null)}>
                Mégse
              </Button>
            </div>
          </div>
        )}

        {/* ─── Alsó akciósor ─── */}
        <div className="sticky bottom-0 z-20 mt-1 flex gap-2 border-t border-border/70 bg-card/95 px-4 py-3 shadow-[0_-14px_30px_-26px_rgba(15,67,61,0.7)] backdrop-blur sm:justify-end sm:px-6">
          <Button variant="outline" className="h-11 flex-1 rounded-xl sm:flex-none sm:px-6" disabled={loading} onClick={() => onOpenChange(false)}>Mégse</Button>
          <Button className="h-11 flex-1 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 sm:flex-none sm:px-8" onClick={() => void handleSubmit(false)} disabled={loading}>
            {loading ? 'Mentés...' : 'Mentés'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
