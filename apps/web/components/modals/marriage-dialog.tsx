'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Printer, Save, Sparkles } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { saveMarriage, getNextEgyhaziSzam, getMemberBirthPlace } from '@/app/(dashboard)/anyakonyv/actions'
import { MemberSearchSelect, type MemberSearchResult } from '@/components/registry/member-search-select'
// 2026-08-25 (Endre): sikeres mentés után — ha a munkanapló-kapcsoló BE volt —
// a munkanapló-rögzítő előtöltve nyílik meg (jelenlét, persely kiegészítéséhez).
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
} from '@/lib/utils/emleklap-data-mapper'
import { toast } from 'sonner'
// 2026-09-05: HELYI „ma" — az UTC-s toISOString() éjfél és hajnali 3 között az előző napot adta.
import { todayYmd } from '@/lib/utils/program-day'

// Jól látható input-stílus (felhasználói kérés alapján)
const FIELD_INPUT_CLASS = 'bg-white shadow-sm border-slate-300'

// 2026-05-30: alapértelmezett igevers a házasságkötési emléklapon.
// A felhasználó tetszőlegesen átírhatja; \n-nel törhet 2 sorra.
const DEFAULT_VERSE_TEXT = 'Egymás terhét hordozzátok, és úgy töltsétek\nbe a Krisztus törvényét'
const DEFAULT_VERSE_REFERENCE = 'Gal 6,2'

interface MarriageDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  congregationName?: string
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
    hlevel?: string
    egyhazi_szam?: string
    lelkeszneve?: string
    tanuk?: string
    vegyes?: boolean
    megjegyzes?: string
    // 2026-05-30: bővítve sz_datum, cnp, vallas, szcs_nev — a query is ezeket szelektálja.
    ferfi?: {
      id: number
      csaladnev: string
      k_nev: string
      sz_datum?: string | null
      cnp?: string | null
      vallas?: string | null
      szcs_nev?: string | null
    } | null
    no?: {
      id: number
      csaladnev: string
      k_nev: string
      sz_datum?: string | null
      cnp?: string | null
      vallas?: string | null
      szcs_nev?: string | null
    } | null
    [key: string]: unknown
  } | null
}

export function MarriageDialog({ open, onOpenChange, congregationName = '', editEntry, initialDate, onSaved }: MarriageDialogProps) {
  const [loading, setLoading] = useState(false)
  const [groom, setGroom] = useState<MemberSearchResult | null>(null)
  const [bride, setBride] = useState<MemberSearchResult | null>(null)
  const [datum, setDatum] = useState('')
  const [egyhaziSzam, setEgyhaziSzam] = useState('')
  const [hlevel, setHlevel] = useState('')
  const [lelkesz, setLelkesz] = useState('')
  const [tanuk, setTanuk] = useState('')
  const [vegyes, setVegyes] = useState(false)
  // 2026-06-12 (Endre #3-4 munkanapló): esketés → munkanapló pipa
  const [munkanaploba, setMunkanaploba] = useState(false)
  // 2026-08-25: a mentés utáni munkanapló-rögzítő (a szerver-szinkron által
  // már létrehozott munkanaplo sorral, szerkesztés módban — nincs duplikáció).
  const [worklogOpen, setWorklogOpen] = useState(false)
  const [worklogPrefill, setWorklogPrefill] = useState<WorklogEntry | null>(null)
  const [megj, setMegj] = useState('')
  const [gondnok, setGondnok] = useState('')
  // 2026-05-30: emléklap-specifikus mezők (a hazassag táblában nincs külön
  // oszlop nekik — sablon JSON-ben tárolódnak a megjegyzes-ben).
  const [husbandBirthPlace, setHusbandBirthPlace] = useState('')
  const [wifeBirthPlace, setWifeBirthPlace] = useState('')
  const [verseText, setVerseText] = useState(DEFAULT_VERSE_TEXT)
  const [verseReference, setVerseReference] = useState(DEFAULT_VERSE_REFERENCE)
  // 2026-05-30: a tag-rekord szerinti születési helység (szemely.sz_helyid →
  // adrlocality.name). Csak hint-ként mutatjuk, hogy a user tudja melyiket
  // kell ragozni. null = még nem lekérdezve / nincs rögzítve.
  //
  // 2026-08-11: a lekérdezés eredményét a SZEMÉLY AZONOSÍTÓJÁHOZ KÖTVE
  // tároljuk, és a `…Raw` / `…Loaded` értéket RENDER KÖZBEN származtatjuk.
  // Korábban két effect törzse hívott szinkron setState-et
  // (react-hooks/set-state-in-effect → kaszkádoló újrarender). Így ha a
  // vőlegény/menyasszony változik vagy törlődik, a régi találat magától
  // érvénytelen — betű szerint ugyanaz a hint, plusz render-kör nélkül.
  const [groomBirthPlaceState, setGroomBirthPlaceState] = useState<{ memberId: number; place: string | null } | null>(null)
  const [brideBirthPlaceState, setBrideBirthPlaceState] = useState<{ memberId: number; place: string | null } | null>(null)
  const groomBirthPlaceLoaded = !!groom && groomBirthPlaceState?.memberId === groom.id
  const brideBirthPlaceLoaded = !!bride && brideBirthPlaceState?.memberId === bride.id
  const groomBirthPlaceRaw = groomBirthPlaceLoaded ? groomBirthPlaceState?.place ?? null : null
  const brideBirthPlaceRaw = brideBirthPlaceLoaded ? brideBirthPlaceState?.place ?? null : null
  const printRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      if (editEntry) {
        // 2026-05-30: a vőlegény/menyasszony embedded objektumból most már
        // sz_datum / cnp / vallas / szcs_nev mezőket is átveszünk — az emléklap
        // élő preview helyesen mutatja a születési dátumot.
        setGroom(editEntry.ferfi
          ? {
              id: editEntry.ferfi.id,
              csaladnev: editEntry.ferfi.csaladnev,
              k_nev: editEntry.ferfi.k_nev,
              ferfi: true,
              sz_datum: editEntry.ferfi.sz_datum ?? null,
              cnp: editEntry.ferfi.cnp ?? null,
              c_szam: null,
              vallas: editEntry.ferfi.vallas ?? null,
              szcs_nev: editEntry.ferfi.szcs_nev ?? null,
            }
          : null)
        setBride(editEntry.no
          ? {
              id: editEntry.no.id,
              csaladnev: editEntry.no.csaladnev,
              k_nev: editEntry.no.k_nev,
              ferfi: false,
              sz_datum: editEntry.no.sz_datum ?? null,
              cnp: editEntry.no.cnp ?? null,
              c_szam: null,
              vallas: editEntry.no.vallas ?? null,
              szcs_nev: editEntry.no.szcs_nev ?? null,
            }
          : null)
        setDatum((editEntry.datum as string)?.split('T')[0] || '')
        setEgyhaziSzam((editEntry.egyhazi_szam as string) || '')
        setHlevel((editEntry.hlevel as string) || '')
        setLelkesz((editEntry.lelkeszneve as string) || '')
        setTanuk((editEntry.tanuk as string) || '')
        setVegyes(!!editEntry.vegyes)
        setMunkanaploba(!!editEntry.munkanaploba)
        // 2026-05-30: a sablon JSON parse a megjegyzes-ből (baptism mintára).
        // Ha az igevers/igehely üres, az alapértelmezett szöveget töltjük be —
        // a régi (sablon JSON előtti) bejegyzéseknél is azonnal kitölthető.
        const rawMegj = (editEntry.megjegyzes as string) || ''
        const idx = rawMegj.indexOf('|sablon:')
        if (idx > -1) {
          setMegj(rawMegj.slice(0, idx))
          try {
            const s = JSON.parse(rawMegj.slice(idx + 8))
            setHusbandBirthPlace(s.husband_birth_place || '')
            setWifeBirthPlace(s.wife_birth_place || '')
            setVerseText(s.verse_text || DEFAULT_VERSE_TEXT)
            setVerseReference(s.verse_reference || DEFAULT_VERSE_REFERENCE)
          } catch {
            setHusbandBirthPlace(''); setWifeBirthPlace('')
            setVerseText(DEFAULT_VERSE_TEXT); setVerseReference(DEFAULT_VERSE_REFERENCE)
          }
        } else {
          setMegj(rawMegj)
          setHusbandBirthPlace(''); setWifeBirthPlace('')
          setVerseText(DEFAULT_VERSE_TEXT); setVerseReference(DEFAULT_VERSE_REFERENCE)
        }
        return
      }
      setGroom(null); setBride(null)
      // 2026-09-05: a naptárból a tervezett program napja, különben a HELYI mai nap.
      const kezdoDatum = initialDate || todayYmd()
      setDatum(kezdoDatum)
      // 2026-08-25 (Endre): új rögzítésnél a munkanapló-kapcsoló ALAPBÓL BE.
      setHlevel(''); setLelkesz(''); setTanuk(''); setVegyes(false); setMunkanaploba(true); setMegj('')
      setHusbandBirthPlace(''); setWifeBirthPlace('')
      setVerseText(DEFAULT_VERSE_TEXT); setVerseReference(DEFAULT_VERSE_REFERENCE)
      try {
        const savedGondnok = localStorage.getItem('kartoteka.emleklap.gondnokName')
        if (savedGondnok) setGondnok(savedGondnok)
      } catch {}
      getNextEgyhaziSzam('marriage', Number(kezdoDatum.slice(0, 4)) || new Date().getFullYear()).then(v => {
        if (!cancelled) setEgyhaziSzam(v)
      })
    })
    return () => { cancelled = true }
  }, [open, editEntry, initialDate])

  // 2026-05-30: amikor a vőlegény / menyasszony változik, lekérdezzük a
  // tag-rekord szerinti születési helységet — hintként mutatjuk a UI-n,
  // hogy a user tudja melyiket kell ragozni („Kovászna" → „Kovásznán").
  useEffect(() => {
    if (!groom) return
    let cancelled = false
    const memberId = groom.id
    getMemberBirthPlace(memberId).then(place => {
      if (!cancelled) setGroomBirthPlaceState({ memberId, place })
    })
    return () => { cancelled = true }
  }, [groom])

  useEffect(() => {
    if (!bride) return
    let cancelled = false
    const memberId = bride.id
    getMemberBirthPlace(memberId).then(place => {
      if (!cancelled) setBrideBirthPlaceState({ memberId, place })
    })
    return () => { cancelled = true }
  }, [bride])

  // 2026-05-29: élő esketési emléklap-preview
  // 2026-05-30: variant-választó (Erdélyi új / Királyhágós új / Hagyományos).
  // localStorage-be is mentődik a felhasználói preferencia.
  const [selectedVariant, setSelectedVariant] = useState<'erek' | 'kerek' | 'hagyomanyos'>(() => {
    try {
      const saved = (typeof window !== 'undefined' && localStorage.getItem('kartoteka.emleklap.esketesVariant')) || 'erek'
      return (saved === 'kerek' || saved === 'hagyomanyos') ? saved : 'erek'
    } catch { return 'erek' }
  })
  function changeVariant(v: 'erek' | 'kerek' | 'hagyomanyos') {
    setSelectedVariant(v)
    try { localStorage.setItem('kartoteka.emleklap.esketesVariant', v) } catch {}
  }
  const template: EmleklapTemplate = EMLEKLAP_TEMPLATES_MAP[`esketes-${selectedVariant}`] ?? EMLEKLAP_TEMPLATES_MAP['esketes-erek']

  const fieldValues = useMemo(() => {
    const husbandName = groom ? `${groom.csaladnev || ''} ${groom.k_nev || ''}`.trim() : ''
    const wifeName = bride ? `${bride.csaladnev || ''} ${bride.k_nev || ''}`.trim() : ''
    const marriageDate = datum ? formatHungarianDate(datum) + '-én' : ''
    // 2026-05-30: a vőlegény/menyasszony születési dátuma a tag-rekordból
    // (sz_datum), a hely a manuálisan megadott husbandBirthPlace/wifeBirthPlace
    // mezőből (mert a hazassag query még nem JOIN-eli az adrlocality-t).
    const husbandBirthDate = groom?.sz_datum
      ? formatHungarianDate(groom.sz_datum) + '-én'
      : ''
    const wifeBirthDate = bride?.sz_datum
      ? formatHungarianDate(bride.sz_datum) + '-án'
      : ''
    const issueDate = datum ? formatHungarianDate(datum) : ''
    const issueLocation = extractCityFromCongregationName(congregationName)

    const data: Record<string, string> = {
      congregationName: congregationName || '',
      husbandName,
      husbandBirthPlace,
      husbandBirthDate,
      wifeName,
      wifeBirthPlace,
      wifeBirthDate,
      marriageCongregation: congregationName ? congregationName + 'ben' : '',
      marriageDate,
      verseText,
      verseReference,
      issueLocation,
      issueDate,
      pastorName: (lelkesz || '').toUpperCase(),
      wardenName: (gondnok || '').toUpperCase(),
    }

    const out: Record<string, string> = {}
    for (const field of template.fields) {
      out[field.id] = fillTemplate(field.defaultValue, data)
    }
    return out
  }, [template, groom, bride, datum, lelkesz, gondnok, congregationName, husbandBirthPlace, wifeBirthPlace, verseText, verseReference])

  // 2026-08-25: a mentés eredménye a munkanapló-előtöltést is hozza (ha a
  // kapcsoló BE volt) — a hívó ezzel nyitja meg a munkanapló-rögzítőt.
  async function handleSubmit(): Promise<{ ok: boolean; id: number | null; worklogEntry: WorklogEntry | null }> {
    if (!groom || !bride) { toast.error('Mindkét fél kötelező!'); return { ok: false, id: null, worklogEntry: null } }
    if (!datum) { toast.error('A dátum kötelező!'); return { ok: false, id: null, worklogEntry: null } }
    setLoading(true)
    const result = await saveMarriage({
      id: editEntry?.id,
      id_ferfi: groom.id,
      id_no: bride.id,
      datum,
      hlevel: hlevel || null,
      egyhazi_szam: egyhaziSzam || null,
      lelkeszneve: lelkesz || null,
      tanuk: tanuk || null,
      vegyes,
      munkanaploba,
      megjegyzes: megj || null,
      husband_birth_place: husbandBirthPlace || null,
      wife_birth_place: wifeBirthPlace || null,
      verse_text: verseText || null,
      verse_reference: verseReference || null,
    })
    setLoading(false)
    if (result.error) { toast.error(result.error); return { ok: false, id: null, worklogEntry: null } }
    toast.success('Házasság rögzítve!')
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
   * előtöltve (dátum + kanonikus jellege [Azonos/Vegyes esketés] + cím a
   * szerver-szinkronból). CSAK ha a szolgálat még nincs felvéve: új
   * rögzítésnél, vagy ha a kapcsoló most került BE-re. A kis késleltetés a
   * dupla-modal ellen: előbb záródjon be az anyakönyvi dialógus.
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

  async function handleSaveAndPrint() {
    let pastor = lelkesz.trim()
    let warden = gondnok.trim()
    if (!pastor) {
      const v = window.prompt('A lelkész neve nincs megadva — az emléklapra kerül. Add meg most:', '')
      if (v === null) return
      pastor = v.trim()
      if (pastor) setLelkesz(pastor)
    }
    if (!warden) {
      const v = window.prompt('A gondnok neve nincs megadva. Add meg most (megőrződik a következő alkalmakra):', '')
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
      toast.error('A böngésző blokkolta a popup-ot.')
      return
    }
    win.document.write(`<!DOCTYPE html><html lang="hu"><head><meta charset="utf-8"><title>Esketési emléklap</title>
      <style>
        @page { size: A4 portrait; margin: 0; }
        html, body { margin: 0; padding: 0; background: white; }
        body { display: flex; align-items: center; justify-content: center; }
        .certificate-renderer { width: 210mm !important; height: 297mm !important; max-width: 210mm !important; aspect-ratio: 210/297 !important; }
        .certificate-renderer img { width: 100% !important; height: 100% !important; }
        @media print { html, body { width: 210mm; height: 297mm; } .certificate-renderer { box-shadow: none !important; } }
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
      <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-3xl md:max-w-5xl lg:max-w-6xl xl:max-w-7xl max-h-[92dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {editEntry ? 'Házasságkötés szerkesztése' : 'Házasságkötés rögzítése'}
            <span className="text-xs font-normal text-amber-600 inline-flex items-center gap-1">
              <Sparkles className="size-3.5" />
              élő emléklap-előnézet
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,400px)]">
          {/* ─── BAL: űrlap ─── */}
          <div className="space-y-3 md:max-h-[78dvh] md:overflow-y-auto md:pr-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Vőlegény *</Label>
                <MemberSearchSelect value={groom} onChange={setGroom} genderFilter={true} placeholder="Vőlegény keresése (férfi)…" />
              </div>
              <div className="space-y-1.5">
                <Label>Menyasszony *</Label>
                <MemberSearchSelect value={bride} onChange={setBride} genderFilter={false} placeholder="Menyasszony keresése (nő)…" />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">
                  Egyházi anyakönyvi szám
                  <span className="ml-1 text-[10px] font-normal text-violet-600">(automatikus)</span>
                </Label>
                <Input value={egyhaziSzam} onChange={e => setEgyhaziSzam(e.target.value)} className={`font-mono text-violet-700 ${FIELD_INPUT_CLASS}`} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Állami házassági levél</Label>
                <Input value={hlevel} onChange={e => setHlevel(e.target.value)} placeholder="opcionális" className={FIELD_INPUT_CLASS} />
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
              <div className="space-y-1.5"><Label>Tanúk</Label><Input value={tanuk} onChange={e => setTanuk(e.target.value)} placeholder="Tanúk neve" className={FIELD_INPUT_CLASS} /></div>
            </div>
            <div className="space-y-1.5">
              <Label>Gondnok <span className="text-[10px] font-normal text-slate-500">(az emléklapra — automatikusan megőrződik)</span></Label>
              <Input
                value={gondnok}
                onChange={e => setGondnok(e.target.value)}
                placeholder="Gondnok teljes neve"
                className={FIELD_INPUT_CLASS}
                onBlur={() => { try { if (gondnok) localStorage.setItem('kartoteka.emleklap.gondnokName', gondnok) } catch {} }}
              />
            </div>
            {/* 2026-05-30: emléklap-mezők — sablon JSON-be mentődnek a megjegyzes-be */}
            <div className="rounded-lg border border-amber-200/60 bg-amber-50/40 p-3 space-y-2.5">
              <p className="text-[11px] font-medium text-amber-900">
                <Sparkles className="size-3 inline mr-1 text-amber-600" />
                Emléklap-mezők (opcionális — az „aki … született …" sorhoz és az igeverséhez)
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Vőlegény szül. helye (ragozva)</Label>
                  <Input
                    value={husbandBirthPlace}
                    onChange={e => setHusbandBirthPlace(e.target.value)}
                    placeholder="pl. Kovásznán"
                    className={`h-8 text-xs ${FIELD_INPUT_CLASS}`}
                  />
                  {groom && groomBirthPlaceLoaded && (
                    groomBirthPlaceRaw ? (
                      <p className="text-[10px] text-emerald-700 leading-relaxed">
                        💡 Tag-rekord szerint: <strong>{groomBirthPlaceRaw}</strong> — ragozd be (pl. „{groomBirthPlaceRaw}n" / „{groomBirthPlaceRaw}on" / „{groomBirthPlaceRaw}en")
                      </p>
                    ) : (
                      <p className="text-[10px] text-amber-700 leading-relaxed">
                        ⚠️ Nincs rögzítve születési hely a tag-nyilvántartásban
                      </p>
                    )
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Menyasszony szül. helye (ragozva)</Label>
                  <Input
                    value={wifeBirthPlace}
                    onChange={e => setWifeBirthPlace(e.target.value)}
                    placeholder="pl. Kovásznán"
                    className={`h-8 text-xs ${FIELD_INPUT_CLASS}`}
                  />
                  {bride && brideBirthPlaceLoaded && (
                    brideBirthPlaceRaw ? (
                      <p className="text-[10px] text-emerald-700 leading-relaxed">
                        💡 Tag-rekord szerint: <strong>{brideBirthPlaceRaw}</strong> — ragozd be (pl. „{brideBirthPlaceRaw}n" / „{brideBirthPlaceRaw}on" / „{brideBirthPlaceRaw}en")
                      </p>
                    ) : (
                      <p className="text-[10px] text-amber-700 leading-relaxed">
                        ⚠️ Nincs rögzítve születési hely a tag-nyilvántartásban
                      </p>
                    )
                  )}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Igevers szövege</Label>
                <textarea
                  value={verseText}
                  onChange={e => setVerseText(e.target.value)}
                  placeholder='pl. Egymás terhét hordozzátok, és úgy töltsétek be a Krisztus törvényét'
                  rows={2}
                  className={`w-full rounded-md border px-2 py-1 text-xs ${FIELD_INPUT_CLASS}`}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Igehely</Label>
                <Input
                  value={verseReference}
                  onChange={e => setVerseReference(e.target.value)}
                  placeholder="pl. Gal 6,2"
                  className={`h-8 text-xs ${FIELD_INPUT_CLASS}`}
                />
              </div>
            </div>
            <div className="space-y-1.5"><Label>Megjegyzés</Label><Input value={megj} onChange={e => setMegj(e.target.value)} className={FIELD_INPUT_CLASS} /></div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={vegyes} onChange={e => setVegyes(e.target.checked)} />
              Vegyes házasság (egyik fél nem református)
            </label>
            {/* 2026-06-12 (Endre #3-4 munkanapló): az esketésnél eddig hiányzott a
                munkanapló-pipa — a keresztelő/temetés/konfirmáció dialógokkal
                egységesen az esketés is rögzíthető elvégzett szolgálatként.
                2026-08-25 (Endre): új rögzítésnél alapból BE, és mentés után
                előtöltve nyílik a munkanapló-rögzítő. */}
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={munkanaploba} onChange={e => setMunkanaploba(e.target.checked)} />
              Megjelenjen a munkanaplóban?
            </label>
            {munkanaploba && (
              <p className="text-[11px] text-slate-500">
                Mentés után megnyílik a munkanapló-rögzítő előtöltve — a jelenlét és a perselypénz azonnal kiegészíthető.
              </p>
            )}
          </div>

          {/* ─── JOBB: élő esketési emléklap ─── */}
          <aside className="md:sticky md:top-0 md:self-start">
            <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-3 mb-2">
              <p className="text-[11px] text-amber-900 leading-relaxed">
                <Sparkles className="size-3 inline mr-1 text-amber-600" />
                Az esketési emléklap automatikusan kitöltődik a beírt adatokkal.
              </p>
            </div>
            {/* 2026-05-30: variant-választó chip (Erdélyi új / Királyhágós új / Hagyományos) */}
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
                onClick={() => changeVariant('hagyomanyos')}
                className={`flex-1 px-2.5 py-0.5 text-[11px] font-medium rounded ${selectedVariant === 'hagyomanyos' ? 'bg-white text-red-800 shadow-sm' : 'text-slate-500'}`}
                title="Piros népi keret — hagyományos sablon"
              >Hagyományos</button>
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
              A4 álló · {selectedVariant === 'hagyomanyos' ? 'Hagyományos' : selectedVariant === 'kerek' ? 'Királyhágós új' : 'Erdélyi új'} esketési sablon
            </p>
          </aside>
        </div>

        <div className="flex flex-wrap gap-2 pt-4 border-t border-zinc-100 mt-4">
          <Button variant="outline" className="rounded-xl bg-zinc-50 hover:bg-zinc-100 text-zinc-600" onClick={() => onOpenChange(false)}>Mégse</Button>
          <div className="flex-1" />
          <Button variant="outline" onClick={handleSaveOnly} disabled={loading} className="border-orange-300 text-orange-700 hover:bg-orange-50">
            <Save className="size-4 mr-1.5" />
            {loading ? 'Mentés…' : 'Mentés'}
          </Button>
          <Button onClick={handleSaveAndPrint} disabled={loading} className="bg-amber-600 hover:bg-amber-700 text-white">
            <Printer className="size-4 mr-1.5" />
            {loading ? 'Mentés…' : 'Mentés és nyomtatás'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>

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
