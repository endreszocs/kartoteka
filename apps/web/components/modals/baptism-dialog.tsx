'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { UserPlus, Users, Printer, Save, Sparkles } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { saveBaptism, getNextEgyhaziSzam, getParentsForChild } from '@/app/(dashboard)/anyakonyv/actions'
import { MemberSearchSelect, type MemberSearchResult } from '@/components/registry/member-search-select'
import { MemberFormDialog } from '@/components/modals/member-form-dialog'
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

interface BaptismDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  congregationName: string
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

export function BaptismDialog({ open, onOpenChange, congregationName, editEntry }: BaptismDialogProps) {
  const [loading, setLoading] = useState(false)
  const [selectedPerson, setSelectedPerson] = useState<MemberSearchResult | null>(null)
  const [familyAutoLoaded, setFamilyAutoLoaded] = useState(false)
  const [quickAddOpen, setQuickAddOpen] = useState(false)

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
        setMunkanaploba(false)
        return
      }
      setSelectedPerson(null)
      setFather(null); setMother(null); setFamilyAutoLoaded(false)
      setApjaneveText(null); setAnyjaneveText(null); setParentDiag(null)
      const today = new Date().toISOString().slice(0, 10)
      setDatum(today); setOkirat(''); setLelkesz(''); setKeresztszulok('')
      setAlapige(''); setMegjegyzes(''); setMunkanaploba(false)
      setApavallas(''); setAnyavallas(''); setAnyaLeanykori('')
      // 2026-05-29: gondnok visszatöltése localStorage-ból (sticky)
      try {
        const savedGondnok = localStorage.getItem('kartoteka.emleklap.gondnokName')
        if (savedGondnok) setGondnok(savedGondnok)
      } catch { /* SSR / private mode */ }
      getNextEgyhaziSzam('baptism', new Date().getFullYear()).then(value => {
        if (!cancelled) setEgyhaziSzam(value)
      })
    })
    return () => { cancelled = true }
  }, [open, editEntry])

  useEffect(() => {
    if (!open || editEntry) return
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
  const template: EmleklapTemplate = EMLEKLAP_TEMPLATES_MAP['kereszteles-erek']

  const fieldValues = useMemo(() => {
    const childName = selectedPerson
      ? `${selectedPerson.csaladnev || ''} ${selectedPerson.k_nev || ''}`.trim()
      : ''
    const fatherName = father ? `${father.csaladnev || ''} ${father.k_nev || ''}`.trim() : ''
    const motherName = mother ? `${mother.csaladnev || ''} ${mother.k_nev || ''}`.trim() : ''
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
      baptismCongregation: congregationName ? congregationName + 'ben' : '',
      baptismDate,
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
  }, [template, selectedPerson, father, mother, datum, lelkesz, gondnok, congregationName])

  async function handleSubmit(): Promise<boolean> {
    if (!selectedPerson) { toast.error('Válasszon személyt!'); return false }
    if (!datum) { toast.error('A dátum kötelező!'); return false }
    setLoading(true)
    const fatherName = father ? `${father.csaladnev || ''} ${father.k_nev || ''}`.trim() : ''
    const motherName = mother ? `${mother.csaladnev || ''} ${mother.k_nev || ''}`.trim() : ''
    const fatherCnp = father?.cnp || ''
    const motherCnp = mother?.cnp || ''
    const result = await saveBaptism({
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
      apa_vallas: apavallas || null,
      anya_vallas: anyavallas || null,
      anya_leanyneve: anyaLeanykori || null,
      munkanaploba,
      megjegyzes: megjegyzes || null,
    })
    setLoading(false)
    if (result.error) {
      toast.error(result.error)
      return false
    }
    toast.success('Keresztelés rögzítve!')
    return true
  }

  async function handleSaveOnly() {
    const ok = await handleSubmit()
    if (ok) onOpenChange(false)
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
    const ok = await handleSubmit()
    if (!ok) return
    // Várunk egy tick-et, hogy a fieldValues a friss state-tel frissüljön a print előtt
    setTimeout(() => {
      handlePrint()
      setTimeout(() => onOpenChange(false), 500)
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

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        {/* Szélesebb dialog hogy 2-oszlopos layout legyen (form + emléklap) */}
        <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-3xl md:max-w-5xl lg:max-w-6xl xl:max-w-7xl max-h-[92vh] overflow-y-auto">
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
            <div className="space-y-4 md:max-h-[78vh] md:overflow-y-auto md:pr-2">
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
                    <Label className="text-xs text-muted-foreground">Leánykori név</Label>
                    <Input value={anyaLeanykori} onChange={e => setAnyaLeanykori(e.target.value)} className={`h-8 text-xs ${FIELD_INPUT_CLASS}`} />
                  </div>
                </div>
              </div>

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
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={munkanaploba} onChange={e => setMunkanaploba(e.target.checked)} /> Rögzítés a munkanaplóba</label>
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
                A4 álló · EREK keresztelői sablon
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
    </>
  )
}
