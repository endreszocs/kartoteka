'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Printer, Save, Sparkles } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { saveBurial, getNextEgyhaziSzam } from '@/app/(dashboard)/anyakonyv/actions'
import { MemberSearchSelect, type MemberSearchResult } from '@/components/registry/member-search-select'
import { CertificateRenderer } from '@/components/registry/emleklap/certificate-renderer'
import {
  EMLEKLAP_TEMPLATES_MAP,
  fillTemplate,
  type EmleklapTemplate,
} from '@/lib/constants/emleklap-templates'
import { formatHungarianDate } from '@/lib/utils/emleklap-data-mapper'
import { toast } from 'sonner'

const FIELD_INPUT_CLASS = 'bg-white shadow-sm border-slate-300'

interface BurialDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  congregationName?: string
  editEntry?: {
    id: number
    hdatum?: string
    tdatum?: string
    hoka?: string
    okirat?: string
    egyhazi_szam?: string
    lelkeszneve?: string
    megjegyzes?: string
    szemely?: { id: number; csaladnev: string; k_nev: string; ferfi: boolean | null; sz_datum: string | null } | null
    [key: string]: unknown
  } | null
}

function calculateAge(birthDate: string | null | undefined, deathDate: string | null | undefined): string {
  if (!birthDate || !deathDate) return ''
  try {
    const b = new Date(birthDate)
    const d = new Date(deathDate)
    if (isNaN(b.getTime()) || isNaN(d.getTime())) return ''
    let age = d.getFullYear() - b.getFullYear()
    const m = d.getMonth() - b.getMonth()
    if (m < 0 || (m === 0 && d.getDate() < b.getDate())) age--
    return String(age)
  } catch { return '' }
}

export function BurialDialog({ open, onOpenChange, congregationName = '', editEntry }: BurialDialogProps) {
  const [loading, setLoading] = useState(false)
  const [person, setPerson] = useState<MemberSearchResult | null>(null)
  const [hdatum, setHdatum] = useState('')
  const [tdatum, setTdatum] = useState('')
  const [hoka, setHoka] = useState('')
  const [okirat, setOkirat] = useState('')
  const [egyhaziSzam, setEgyhaziSzam] = useState('')
  const [lelkesz, setLelkesz] = useState('')
  const [megj, setMegj] = useState('')
  const [munkanaploba, setMunkanaploba] = useState(false)
  // Gyászjelentés-specifikus mezők (in-place a vásznon is szerkeszthetők)
  const [funeralPlace, setFuneralPlace] = useState('')
  const [funeralTime, setFuneralTime] = useState('')
  // 2026-05-30: virrasztó opcionális mezők (a vásznon csak akkor jelenik meg,
  // ha legalább egyik ki van töltve)
  const [vigilDate, setVigilDate] = useState('')
  const [vigilTime, setVigilTime] = useState('')
  const [vigilPlace, setVigilPlace] = useState('')
  // Igevers a formról is szerkeszthető (az alapértelmezett mellé)
  const [verseText, setVerseText] = useState('')
  const [verseReference, setVerseReference] = useState('')
  // 2026-05-30: rokoni viszony + gyászolók — szerkeszthető és skippelhető
  const [relativeRelation, setRelativeRelation] = useState('egyháztagunk és hitbeli testvérünk')
  const [mourners, setMourners] = useState('Gyászolják:\nSzerető családja és mindazok,\nakik ismerték és tisztelték')
  const printRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      if (editEntry) {
        setPerson(editEntry.szemely
          ? { ...editEntry.szemely, cnp: null, c_szam: null }
          : null)
        setHdatum((editEntry.hdatum as string)?.split('T')[0] || '')
        setTdatum((editEntry.tdatum as string)?.split('T')[0] || '')
        setHoka((editEntry.hoka as string) || '')
        setOkirat((editEntry.okirat as string) || '')
        setEgyhaziSzam((editEntry.egyhazi_szam as string) || '')
        setLelkesz((editEntry.lelkeszneve as string) || '')
        // 2026-05-30: a megjegyzes-ből kicsomagoljuk a gyászjelentés-specifikus
        // mezőket (sablon JSON, baptism mintára). Reset alapertekekre.
        const megj = (editEntry.megjegyzes as string) || ''
        const sablonIdx = megj.indexOf('|sablon:')
        if (sablonIdx > -1) {
          setMegj(megj.slice(0, sablonIdx))
          try {
            const s = JSON.parse(megj.slice(sablonIdx + 8))
            setFuneralTime(s.funeral_time || '14:00')
            setFuneralPlace(s.funeral_place || '')
            setVigilDate(s.vigil_date || '')
            setVigilTime(s.vigil_time || '')
            setVigilPlace(s.vigil_place || '')
            setVerseText(s.verse_text || 'Az Úr adta, az Úr vette el,\náldott legyen az Úr neve.')
            setVerseReference(s.verse_reference || 'Jób 1,21')
            setRelativeRelation(s.relative_relation || 'egyháztagunk és hitbeli testvérünk')
            setMourners(s.mourners ?? 'Gyászolják:\nSzerető családja és mindazok,\nakik ismerték és tisztelték')
          } catch {
            setFuneralTime('14:00'); setFuneralPlace('')
            setVigilDate(''); setVigilTime(''); setVigilPlace('')
            setVerseText('Az Úr adta, az Úr vette el,\náldott legyen az Úr neve.')
            setVerseReference('Jób 1,21')
            setRelativeRelation('egyháztagunk és hitbeli testvérünk')
            setMourners('Gyászolják:\nSzerető családja és mindazok,\nakik ismerték és tisztelték')
          }
        } else {
          setMegj(megj)
          setFuneralTime('14:00'); setFuneralPlace('')
          setVigilDate(''); setVigilTime(''); setVigilPlace('')
          setVerseText('Az Úr adta, az Úr vette el,\náldott legyen az Úr neve.')
          setVerseReference('Jób 1,21')
          setRelativeRelation('egyháztagunk és hitbeli testvérünk')
          setMourners('Gyászolják:\nSzerető családja és mindazok,\nakik ismerték és tisztelték')
        }
        // 2026-06-12 (Endre #3-4 munkanapló): szerkesztéskor a mentett pipát
        // töltjük vissza — korábban fixen false volt, így a szerkesztés-mentés
        // némán kikapcsolta a munkanapló-rögzítést.
        setMunkanaploba(!!editEntry.munkanaploba)
        return
      }
      setPerson(null)
      setHdatum(''); setTdatum(''); setHoka(''); setOkirat('')
      setLelkesz(''); setMegj(''); setMunkanaploba(false)
      setFuneralPlace(''); setFuneralTime('14:00')
      setVigilDate(''); setVigilTime(''); setVigilPlace('')
      // Alapértelmezett igevers — a Jób könyvéből (a gyászjelentés-sablon
      // hagyománya szerint). A felhasználó cserélheti.
      setVerseText('Az Úr adta, az Úr vette el,\náldott legyen az Úr neve.')
      setVerseReference('Jób 1,21')
      setRelativeRelation('egyháztagunk és hitbeli testvérünk')
      setMourners('Gyászolják:\nSzerető családja és mindazok,\nakik ismerték és tisztelték')
      getNextEgyhaziSzam('burial', new Date().getFullYear()).then(v => {
        if (!cancelled) setEgyhaziSzam(v)
      })
    })
    return () => { cancelled = true }
  }, [open, editEntry])

  // 2026-05-30: élő gyászjelentés-preview
  const template: EmleklapTemplate = EMLEKLAP_TEMPLATES_MAP['temetes-erek']

  const fieldValues = useMemo(() => {
    const fullName = person
      ? `${person.csaladnev || ''} ${person.k_nev || ''}`.trim().toUpperCase()
      : ''
    const age = calculateAge(person?.sz_datum, hdatum)
    const deathDate = hdatum ? formatHungarianDate(hdatum) + '-án' : ''

    // 2026-05-30: temetés időpont 24 órás formátumban ("14:00 órakor lesz")
    const funeralDateBase = tdatum ? formatHungarianDate(tdatum) + '-én' : ''
    const funeralDate = funeralDateBase
      ? (funeralTime ? `${funeralDateBase}, ${funeralTime} órakor lesz` : `${funeralDateBase} lesz`)
      : ''

    // 2026-05-30: virrasztás sor — csak akkor jelenik meg, ha ki van töltve.
    // Példa: "Virrasztás: 2026. március 24-én 19:00 órakor, a ravatalozóban"
    let vigilLine = ''
    if (vigilDate || vigilTime || vigilPlace) {
      const vigilDateFmt = vigilDate ? formatHungarianDate(vigilDate) + '-én' : ''
      const parts: string[] = []
      if (vigilDateFmt) parts.push(vigilDateFmt)
      if (vigilTime) parts.push(`${vigilTime} órakor`)
      let head = parts.join(' ')
      if (vigilPlace) head = head ? `${head}, ${vigilPlace}` : vigilPlace
      vigilLine = head ? `Virrasztás: ${head}` : ''
    }

    const data: Record<string, string> = {
      fullName,
      relativeRelation, // form-ből szerkeszthető
      age,
      deathDate,
      funeralDate,
      funeralPlace: funeralPlace || 'a Református Temetőben.',
      vigilLine,
      mourners, // form-ből szerkeszthető vagy üres (skippelhető)
      verseText: verseText || 'Az Úr adta, az Úr vette el,\náldott legyen az Úr neve.',
      verseReference: verseReference || 'Jób 1,21',
    }
    const out: Record<string, string> = {}
    for (const field of template.fields) {
      out[field.id] = fillTemplate(field.defaultValue, data)
    }
    return out
  }, [template, person, hdatum, tdatum, funeralPlace, funeralTime, vigilDate, vigilTime, vigilPlace, verseText, verseReference, relativeRelation, mourners])

  async function handleSubmit(): Promise<boolean> {
    if (!person) { toast.error('Válasszon személyt!'); return false }
    if (!hdatum || !tdatum) { toast.error('A halál és temetés dátuma kötelező!'); return false }
    setLoading(true)
    const result = await saveBurial({
      id: editEntry?.id,
      id_szemely: person.id,
      hdatum, tdatum,
      hoka: hoka || null,
      okirat: okirat || null,
      egyhazi_szam: egyhaziSzam || null,
      lelkeszneve: lelkesz || null,
      munkanaploba,
      megjegyzes: megj || null,
      // 2026-05-30: gyászjelentés-specifikus mezők (a megjegyzés sablon JSON-be
      // kerülnek a saveBurial action által).
      funeral_time: funeralTime || null,
      funeral_place: funeralPlace || null,
      vigil_date: vigilDate || null,
      vigil_time: vigilTime || null,
      vigil_place: vigilPlace || null,
      verse_text: verseText || null,
      verse_reference: verseReference || null,
      relative_relation: relativeRelation || null,
      mourners: mourners || '', // üres string is OK — skip esetén üres sor jelenik meg
    })
    setLoading(false)
    if (result.error) { toast.error(result.error); return false }
    // 2026-08-04 (PR-42): ha a tag „elhunyt" jelölése vagy a családi/háztartási
    // lezárás nem sikerült, azt eddig SEMMI nem mutatta — a lelkész azt hitte,
    // minden rendben. Most külön figyelmeztetés jelenik meg.
    if ('warning' in result && result.warning) {
      toast.warning(result.warning, { duration: 12000 })
    } else {
      toast.success('Temetés rögzítve! A tag státusza „elhunyt"-ra változott.', { duration: 4000 })
    }
    return true
  }

  async function handleSaveOnly() {
    const ok = await handleSubmit()
    if (ok) onOpenChange(false)
  }

  async function handleSaveAndPrint() {
    const ok = await handleSubmit()
    if (!ok) return
    setTimeout(() => {
      handlePrint()
      setTimeout(() => onOpenChange(false), 500)
    }, 50)
  }

  function handlePrint() {
    if (!printRef.current) return
    const html = printRef.current.outerHTML
    const win = window.open('', '_blank', 'width=900,height=1200')
    if (!win) { toast.error('A böngésző blokkolta a popup-ot.'); return }
    win.document.write(`<!DOCTYPE html><html lang="hu"><head><meta charset="utf-8"><title>Gyászjelentés</title>
      <style>
        @page { size: A4 portrait; margin: 0; }
        html, body { margin: 0; padding: 0; background: #020202; }
        body { display: flex; align-items: center; justify-content: center; }
        .certificate-renderer { width: 210mm !important; height: 297mm !important; max-width: 210mm !important; aspect-ratio: 210/297 !important; }
        .certificate-renderer img { width: 100% !important; height: 100% !important; }
        @media print { html, body { width: 210mm; height: 297mm; } .certificate-renderer { box-shadow: none !important; } }
      </style>
    </head><body>${html}<script>window.onload = () => { setTimeout(() => window.print(), 200); };</script></body></html>`)
    win.document.close()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-3xl md:max-w-5xl lg:max-w-6xl xl:max-w-7xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {editEntry ? 'Haláleset szerkesztése' : 'Haláleset rögzítése'}
            <span className="text-xs font-normal text-amber-600 inline-flex items-center gap-1">
              <Sparkles className="size-3.5" />
              élő gyászjelentés-előnézet
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,400px)]">
          {/* ─── BAL: űrlap ─── */}
          <div className="space-y-3 md:max-h-[78vh] md:overflow-y-auto md:pr-2">
            <div className="space-y-1.5">
              <Label>Személy *</Label>
              <MemberSearchSelect value={person} onChange={setPerson} placeholder="Keresés (családnév, keresztnév)…" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Halál dátuma *</Label><Input type="date" value={hdatum} onChange={e => setHdatum(e.target.value)} className={FIELD_INPUT_CLASS} /></div>
              <div className="space-y-1.5"><Label>Temetés dátuma *</Label><Input type="date" value={tdatum} onChange={e => setTdatum(e.target.value)} className={FIELD_INPUT_CLASS} /></div>
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
                <Label className="text-xs">Állami halotti szám</Label>
                <Input value={okirat} onChange={e => setOkirat(e.target.value)} placeholder="opcionális" className={FIELD_INPUT_CLASS} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">
                  Temetés időpontja
                  <span className="ml-1 text-[10px] font-normal text-slate-500">(24 órás, HH:MM)</span>
                </Label>
                <Input
                  type="time"
                  value={funeralTime}
                  onChange={e => setFuneralTime(e.target.value)}
                  step={60}
                  className={FIELD_INPUT_CLASS}
                  placeholder="14:00"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Halál oka</Label><Input value={hoka} onChange={e => setHoka(e.target.value)} className={FIELD_INPUT_CLASS} /></div>
              <div className="space-y-1.5"><Label>Lelkész</Label><Input value={lelkesz} onChange={e => setLelkesz(e.target.value)} className={FIELD_INPUT_CLASS} /></div>
            </div>

            <div className="space-y-1.5">
              <Label>Temetés helye <span className="text-[10px] font-normal text-slate-500">(a gyászjelentésen)</span></Label>
              <Input
                value={funeralPlace}
                onChange={e => setFuneralPlace(e.target.value)}
                placeholder="pl. a Felsővárosi Református Temető ravatalozójában."
                className={FIELD_INPUT_CLASS}
              />
            </div>

            {/* 2026-05-30: Bevezető (rokoni viszony) — szerkeszthető */}
            <div className="space-y-1.5">
              <Label>
                Bevezető szöveg <span className="text-[10px] font-normal text-slate-500">(rokoni / egyházi viszony)</span>
              </Label>
              <Input
                value={relativeRelation}
                onChange={e => setRelativeRelation(e.target.value)}
                placeholder="pl. egyháztagunk és hitbeli testvérünk"
                className={FIELD_INPUT_CLASS}
              />
              <p className="text-[10px] text-slate-500">
                A gyászjelentésen: „Mély fájdalommal tudatjuk, hogy szeretett <strong>{relativeRelation || '...'}</strong>"
              </p>
            </div>

            {/* 2026-05-30: Gyászolók — szerkeszthető + skippelhető */}
            <div className="space-y-1.5">
              <Label>
                Gyászolják <span className="text-[10px] font-normal text-slate-500">(opcionális — ürítsd ha nem kell)</span>
              </Label>
              <textarea
                value={mourners}
                onChange={e => setMourners(e.target.value)}
                rows={3}
                placeholder="Gyászolják:&#10;Szerető családja és mindazok,&#10;akik ismerték és tisztelték"
                className={`w-full rounded-md px-3 py-2 text-sm ${FIELD_INPUT_CLASS}`}
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setMourners('')}
                  className="text-[10px] text-slate-500 hover:text-slate-700 underline"
                >
                  Ürítés (a sor nem jelenik meg)
                </button>
                <button
                  type="button"
                  onClick={() => setMourners('Gyászolják:\nSzerető családja és mindazok,\nakik ismerték és tisztelték')}
                  className="text-[10px] text-slate-500 hover:text-slate-700 underline"
                >
                  Alapérték visszaállítása
                </button>
              </div>
            </div>

            {/* 2026-05-30: Virrasztás (opcionális) — csak akkor jelenik meg a gyászjelentésen, ha legalább egyik mező ki van töltve */}
            <div className="rounded-md border border-slate-200 bg-slate-50/40 p-2.5 space-y-2">
              <p className="text-xs font-medium text-slate-700">
                Virrasztás <span className="text-[10px] font-normal text-slate-500">(opcionális — csak akkor látszik a gyászjelentésen, ha kitöltöd)</span>
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[11px]">Virrasztás dátuma</Label>
                  <Input type="date" value={vigilDate} onChange={e => setVigilDate(e.target.value)} className={`h-8 text-xs ${FIELD_INPUT_CLASS}`} />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Időpont <span className="text-[10px] text-slate-500">(24h)</span></Label>
                  <Input type="time" value={vigilTime} onChange={e => setVigilTime(e.target.value)} step={60} className={`h-8 text-xs ${FIELD_INPUT_CLASS}`} placeholder="19:00" />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">Virrasztás helye</Label>
                <Input value={vigilPlace} onChange={e => setVigilPlace(e.target.value)} placeholder="pl. a ravatalozóban" className={`h-8 text-xs ${FIELD_INPUT_CLASS}`} />
              </div>
            </div>

            {/* 2026-05-30: Igevers — alapból Jób 1,21, de a felhasználó cserélheti */}
            <div className="rounded-md border border-slate-200 bg-slate-50/40 p-2.5 space-y-2">
              <p className="text-xs font-medium text-slate-700">
                Igevers a gyászjelentésen <span className="text-[10px] font-normal text-slate-500">(opcionális csere)</span>
              </p>
              <div className="space-y-1">
                <Label className="text-[11px]">Igevers szövege</Label>
                <textarea
                  value={verseText}
                  onChange={e => setVerseText(e.target.value)}
                  rows={2}
                  placeholder="„Az Úr adta, az Úr vette el, áldott legyen az Úr neve."
                  className={`w-full rounded-md px-3 py-2 text-xs ${FIELD_INPUT_CLASS}`}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">Igehely</Label>
                <Input value={verseReference} onChange={e => setVerseReference(e.target.value)} placeholder="pl. Jób 1,21" className={`h-8 text-xs ${FIELD_INPUT_CLASS}`} />
              </div>
            </div>

            <div className="space-y-1.5"><Label>Megjegyzés</Label><Input value={megj} onChange={e => setMegj(e.target.value)} className={FIELD_INPUT_CLASS} /></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={munkanaploba} onChange={e => setMunkanaploba(e.target.checked)} /> Rögzítés a munkanaplóba</label>
            {/* 2026-05-30: a saveBurial 2026-05-02 óta automatikusan beállítja
                a szemely.meghalt=true és member_status='elhunyt' mezőket. */}
            <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 p-2 rounded">
              ℹ️ A mentéskor a tag státusza automatikusan <strong>„elhunyt"</strong>-ra változik a Tagnyilvántartásban is. Ezt nem kell külön elintézni.
            </p>
          </div>

          {/* ─── JOBB: élő gyászjelentés-vászon ─── */}
          <aside className="md:sticky md:top-0 md:self-start">
            <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-3 mb-2">
              <p className="text-[11px] text-amber-900 leading-relaxed">
                <Sparkles className="size-3 inline mr-1 text-amber-600" />
                A gyászjelentés azonnal frissül a bevitt adatokkal. A vásznon közvetlenül kattintva is szerkeszthető (rokoni viszony, gyászolók, igevers).
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
            <p className="mt-1.5 text-[10px] text-slate-400 text-center">A4 álló · Gyászjelentés sablon{congregationName ? ` · ${congregationName}` : ''}</p>
          </aside>
        </div>

        <div className="flex flex-wrap gap-2 pt-4 border-t border-zinc-100 mt-4">
          <Button variant="outline" className="rounded-xl bg-zinc-50 hover:bg-zinc-100 text-zinc-600" onClick={() => onOpenChange(false)}>Mégse</Button>
          <div className="flex-1" />
          <Button variant="outline" onClick={handleSaveOnly} disabled={loading} className="border-gray-300 text-gray-700 hover:bg-gray-50">
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
  )
}
