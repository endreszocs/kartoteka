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
        setMegj((editEntry.megjegyzes as string) || '')
        setMunkanaploba(false)
        return
      }
      setPerson(null)
      setHdatum(''); setTdatum(''); setHoka(''); setOkirat('')
      setLelkesz(''); setMegj(''); setMunkanaploba(false)
      setFuneralPlace(''); setFuneralTime('14:00')
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
    const funeralDateBase = tdatum ? formatHungarianDate(tdatum) + '-én' : ''
    const funeralDate = funeralDateBase && funeralTime ? `${funeralDateBase}, ${funeralTime}` : funeralDateBase

    const data: Record<string, string> = {
      fullName,
      relativeRelation: 'édesapánk, nagyapánk és rokonunk', // user-szerkeszthető a vásznon
      age,
      deathDate,
      funeralDate,
      funeralPlace: funeralPlace || 'a Református Temetőben.',
      mourners: 'Szerető családja és mindazok,\nakik ismerték és tisztelték',
      verseText: 'Az Úr adta, az Úr vette el,\náldott legyen az Úr neve.',
      verseReference: 'Jób 1,21',
    }
    const out: Record<string, string> = {}
    for (const field of template.fields) {
      out[field.id] = fillTemplate(field.defaultValue, data)
    }
    return out
  }, [template, person, hdatum, tdatum, funeralPlace, funeralTime])

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
    })
    setLoading(false)
    if (result.error) { toast.error(result.error); return false }
    toast.success('Temetés rögzítve!')
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
                <Label className="text-xs">Temetés időpontja</Label>
                <Input type="time" value={funeralTime} onChange={e => setFuneralTime(e.target.value)} className={FIELD_INPUT_CLASS} />
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

            <div className="space-y-1.5"><Label>Megjegyzés</Label><Input value={megj} onChange={e => setMegj(e.target.value)} className={FIELD_INPUT_CLASS} /></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={munkanaploba} onChange={e => setMunkanaploba(e.target.checked)} /> Rögzítés a munkanaplóba</label>
            <p className="text-xs text-amber-600 bg-amber-50 p-2 rounded">A temetés rögzítése NEM módosítja a tag státuszát. A tag kivezetéséhez használja a Tagnyilvántartás modult.</p>
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
