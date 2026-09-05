'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { UserPlus, Users, Printer, Save, Sparkles } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { saveBaptism, getNextEgyhaziSzam, getParentsForChild, getMarriageBetween } from '@/app/(dashboard)/anyakonyv/actions'
import { MemberSearchSelect, type MemberSearchResult } from '@/components/registry/member-search-select'
import { MemberFormDialog } from '@/components/modals/member-form-dialog'
// 2026-08-25 (Endre): sikeres mentés után — ha a munkanapló-kapcsoló BE volt —
// a munkanapló-rögzítő előtöltve nyílik meg, hogy a szolgálat (jelenlét,
// persely) azonnal rögzíthető legyen.
import { WorklogDialog } from '@/components/modals/worklog-dialog'
import type { WorklogEntry } from '@/lib/constants/worklog'
import { CertificateRenderer } from '@/components/registry/emleklap/certificate-renderer'
import {
  EMLEKLAP_TEMPLATES_MAP,
  fillTemplate,
  type EmleklapTemplate,
} from '@/lib/constants/emleklap-templates'
import {
  extractCityFromCongregationName,
  formatHungarianDate,
  formatMotherNameForEmleklap,
} from '@/lib/utils/emleklap-data-mapper'
import { toast } from 'sonner'
// 2026-09-05: HELYI „ma" — az UTC-s toISOString() éjfél és hajnali 3 között az előző napot adta.
import { todayYmd } from '@/lib/utils/program-day'

interface BaptismDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  congregationName: string
  /**
   * 2026-09-05 (naptár ⇄ anyakönyv, D1): a naptár-csempéről indított
   * anyakönyvezés a TERVEZETT program napjával nyitja a dialógust. Csak ÚJ
   * rögzítésnél számít; szerkesztéskor a bejegyzés saját dátuma az úr.
   */
  initialDate?: string | null
  /**
   * Sikeres mentés után a bejegyzés `id`-jával hívódik (a bezárás ELŐTT) — a
   * naptár ezzel köti a programot a bejegyzéshez. Az Anyakönyv fülön nincs
   * megadva, ott a viselkedés betűre a korábbi.
   */
  onSaved?: (id: number) => void
  editEntry?: {
    id: number
    datum?: string
    okirat?: string
    egyhazi_szam?: string
    lelkeszneve?: string
    keresztszulok?: string
    alapige?: string
    megjegyzes?: string
    szemely?: { id: number; csaladnev: string; k_nev: string; ferfi: boolean | null; sz_datum: string | null } | null
    [key: string]: unknown
  } | null
}

// 2026-05-29: jól látható input-stílus — a felhasználói visszajelzés alapján
// a default bg-card/78 (78% áttetszős) egybeolvad a dialog hátterével.
// Az itt definiált osztály-szett bg-white + finom shadow-t ad, hasonlóan
// a MemberSearchSelect (apa/anya) megjelenéséhez.
const FIELD_INPUT_CLASS = 'bg-white shadow-sm border-slate-300'

export function BaptismDialog({ open, onOpenChange, congregationName, editEntry, initialDate, onSaved }: BaptismDialogProps) {
  const [loading, setLoading] = useState(false)
  const [selectedPerson, setSelectedPerson] = useState<MemberSearchResult | null>(null)
  const [familyAutoLoaded, setFamilyAutoLoaded] = useState(false)
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  // 2026-08-25: a mentés utáni munkanapló-rögzítő (a szerver-szinkron által
  // már létrehozott munkanaplo sorral, szerkesztés módban — így nincs duplikáció).
  const [worklogOpen, setWorklogOpen] = useState(false)
  const [worklogPrefill, setWorklogPrefill] = useState<WorklogEntry | null>(null)

  const [father, setFather] = useState<MemberSearchResult | null>(null)
  const [mother, setMother] = useState<MemberSearchResult | null>(null)
  const [apjaneveText, setApjaneveText] = useState<string | null>(null)
  const [anyjaneveText, setAnyjaneveText] = useState<string | null>(null)
  const [parentDiag, setParentDiag] = useState<string | null>(null)

  const [datum, setDatum] = useState('')
  const [egyhaziSzam, setEgyhaziSzam] = useState('')
  const [okirat, setOkirat] = useState('')
  const [lelkesz, setLelkesz] = useState('')
  const [keresztszulok, setKeresztszulok] = useState('')
  const [alapige, setAlapige] = useState('')
  const [megjegyzes, setMegjegyzes] = useState('')
  const [munkanaploba, setMunkanaploba] = useState(false)
  const [apavallas, setApavallas] = useState('')
  const [anyavallas, setAnyavallas] = useState('')
  const [anyaLeanykori, setAnyaLeanykori] = useState('')
  // 2026-05-29: gondnok neve az emléklap-vászonhoz. localStorage-be is
  // mentődik, hogy a következő rögzítéskor ne kelljen újra beírni
  // (gyülekezetenként 1 gondnok jellemzően).
  const [gondnok, setGondnok] = useState('')
  // 2026-05-30: a szülők egyházi házassági státusza. Auto-load amikor mindkét
  // szülő ki van választva (hazassag tábla lekérdezés). Ettől függ az anya
  // neve az emléklapon: ha igen → „Kádár Zoltánné Tódor Enikő";
  // ha nem → csak a leánykori név („Tódor Enikő").
  //
  // 2026-08-11: a jelölést a SZÜLŐ-PÁRHOZ KÖTVE tároljuk, és RENDER KÖZBEN
  // származtatjuk. Korábban egy effect törzse hívta szinkronban a
  // `setEgyhaziHazassag(false)`-t, ha hiányzott valamelyik szülő
  // (react-hooks/set-state-in-effect → kaszkádoló újrarender). Ha a pár nincs
  // meg, vagy megváltozott, a származtatott érték magától `false` — a látvány
  // betű szerint ugyanaz, csak nincs plusz render-kör.
  const [egyhaziHazassagState, setEgyhaziHazassagState] = useState<{
    pairKey: string
    value: boolean
    auto: boolean
  } | null>(null)
  const parentPairKey = father && mother ? `${father.id}|${mother.id}` : null
  const egyhaziHazassagCurrent =
    parentPairKey !== null && egyhaziHazassagState?.pairKey === parentPairKey
      ? egyhaziHazassagState
      : null
  const egyhaziHazassag = egyhaziHazassagCurrent?.value ?? false
  const egyhaziHazassagAuto = egyhaziHazassagCurrent?.auto ?? false

  // 2026-05-29: az emléklap-vászon ref-je a print-funkcióhoz
  const printRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      if (editEntry) {
        setSelectedPerson(editEntry.szemely
          ? { ...editEntry.szemely, cnp: null, c_szam: null }
          : null)
        setDatum((editEntry.datum as string)?.split('T')[0] || '')
        setEgyhaziSzam((editEntry.egyhazi_szam as string) || '')
        setOkirat((editEntry.okirat as string) || '')
        setLelkesz((editEntry.lelkeszneve as string) || '')
        setKeresztszulok((editEntry.keresztszulok as string) || '')
        setAlapige((editEntry.alapige as string) || '')
        // 2026-05-30: gondnok visszatöltése localStorage-ból szerkesztés módban is.
        try {
          const savedGondnok = localStorage.getItem('kartoteka.emleklap.gondnokName')
          if (savedGondnok) setGondnok(savedGondnok)
          else setGondnok('')
        } catch { setGondnok('') }
        const megj = (editEntry.megjegyzes as string) || ''
        const sablonIdx = megj.indexOf('|sablon:')
        if (sablonIdx > -1) {
          setMegjegyzes(megj.slice(0, sablonIdx))
          try {
            const s = JSON.parse(megj.slice(sablonIdx + 8))
            setApavallas(s.apa_vallas || '')
            setAnyavallas(s.anya_vallas || '')
            setAnyaLeanykori(s.anya_leanyneve || '')
          } catch {
            setApavallas(''); setAnyavallas(''); setAnyaLeanykori('')
          }
        } else {
          setMegjegyzes(megj); setApavallas(''); setAnyavallas(''); setAnyaLeanykori('')
        }
        setFather(null); setMother(null); setFamilyAutoLoaded(false)
        setApjaneveText(null); setAnyjaneveText(null); setParentDiag(null)
        // 2026-06-12 (Endre #3-4 munkanapló): szerkesztéskor a mentett pipát
        // töltjük vissza — korábban fixen false volt, így a szerkesztés-mentés
        // némán kikapcsolta a munkanapló-rögzítést.
        setMunkanaploba(!!editEntry.munkanaploba)
        return
      }
      setSelectedPerson(null)
      setFather(null); setMother(null); setFamilyAutoLoaded(false)
      setApjaneveText(null); setAnyjaneveText(null); setParentDiag(null)
      // 2026-09-05: a naptárból a tervezett program napja, különben a HELYI mai nap.
      const kezdoDatum = initialDate || todayYmd()
      setDatum(kezdoDatum); setOkirat(''); setLelkesz(''); setKeresztszulok('')
      // 2026-08-25 (Endre): új rögzítésnél a munkanapló-kapcsoló ALAPBÓL BE —
      // a kazuália szinte mindig elvégzett szolgálat is.
      setAlapige(''); setMegjegyzes(''); setMunkanaploba(true)
      setApavallas(''); setAnyavallas(''); setAnyaLeanykori('')
      // 2026-05-29: gondnok visszatöltése localStorage-ból (sticky)
      try {
        const savedGondnok = localStorage.getItem('kartoteka.emleklap.gondnokName')
        if (savedGondnok) setGondnok(savedGondnok)
      } catch { /* SSR / private mode */ }
      getNextEgyhaziSzam('baptism', Number(kezdoDatum.slice(0, 4)) || new Date().getFullYear()).then(value => {
        if (!cancelled) setEgyhaziSzam(value)
      })
    })
    return () => { cancelled = true }
  }, [open, editEntry, initialDate])

  useEffect(() => {
    // 2026-05-30: szerkesztés módban is futtatjuk az auto-load-ot, hogy a
    // mentett szülők újból megjelenjenek. (Az eredeti `editEntry` blokk
    // miatt szerkesztéskor üresen nyíltak a szülő-mezők, és a felhasználó
    // úgy érezte, "nem mentődött el semmi".)
    if (!open) return
    if (!selectedPerson) return
    if (familyAutoLoaded) return
    if (father || mother) return

    let cancelled = false
    if (process.env.NODE_ENV === 'development') {
      console.log(`[baptism-dialog] szülő-load indul, person.id=${selectedPerson.id}`)
    }
    getParentsForChild(selectedPerson.id).then(info => {
      if (cancelled) return
      if (process.env.NODE_ENV === 'development') {
        console.log(`[baptism-dialog] getParentsForChild válasz:`, info)
      }

      if (info.apa) {
        setFather({
          id: info.apa.id!,
          csaladnev: info.apa.csaladnev,
          k_nev: info.apa.k_nev,
          ferfi: true,
          sz_datum: info.apa.sz_datum,
          cnp: info.apa.cnp,
          c_szam: info.apa.c_szam,
          adrlocality: info.apa.adrlocality,
          adrstreet: info.apa.adrstreet,
          vallas: info.apa.vallas,
        })
        // 2026-05-29: ha az apa-rekordban van vallás és a mezőnk még üres,
        // automatikusan kitöltjük.
        if (info.apa.vallas && !apavallas) setApavallas(info.apa.vallas)
      }
      if (info.anya) {
        setMother({
          id: info.anya.id!,
          csaladnev: info.anya.csaladnev,
          k_nev: info.anya.k_nev,
          ferfi: false,
          sz_datum: info.anya.sz_datum,
          cnp: info.anya.cnp,
          c_szam: info.anya.c_szam,
          adrlocality: info.anya.adrlocality,
          adrstreet: info.anya.adrstreet,
          vallas: info.anya.vallas,
        })
        if (info.anya.vallas && !anyavallas) setAnyavallas(info.anya.vallas)
      }
      if (info.anyaLeanyneve && !anyaLeanykori) setAnyaLeanykori(info.anyaLeanyneve)

      setApjaneveText(info.apa ? null : info.apjaneveText)
      setAnyjaneveText(info.anya ? null : info.anyjaneveText)

      const d = info.diagnostic
      const lines: string[] = []
      if (!d.hasGyerekRow) lines.push('A tag NINCS családhoz rendelve (gyerek tábla üres).')
      else if (!d.csaladId) lines.push('Van gyerek-rekord, de nincs hozzá csalad-rekord.')
      else lines.push(`Család #${d.csaladId} — apa szemely.id=${d.csaladFerfiId ?? '—'}, anya szemely.id=${d.csaladNoId ?? '—'}.`)
      if (d.szemelyApjaCnp) lines.push(`szemely.id_apja CNP: ${d.szemelyApjaCnp} → ${d.szemelyApjaCnpResolved ? 'sikerült feloldani' : '⚠️ NEM sikerült feloldani'}.`)
      if (d.szemelyAnyjaCnp) lines.push(`szemely.id_anyja CNP: ${d.szemelyAnyjaCnp} → ${d.szemelyAnyjaCnpResolved ? 'sikerült feloldani' : '⚠️ NEM sikerült feloldani'}.`)
      if (info.apjaneveText && !info.apa) lines.push(`Csak szöveg-apa: "${info.apjaneveText}" — kézzel keress rá.`)
      if (info.anyjaneveText && !info.anya) lines.push(`Csak szöveg-anya: "${info.anyjaneveText}" — kézzel keress rá.`)
      setParentDiag(lines.length > 0 ? lines.join(' ') : null)

      if (info.fromCsalad && (info.apa || info.anya)) {
        toast.success('Szülők automatikusan kitöltve a családi adatokból.', { duration: 3500 })
      }
      setFamilyAutoLoaded(true)
    }).catch(err => {
      if (cancelled) return
      console.error('[baptism-dialog] getParentsForChild HIBA:', err)
      setParentDiag(`Hiba a szülők lekérdezésénél: ${err.message || String(err)}`)
      setFamilyAutoLoaded(true)
    })
    return () => { cancelled = true }
  }, [selectedPerson, open, editEntry, familyAutoLoaded, father, mother, anyaLeanykori, apavallas, anyavallas])

  // 2026-05-29: manuális szülő-kiválasztáskor is auto-fill (vallás + leánykori név).
  function handleFatherChange(p: MemberSearchResult | null) {
    setFather(p)
    if (p?.vallas && !apavallas) setApavallas(p.vallas)
  }
  function handleMotherChange(p: MemberSearchResult | null) {
    setMother(p)
    if (p?.vallas && !anyavallas) setAnyavallas(p.vallas)
    if (p?.szcs_nev && !anyaLeanykori) setAnyaLeanykori(p.szcs_nev)
  }

  // 2026-05-30: ha mindkét szülő ki van választva, megnézzük a `hazassag`
  // táblát — ha van bejegyzés (id_ferfi=apa.id ÉS id_no=anya.id), akkor
  // automatikusan beállítjuk az egyházi-házasság jelzőt. A felhasználó utólag
  // átírhatja a checkbox-szal.
  useEffect(() => {
    if (!father || !mother || !parentPairKey) return
    let cancelled = false
    getMarriageBetween(father.id, mother.id).then((found) => {
      if (cancelled) return
      setEgyhaziHazassagState({ pairKey: parentPairKey, value: found, auto: found })
    })
    return () => { cancelled = true }
  }, [father, mother, parentPairKey])

  function handlePersonChange(p: MemberSearchResult | null) {
    setSelectedPerson(p)
    setFamilyAutoLoaded(false)
    setFather(null); setMother(null)
    setApjaneveText(null); setAnyjaneveText(null); setParentDiag(null)
  }

  function handleQuickAddOpenChange(open: boolean) {
    setQuickAddOpen(open)
    if (!open) {
      toast.info('Ha új személyt adtál hozzá, most kereshető a fenti mezőben.', { duration: 3500 })
    }
  }

  // ─── 2026-05-29: élő emléklap-preview ────────────────────────────────────
  // 2026-05-30: dinamikus variant (erek / kerek / kek). A localStorage-be is
  // mentődik, hogy a következő rögzítéskor a felhasználó preferenciája maradjon.
  const [selectedVariant, setSelectedVariant] = useState<'erek' | 'kerek' | 'kek'>(() => {
    try {
      const saved = (typeof window !== 'undefined' && localStorage.getItem('kartoteka.emleklap.kereszteloVariant')) || 'erek'
      return (saved === 'kerek' || saved === 'kek') ? saved : 'erek'
    } catch { return 'erek' }
  })
  function changeVariant(v: 'erek' | 'kerek' | 'kek') {
    setSelectedVariant(v)
    try { localStorage.setItem('kartoteka.emleklap.kereszteloVariant', v) } catch {}
  }
  const template: EmleklapTemplate = EMLEKLAP_TEMPLATES_MAP[`kereszteles-${selectedVariant}`] ?? EMLEKLAP_TEMPLATES_MAP['kereszteles-erek']

  const fieldValues = useMemo(() => {
    const childName = selectedPerson
      ? `${selectedPerson.csaladnev || ''} ${selectedPerson.k_nev || ''}`.trim()
      : ''
    const fatherName = father ? `${father.csaladnev || ''} ${father.k_nev || ''}`.trim() : ''
    // 2026-05-30: anya neve csak akkor formázva, ha mother ki van választva.
    // Szerkesztés módban (mother=null) ne mutassuk a leánykori nevet egyedül a
    // vásznon — várjuk meg amíg a felhasználó kiválasztja az anyát.
    const motherName = mother
      ? formatMotherNameForEmleklap({
          motherCsaladnev: mother.csaladnev,
          motherKnev: mother.k_nev,
          leanyneveCsaladnev: anyaLeanykori || mother.szcs_nev,
          fatherCsaladnev: father?.csaladnev,
          fatherKnev: father?.k_nev,
          churchMarried: egyhaziHazassag,
        })
      : ''
    const parentsNames = [fatherName, motherName].filter(Boolean).join(' és ')

    const childBirthDate = selectedPerson?.sz_datum
      ? formatHungarianDate(selectedPerson.sz_datum) + '-én'
      : ''
    const baptismDate = datum ? formatHungarianDate(datum) + '-én' : ''
    const issueDate = datum ? formatHungarianDate(datum) : ''
    const issueLocation = extractCityFromCongregationName(congregationName)

    const data: Record<string, string> = {
      congregationName: congregationName || '',
      fullName: childName,
      parentsNames: parentsNames || '',
      birthPlace: '',
      birthDate: childBirthDate,
      // EREK paragrafusban: "akit a {{baptismCongregation}} {{baptismDate}}..."
      // → '-ben' suffix-szel adjuk. A KÉK eventText viszont {{congregationName}}-t
      // használ (natural case, suffix nélkül), így a KÉK preview is helyes.
      baptismCongregation: congregationName ? congregationName + 'ben' : '',
      baptismDate,
      issueLocation,
      issueDate,
      // 2026-05-30: a pastorName/wardenName proper case-ben passzol. Az EREK
      // template textTransform: 'uppercase'-szel CSS-en uppercase-eli a megjelenítést;
      // a KÉK natural case-t mutat.
      pastorName: lelkesz || '',
      wardenName: gondnok || '',
      // 2026-05-30 (KÉK template): igevers + igehely default. A vásznon
      // in-place szerkeszthető, ha a user másikat akar.
      verseText: 'Engedjétek hozzám jönni a kisgyermekeket,\nés ne tiltsátok el őket tőlem;\nmert ilyeneké az Isten országa.',
      verseReference: 'Márk 10,14',
    }

    const out: Record<string, string> = {}
    for (const field of template.fields) {
      out[field.id] = fillTemplate(field.defaultValue, data)
    }
    return out
  }, [template, selectedPerson, father, mother, anyaLeanykori, egyhaziHazassag, datum, lelkesz, gondnok, congregationName])

  // 2026-08-25: a mentés eredménye a munkanapló-előtöltést is hozza (ha a
  // kapcsoló BE volt) — a hívó ezzel nyitja meg a munkanapló-rögzítőt.
  async function handleSubmit(): Promise<{ ok: boolean; id: number | null; worklogEntry: WorklogEntry | null }> {
    if (!selectedPerson) { toast.error('Válasszon személyt!'); return { ok: false, id: null, worklogEntry: null } }
    if (!datum) { toast.error('A dátum kötelező!'); return { ok: false, id: null, worklogEntry: null } }
    setLoading(true)
    const fatherName = father ? `${father.csaladnev || ''} ${father.k_nev || ''}`.trim() : ''
    // 2026-05-30: az anya neve CSAK akkor formázva, ha a felhasználó kiválasztotta.
    const motherName = mother
      ? formatMotherNameForEmleklap({
          motherCsaladnev: mother.csaladnev,
          motherKnev: mother.k_nev,
          leanyneveCsaladnev: anyaLeanykori || mother.szcs_nev,
          fatherCsaladnev: father?.csaladnev,
          fatherKnev: father?.k_nev,
          churchMarried: egyhaziHazassag,
        })
      : ''
    const fatherCnp = father?.cnp || ''
    const motherCnp = mother?.cnp || ''

    // 2026-05-30: diagnosztikai napló — a "nem mentette" hiba debug-jához.
    // Megnézhető a böngésző DevTools konzoljában; a szerver-actions log-ban
    // csak részben látszik az adat (Next.js a hosszabb objektumokat csonkítja).
    const payload = {
      id: editEntry?.id,
      id_szemely: selectedPerson.id,
      datum,
      okirat: okirat || null,
      egyhazi_szam: egyhaziSzam || null,
      lelkeszneve: lelkesz || null,
      keresztszulok: keresztszulok || null,
      alapige: alapige || null,
      apjaneve: fatherName || null,
      anyjaneve: motherName || null,
      id_apja_cnp: fatherCnp || null,
      id_anyja_cnp: motherCnp || null,
      // 2026-08-04 (PR-40): a kiválasztott szülő azonosítója is megy — CNP
      // nélkül nyilvántartott szülőnél eddig elmaradt a család-bekötés.
      id_apja_szemely: father?.id ?? null,
      id_anyja_szemely: mother?.id ?? null,
      apa_vallas: apavallas || null,
      anya_vallas: anyavallas || null,
      anya_leanyneve: anyaLeanykori || null,
      munkanaploba,
      megjegyzes: megjegyzes || null,
    }
    if (process.env.NODE_ENV !== 'production') {
      console.log('[baptism-dialog] handleSubmit payload:', payload)
      console.log('[baptism-dialog] editEntry:', editEntry)
    }
    const result = await saveBaptism(payload)
    setLoading(false)
    if (result.error) {
      toast.error(result.error)
      return { ok: false, id: null, worklogEntry: null }
    }
    toast.success('Keresztelés rögzítve!')
    // 2026-08-01 (PR-18): dupla-tagsági figyelmeztetés az auto-család őrtől
    if ('warning' in result && result.warning) toast.warning(result.warning, { duration: 9000 })
    return {
      ok: true,
      // 2026-09-05: a bejegyzés id-ja a hívónak (naptár ⇄ anyakönyv kötés).
      id: 'id' in result && typeof result.id === 'number' ? result.id : null,
      worklogEntry: 'worklogEntry' in result && result.worklogEntry
        ? (result.worklogEntry as WorklogEntry)
        : null,
    }
  }

  /**
   * 2026-08-25 (Endre): sikeres mentés UTÁN a munkanapló-rögzítő megnyitása
   * előtöltve (a szerver-szinkron által írt sorral: dátum + kanonikus jellege
   * [F./N. keresztelő] + cím). CSAK akkor nyílik, ha a szolgálat még nincs
   * felvéve: új rögzítésnél, vagy ha a kapcsoló szerkesztéskor most került
   * BE-re — a sima szerkesztés-mentés nem dobja fel újra. A kis késleltetés
   * a dupla-modal ellen: előbb záródjon be az anyakönyvi dialógus.
   */
  function maybeOpenWorklog(entry: WorklogEntry | null) {
    if (!entry) return
    if (editEntry && editEntry.munkanaploba) return
    setWorklogPrefill(entry)
    toast.info('A szolgálat előtöltve a munkanaplóba — egészítsd ki a jelenléttel és a perselypénzzel, majd mentsd.', { duration: 6000 })
    setTimeout(() => setWorklogOpen(true), 250)
  }

  async function handleSaveOnly() {
    const res = await handleSubmit()
    if (!res.ok) return
    if (res.id != null) onSaved?.(res.id)
    onOpenChange(false)
    maybeOpenWorklog(res.worklogEntry)
  }

  /**
   * 2026-05-29: Mentés és nyomtatás előtt ellenőrzi a lelkész + gondnok mező
   * kitöltöttségét. Ha hiányzik, prompt-tal bekéri, majd elmenti és nyomtat.
   */
  async function handleSaveAndPrint() {
    let pastor = lelkesz.trim()
    let warden = gondnok.trim()
    if (!pastor) {
      const v = window.prompt(
        'A lelkész neve nincs megadva — az emléklapra kerül. Add meg most:',
        '',
      )
      if (v === null) return
      pastor = v.trim()
      if (pastor) setLelkesz(pastor)
    }
    if (!warden) {
      const v = window.prompt(
        'A gondnok neve nincs megadva — az emléklapra kerül. Add meg most (a jövőben automatikusan használjuk):',
        '',
      )
      if (v === null) return
      warden = v.trim()
      if (warden) {
        setGondnok(warden)
        try { localStorage.setItem('kartoteka.emleklap.gondnokName', warden) } catch {}
      }
    }
    const res = await handleSubmit()
    if (!res.ok) return
    if (res.id != null) onSaved?.(res.id)
    // Várunk egy tick-et, hogy a fieldValues a friss state-tel frissüljön a print előtt
    setTimeout(() => {
      handlePrint()
      setTimeout(() => {
        onOpenChange(false)
        maybeOpenWorklog(res.worklogEntry)
      }, 500)
    }, 50)
  }

  function handlePrint() {
    if (!printRef.current) return
    const html = printRef.current.outerHTML
    const win = window.open('', '_blank', 'width=900,height=1200')
    if (!win) {
      toast.error('A böngésző blokkolta a popup-ot. Engedélyezd a felugró ablakokat.')
      return
    }
    win.document.write(`<!DOCTYPE html><html lang="hu"><head><meta charset="utf-8"><title>Keresztelői emléklap</title>
      <style>
        @page { size: A4 portrait; margin: 0; }
        html, body { margin: 0; padding: 0; background: white; }
        body { display: flex; align-items: center; justify-content: center; }
        .certificate-renderer { width: 210mm !important; height: 297mm !important; max-width: 210mm !important; aspect-ratio: 210/297 !important; }
        .certificate-renderer img { width: 100% !important; height: 100% !important; }
        @media print {
          html, body { width: 210mm; height: 297mm; }
          .certificate-renderer { box-shadow: none !important; }
        }
      </style>
    </head><body>${html}<script>window.onload = () => { setTimeout(() => window.print(), 200); };</script></body></html>`)
    win.document.close()
  }

  // 2026-09-05: a jövőbeli dátum NEM tiltott (a naptárból a tervezett napra
  // nyílik a dialógus), csak JELEZZÜK — az anyakönyv a megtörtént eseményt rögzíti.
  const jovobeli = !!datum && datum > todayYmd()

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        {/* Szélesebb dialog hogy 2-oszlopos layout legyen (form + emléklap) */}
        <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-3xl md:max-w-5xl lg:max-w-6xl xl:max-w-7xl max-h-[92dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {editEntry ? 'Keresztelés szerkesztése' : 'Keresztelés rögzítése'}
              <span className="text-xs font-normal text-amber-600 inline-flex items-center gap-1">
                <Sparkles className="size-3.5" />
                élő emléklap-előnézet
              </span>
            </DialogTitle>
          </DialogHeader>

          {/*
            2026-05-29 v2: 2-oszlopos elrendezés már md (≥768px) breakpoint-tól,
            nem csak lg-tól (1024). A user-szándék: a preview szinte mindig
            jobb oldalt látsszon, csak nagyon keskeny mobilon ugorjon alulra.
          */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,400px)]">
            {/* ─── BAL OSZLOP: Adatbeviteli űrlap ─── */}
            <div className="space-y-4 md:max-h-[78dvh] md:overflow-y-auto md:pr-2">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label>Megkeresztelt személy *</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 text-xs text-blue-600 hover:bg-blue-50 hover:text-blue-700"
                    onClick={() => setQuickAddOpen(true)}
                  >
                    <UserPlus className="size-3.5" />
                    Új személy
                  </Button>
                </div>
                <MemberSearchSelect
                  value={selectedPerson}
                  onChange={handlePersonChange}
                  placeholder="Keresés (családnév, keresztnév)…"
                />
                <p className="text-[11px] text-slate-500">
                  Ha a keresztelendő még nincs a tagnyilvántartásban, az „Új személy" gombbal hozzáadhatod.
                </p>
              </div>

              <Separator />
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                  <Users className="size-4 text-slate-500" />
                  Szülők
                </h4>
                {familyAutoLoaded && (father || mother) && (
                  <span className="text-[10px] font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                    Családi adatokból
                  </span>
                )}
              </div>

              {(apjaneveText || anyjaneveText) && (
                <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-2.5 text-xs text-amber-800">
                  <p className="font-medium mb-1">A korábbi adatok szerint a szülők neve:</p>
                  {apjaneveText && <div>• Édesapa: <span className="font-semibold">{apjaneveText}</span></div>}
                  {anyjaneveText && <div>• Édesanya: <span className="font-semibold">{anyjaneveText}</span></div>}
                  <p className="mt-1.5 text-[11px] text-amber-700/80">
                    Csak szövegként rögzítették — keresd ki őket az alábbi mezőkben.
                  </p>
                </div>
              )}

              {parentDiag && familyAutoLoaded && !father && !mother && !apjaneveText && !anyjaneveText && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-[11px] text-slate-600">
                  <p className="font-medium mb-1">Miért nincs szülő-adat?</p>
                  <p className="text-slate-500">{parentDiag}</p>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Édesapa</Label>
                  <MemberSearchSelect
                    value={father}
                    onChange={handleFatherChange}
                    genderFilter={true}
                    placeholder="Apa keresése (férfi)…"
                  />
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Apa vallása</Label>
                    <Input value={apavallas} onChange={e => setApavallas(e.target.value)} className={`h-8 text-xs ${FIELD_INPUT_CLASS}`} placeholder="Református" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Édesanya</Label>
                  <MemberSearchSelect
                    value={mother}
                    onChange={handleMotherChange}
                    genderFilter={false}
                    placeholder="Anya keresése (nő)…"
                  />
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Anya vallása</Label>
                    <Input value={anyavallas} onChange={e => setAnyavallas(e.target.value)} className={`h-8 text-xs ${FIELD_INPUT_CLASS}`} placeholder="Református" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Leánykori név (családnév)</Label>
                    <Input value={anyaLeanykori} onChange={e => setAnyaLeanykori(e.target.value)} className={`h-8 text-xs ${FIELD_INPUT_CLASS}`} placeholder="pl. Tódor" />
                  </div>
                </div>
              </div>

              {/* 2026-05-30: egyházi házassági státusz — az anya neve formázásához */}
              {father && mother && (
                <div className={`rounded-md border p-2.5 text-xs flex items-start gap-2 ${
                  egyhaziHazassag ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200 bg-slate-50'
                }`}>
                  <input
                    type="checkbox"
                    id="egyhaziHazassag"
                    checked={egyhaziHazassag}
                    onChange={e => {
                      if (!parentPairKey) return
                      const checked = e.target.checked
                      setEgyhaziHazassagState(prev => ({
                        pairKey: parentPairKey,
                        value: checked,
                        // Az „automatikusan ellenőrizve" jelzés a kézi átállítás
                        // után is megmarad — ugyanúgy, mint korábban.
                        auto: prev?.pairKey === parentPairKey ? prev.auto : false,
                      }))
                    }}
                    className="mt-0.5 size-4"
                  />
                  <label htmlFor="egyhaziHazassag" className="flex-1 cursor-pointer leading-relaxed">
                    <div className="font-medium text-slate-800">
                      A szülők <strong>egyházilag házasok</strong>
                      {egyhaziHazassagAuto && egyhaziHazassag && (
                        <span className="ml-1.5 text-[10px] font-medium text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">
                          ✓ automatikusan ellenőrizve
                        </span>
                      )}
                    </div>
                    <div className="text-slate-500 mt-0.5">
                      Az emléklapon: „<strong className="text-slate-700">{formatMotherNameForEmleklap({
                        motherCsaladnev: mother.csaladnev,
                        motherKnev: mother.k_nev,
                        leanyneveCsaladnev: anyaLeanykori || mother.szcs_nev,
                        fatherCsaladnev: father.csaladnev,
                        fatherKnev: father.k_nev,
                        churchMarried: egyhaziHazassag,
                      })}</strong>"
                    </div>
                  </label>
                </div>
              )}

              <Separator />
              <h4 className="text-sm font-semibold text-slate-700">Részletek</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">
                    Egyházi anyakönyvi szám
                    <span className="ml-1 text-[10px] font-normal text-violet-600">(automatikus)</span>
                  </Label>
                  <Input value={egyhaziSzam} onChange={e => setEgyhaziSzam(e.target.value)} className={`font-mono text-violet-700 ${FIELD_INPUT_CLASS}`} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Állami anyakönyvi szám</Label>
                  <Input value={okirat} onChange={e => setOkirat(e.target.value)} placeholder="opcionális" className={FIELD_INPUT_CLASS} />
                </div>
                <div className="space-y-1.5">
                  <Label>Dátum *</Label>
                  <Input type="date" value={datum} onChange={e => setDatum(e.target.value)} className={FIELD_INPUT_CLASS} />
                </div>
              </div>
              {jovobeli && (
                <p className="text-[11px] font-medium text-destructive">
                  ⚠️ A dátum a jövőben van — az anyakönyv a MEGTÖRTÉNT eseményt rögzíti. Ha még csak tervezed az alkalmat, a naptárban programként is rögzítheted, és a megtörténte után anyakönyvezheted.
                </p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Lelkész</Label><Input value={lelkesz} onChange={e => setLelkesz(e.target.value)} className={FIELD_INPUT_CLASS} /></div>
                <div className="space-y-1.5"><Label>Keresztszülők</Label><Input value={keresztszulok} onChange={e => setKeresztszulok(e.target.value)} className={FIELD_INPUT_CLASS} /></div>
              </div>
              <div className="space-y-1.5">
                <Label>
                  Gondnok <span className="text-[10px] font-normal text-slate-500">(az emléklapra — automatikusan megőrződik a következő kereszteléshez)</span>
                </Label>
                <Input
                  value={gondnok}
                  onChange={e => setGondnok(e.target.value)}
                  className={FIELD_INPUT_CLASS}
                  placeholder="Gondnok teljes neve"
                  onBlur={() => {
                    try { if (gondnok) localStorage.setItem('kartoteka.emleklap.gondnokName', gondnok) } catch {}
                  }}
                />
              </div>
              <div className="space-y-1.5"><Label>Alapige</Label><Input value={alapige} onChange={e => setAlapige(e.target.value)} className={FIELD_INPUT_CLASS} /></div>
              <div className="space-y-1.5"><Label>Megjegyzés</Label><Input value={megjegyzes} onChange={e => setMegjegyzes(e.target.value)} className={FIELD_INPUT_CLASS} /></div>
              {/* 2026-08-25 (Endre): a kapcsoló új rögzítésnél alapból BE, és
                  mentés után előtöltve nyílik a munkanapló-rögzítő. */}
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={munkanaploba} onChange={e => setMunkanaploba(e.target.checked)} /> Megjelenjen a munkanaplóban?</label>
              {munkanaploba && (
                <p className="text-[11px] text-slate-500">
                  Mentés után megnyílik a munkanapló-rögzítő előtöltve — a jelenlét és a perselypénz azonnal kiegészíthető.
                </p>
              )}
            </div>

            {/* ─── JOBB OSZLOP: Élő emléklap-vászon ─── */}
            <aside className="md:sticky md:top-0 md:self-start">
              <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-3 mb-2">
                <p className="text-[11px] text-amber-900 leading-relaxed">
                  <Sparkles className="size-3 inline mr-1 text-amber-600" />
                  Ahogy gépeled az adatokat, a keresztelői emléklap automatikusan kitöltődik.
                  A „<strong>Mentés és nyomtatás</strong>" gombbal egy lépésben rögzítheted és kinyomtathatod.
                </p>
              </div>
              {/* 2026-05-30: variant-választó chip (Erdélyi új / Királyhágós új / Hagyományos kék) */}
              <div className="flex justify-center gap-1 mb-2 rounded-md bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => changeVariant('erek')}
                  className={`flex-1 px-2.5 py-0.5 text-[11px] font-medium rounded ${selectedVariant === 'erek' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
                >Erdélyi új</button>
                <button
                  type="button"
                  onClick={() => changeVariant('kerek')}
                  className={`flex-1 px-2.5 py-0.5 text-[11px] font-medium rounded ${selectedVariant === 'kerek' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
                >Királyhágós új</button>
                <button
                  type="button"
                  onClick={() => changeVariant('kek')}
                  className={`flex-1 px-2.5 py-0.5 text-[11px] font-medium rounded ${selectedVariant === 'kek' ? 'bg-white text-blue-800 shadow-sm' : 'text-slate-500'}`}
                  title="Kék-fehér népi díszítésű hagyományos sablon"
                >Hagyományos kék</button>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 shadow-inner">
                <CertificateRenderer
                  ref={printRef}
                  template={template}
                  fieldValues={fieldValues}
                  previewWidth={360}
                  showBackground={true}
                />
              </div>
              <p className="mt-1.5 text-[10px] text-slate-400 text-center">
                A4 álló · {selectedVariant === 'kek' ? 'Hagyományos kék' : selectedVariant === 'kerek' ? 'Királyhágós új' : 'Erdélyi új'} keresztelői sablon
              </p>
            </aside>
          </div>

          {/* ─── Alsó akciósor (mindkét oszlop alatt) ─── */}
          <div className="flex flex-wrap gap-2 pt-4 border-t border-zinc-100 mt-4">
            <Button
              variant="outline"
              className="rounded-xl bg-zinc-50 hover:bg-zinc-100 text-zinc-600"
              onClick={() => onOpenChange(false)}
            >
              Mégse
            </Button>
            <div className="flex-1" />
            <Button
              variant="outline"
              onClick={handleSaveOnly}
              disabled={loading}
              className="border-blue-300 text-blue-700 hover:bg-blue-50"
            >
              <Save className="size-4 mr-1.5" />
              {loading ? 'Mentés…' : 'Mentés'}
            </Button>
            <Button
              onClick={handleSaveAndPrint}
              disabled={loading}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              <Printer className="size-4 mr-1.5" />
              {loading ? 'Mentés…' : 'Mentés és nyomtatás'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <MemberFormDialog open={quickAddOpen} onOpenChange={handleQuickAddOpenChange} editMember={null} />

      {/* 2026-08-25: mentés utáni munkanapló-rögzítő — a szerver-szinkron által
          létrehozott bejegyzést nyitja szerkesztésre (dátum + kanonikus jellege
          + cím előtöltve), a lelkész a jelenlétet/perselyt egészíti ki. */}
      <WorklogDialog
        open={worklogOpen}
        onOpenChange={(o) => { setWorklogOpen(o); if (!o) setWorklogPrefill(null) }}
        editEntry={worklogPrefill}
        defaultCategory="szolgalat"
      />
    </>
  )
}
