'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Printer, Save, Sparkles } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { saveMarriage, getNextEgyhaziSzam } from '@/app/(dashboard)/anyakonyv/actions'
import { MemberSearchSelect, type MemberSearchResult } from '@/components/registry/member-search-select'
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

// Jól látható input-stílus (felhasználói kérés alapján)
const FIELD_INPUT_CLASS = 'bg-white shadow-sm border-slate-300'

interface MarriageDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  congregationName?: string
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

export function MarriageDialog({ open, onOpenChange, congregationName = '', editEntry }: MarriageDialogProps) {
  const [loading, setLoading] = useState(false)
  const [groom, setGroom] = useState<MemberSearchResult | null>(null)
  const [bride, setBride] = useState<MemberSearchResult | null>(null)
  const [datum, setDatum] = useState('')
  const [egyhaziSzam, setEgyhaziSzam] = useState('')
  const [hlevel, setHlevel] = useState('')
  const [lelkesz, setLelkesz] = useState('')
  const [tanuk, setTanuk] = useState('')
  const [vegyes, setVegyes] = useState(false)
  const [megj, setMegj] = useState('')
  const [gondnok, setGondnok] = useState('')
  // 2026-05-30: emléklap-specifikus mezők (a hazassag táblában nincs külön
  // oszlop nekik — sablon JSON-ben tárolódnak a megjegyzes-ben).
  const [husbandBirthPlace, setHusbandBirthPlace] = useState('')
  const [wifeBirthPlace, setWifeBirthPlace] = useState('')
  const [verseText, setVerseText] = useState('')
  const [verseReference, setVerseReference] = useState('')
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
        // 2026-05-30: a sablon JSON parse a megjegyzes-ből (baptism mintára)
        const rawMegj = (editEntry.megjegyzes as string) || ''
        const idx = rawMegj.indexOf('|sablon:')
        if (idx > -1) {
          setMegj(rawMegj.slice(0, idx))
          try {
            const s = JSON.parse(rawMegj.slice(idx + 8))
            setHusbandBirthPlace(s.husband_birth_place || '')
            setWifeBirthPlace(s.wife_birth_place || '')
            setVerseText(s.verse_text || '')
            setVerseReference(s.verse_reference || '')
          } catch {
            setHusbandBirthPlace(''); setWifeBirthPlace('')
            setVerseText(''); setVerseReference('')
          }
        } else {
          setMegj(rawMegj)
          setHusbandBirthPlace(''); setWifeBirthPlace('')
          setVerseText(''); setVerseReference('')
        }
        return
      }
      setGroom(null); setBride(null)
      setDatum(new Date().toISOString().slice(0, 10))
      setHlevel(''); setLelkesz(''); setTanuk(''); setVegyes(false); setMegj('')
      setHusbandBirthPlace(''); setWifeBirthPlace('')
      setVerseText(''); setVerseReference('')
      try {
        const savedGondnok = localStorage.getItem('kartoteka.emleklap.gondnokName')
        if (savedGondnok) setGondnok(savedGondnok)
      } catch {}
      getNextEgyhaziSzam('marriage', new Date().getFullYear()).then(v => {
        if (!cancelled) setEgyhaziSzam(v)
      })
    })
    return () => { cancelled = true }
  }, [open, editEntry])

  // 2026-05-29: élő esketési emléklap-preview
  const template: EmleklapTemplate = EMLEKLAP_TEMPLATES_MAP['esketes-erek']

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

  async function handleSubmit(): Promise<boolean> {
    if (!groom || !bride) { toast.error('Mindkét fél kötelező!'); return false }
    if (!datum) { toast.error('A dátum kötelező!'); return false }
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
      megjegyzes: megj || null,
      husband_birth_place: husbandBirthPlace || null,
      wife_birth_place: wifeBirthPlace || null,
      verse_text: verseText || null,
      verse_reference: verseReference || null,
    })
    setLoading(false)
    if (result.error) { toast.error(result.error); return false }
    toast.success('Házasság rögzítve!')
    return true
  }

  async function handleSaveOnly() {
    const ok = await handleSubmit()
    if (ok) onOpenChange(false)
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-3xl md:max-w-5xl lg:max-w-6xl xl:max-w-7xl max-h-[92vh] overflow-y-auto">
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
          <div className="space-y-3 md:max-h-[78vh] md:overflow-y-auto md:pr-2">
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
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Menyasszony szül. helye (ragozva)</Label>
                  <Input
                    value={wifeBirthPlace}
                    onChange={e => setWifeBirthPlace(e.target.value)}
                    placeholder="pl. Kovásznán"
                    className={`h-8 text-xs ${FIELD_INPUT_CLASS}`}
                  />
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
          </div>

          {/* ─── JOBB: élő esketési emléklap ─── */}
          <aside className="md:sticky md:top-0 md:self-start">
            <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-3 mb-2">
              <p className="text-[11px] text-amber-900 leading-relaxed">
                <Sparkles className="size-3 inline mr-1 text-amber-600" />
                Az esketési emléklap automatikusan kitöltődik a beírt adatokkal.
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
            <p className="mt-1.5 text-[10px] text-slate-400 text-center">A4 álló · Erdélyi új esketési sablon</p>
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
  )
}
