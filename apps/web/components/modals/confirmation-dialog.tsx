'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Printer, Save, Sparkles } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { saveConfirmationBatch, saveConfirmationSingle, getNextEgyhaziSzam } from '@/app/(dashboard)/anyakonyv/actions'
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

const FIELD_INPUT_CLASS = 'bg-white shadow-sm border-slate-300'

interface Candidate {
  id: number
  name: string
  ferfi: boolean | null
  szDatum: string
  helyseg: string
  utca: string
}

interface ConfirmationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  congregationName?: string
  /** Szerkesztés módban: egy meglévő konfirmáció bejegyzés. */
  editEntry?: {
    id: number
    datum?: string
    egyhazi_szam?: string
    lelkeszneve?: string
    megjegyzes?: string
    szemely?: { id: number; csaladnev: string; k_nev: string; ferfi: boolean | null; sz_datum: string | null } | null
    [key: string]: unknown
  } | null
}

function age(szDatum: string | null): number | null {
  if (!szDatum) return null
  const m = szDatum.match(/^(\d{4})/)
  if (!m) return null
  return new Date().getFullYear() - parseInt(m[1])
}

export function ConfirmationDialog({ open, onOpenChange, congregationName = '', editEntry }: ConfirmationDialogProps) {
  // Szerkesztés módban egyetlen személy szerkeszthető — batch módot
  // csak új-rögzítésnél engedjük (Endre kérése: a szerkesztésnél is
  // kitöltött mezők látszanak).
  const isEdit = !!editEntry

  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [editPerson, setEditPerson] = useState<MemberSearchResult | null>(null)
  const [datum, setDatum] = useState('')
  const [lelkesz, setLelkesz] = useState('')
  const [megj, setMegj] = useState('')
  const [munkanaploba, setMunkanaploba] = useState(false)
  const [loading, setLoading] = useState(false)
  const [egyhaziSzam, setEgyhaziSzam] = useState('')
  const [fogondnok, setFogondnok] = useState('')
  const printRef = useRef<HTMLDivElement>(null)

  // 2026-05-30: élő konfirmációi emléklap-preview MINDKÉT mód (szerk. + új-batch)
  const template: EmleklapTemplate = EMLEKLAP_TEMPLATES_MAP['konfirmacio-erek']

  // previewPerson: edit módban = editPerson, batch módban = utoljára hozzáadott jelölt
  const previewPerson = useMemo(() => {
    if (isEdit && editPerson) {
      return {
        csaladnev: editPerson.csaladnev,
        k_nev: editPerson.k_nev,
        sz_datum: editPerson.sz_datum,
      }
    }
    const last = candidates[candidates.length - 1]
    if (last) {
      return {
        csaladnev: last.name.split(' ')[0],
        k_nev: last.name.split(' ').slice(1).join(' '),
        sz_datum: last.szDatum,
      }
    }
    return null
  }, [isEdit, editPerson, candidates])

  const fieldValues = useMemo(() => {
    if (!previewPerson) return {}
    const fullName = `${previewPerson.csaladnev || ''} ${previewPerson.k_nev || ''}`.trim().toUpperCase()
    const birthDateRaw = previewPerson.sz_datum && !previewPerson.sz_datum.includes('—')
      ? formatHungarianDate(previewPerson.sz_datum)
      : ''
    const birthDate = birthDateRaw ? `${birthDateRaw}-ÉN`.toUpperCase() : ''
    const issueDate = datum ? formatHungarianDate(datum).toUpperCase() : ''
    const issueLocation = extractCityFromCongregationName(congregationName).toUpperCase()

    const data: Record<string, string> = {
      congregationName: congregationName || '',
      fullName,
      birthPlace: '',
      birthDate,
      baptismCongregation: '',
      baptismDate: '',
      confirmCongregation: congregationName ? `${congregationName}BEN`.toUpperCase() : '',
      issueLocation,
      issueDate,
      mainWardenName: (fogondnok || '').toUpperCase(),
      pastorName: (lelkesz || '').toUpperCase(),
    }
    const out: Record<string, string> = {}
    for (const field of template.fields) {
      out[field.id] = fillTemplate(field.defaultValue, data)
    }
    return out
  }, [template, previewPerson, datum, lelkesz, fogondnok, congregationName])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      if (editEntry) {
        // Szerkesztés mód
        setEditPerson(editEntry.szemely
          ? { ...editEntry.szemely, cnp: null, c_szam: null }
          : null)
        setCandidates([])
        setDatum((editEntry.datum as string)?.split('T')[0] || '')
        setLelkesz((editEntry.lelkeszneve as string) || '')
        setMegj((editEntry.megjegyzes as string) || '')
        setEgyhaziSzam((editEntry.egyhazi_szam as string) || '')
        setMunkanaploba(false)
        return
      }
      // Új batch
      setEditPerson(null)
      setCandidates([])
      setDatum(new Date().toISOString().slice(0, 10))
      setLelkesz(''); setMegj(''); setMunkanaploba(false)
      try {
        const saved = localStorage.getItem('kartoteka.emleklap.gondnokName')
        if (saved) setFogondnok(saved)
      } catch {}
      getNextEgyhaziSzam('confirmation', new Date().getFullYear()).then(v => {
        if (!cancelled) setEgyhaziSzam(v)
      })
    })
    return () => { cancelled = true }
  }, [open, editEntry])

  function handlePick(picker: MemberSearchResult | null) {
    if (!picker) return
    setCandidates(prev => {
      if (prev.find(c => c.id === picker.id)) {
        toast.error('Már hozzáadva!')
        return prev
      }
      return [...prev, {
        id: picker.id,
        name: `${picker.csaladnev || ''} ${picker.k_nev || ''}`.trim(),
        ferfi: picker.ferfi,
        szDatum: picker.sz_datum?.split('T')[0] || '—',
        helyseg: picker.adrlocality?.name || '',
        utca: picker.adrstreet?.name || '',
      }]
    })
  }

  function removeCandidate(id: number) { setCandidates(prev => prev.filter(c => c.id !== id)) }

  async function handleSubmitEdit(): Promise<boolean> {
    if (!datum) { toast.error('A dátum kötelező!'); return false }
    if (!editPerson || !editEntry) { toast.error('Hiányos adat.'); return false }
    setLoading(true)
    const result = await saveConfirmationSingle({
      id: editEntry.id,
      id_szemely: editPerson.id,
      datum,
      egyhazi_szam: egyhaziSzam || null,
      lelkeszneve: lelkesz || null,
      megjegyzes: megj || null,
    })
    setLoading(false)
    if (result.error) { toast.error(result.error); return false }
    toast.success('Konfirmáció szerkesztve!')
    return true
  }

  async function handleSubmitBatch() {
    if (!datum) { toast.error('A dátum kötelező!'); return }
    if (candidates.length === 0) { toast.error('Minimum 1 konfirmandus szükséges!'); return }
    setLoading(true)
    const result = await saveConfirmationBatch({
      datum,
      lelkeszneve: lelkesz || null,
      megjegyzes: megj || null,
      munkanaploba,
      candidates: candidates.map(c => c.id),
    })
    if (result.error) toast.error(result.error)
    else { toast.success(`${result.count} konfirmáció rögzítve!`); onOpenChange(false) }
    setLoading(false)
  }

  async function handleSaveOnlyEdit() {
    const ok = await handleSubmitEdit()
    if (ok) onOpenChange(false)
  }

  async function handleSaveAndPrintEdit() {
    let pastor = lelkesz.trim()
    let warden = fogondnok.trim()
    if (!pastor) {
      const v = window.prompt('A lelkész neve nincs megadva — az emléklapra kerül. Add meg most:', '')
      if (v === null) return
      pastor = v.trim()
      if (pastor) setLelkesz(pastor)
    }
    if (!warden) {
      const v = window.prompt('A főgondnok neve nincs megadva. Add meg most (megőrződik):', '')
      if (v === null) return
      warden = v.trim()
      if (warden) {
        setFogondnok(warden)
        try { localStorage.setItem('kartoteka.emleklap.gondnokName', warden) } catch {}
      }
    }
    const ok = await handleSubmitEdit()
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
    win.document.write(`<!DOCTYPE html><html lang="hu"><head><meta charset="utf-8"><title>Konfirmációi emléklap</title>
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
      {/* 2026-05-30: a batch mód is széles dialog — preview-val a jobb oldalon */}
      <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-3xl md:max-w-5xl lg:max-w-6xl xl:max-w-7xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isEdit ? 'Konfirmáció szerkesztése' : 'Konfirmandusok rögzítése'}
            <span className="text-xs font-normal text-amber-600 inline-flex items-center gap-1">
              <Sparkles className="size-3.5" />
              élő emléklap-előnézet
            </span>
          </DialogTitle>
        </DialogHeader>

        {isEdit ? (
          // ─── SZERKESZTÉS MÓD — fúziós 2-oszlopos ─────────────────
          <>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,400px)]">
              <div className="space-y-3 md:max-h-[78vh] md:overflow-y-auto md:pr-2">
                <div className="space-y-1.5">
                  <Label>Konfirmandus *</Label>
                  <MemberSearchSelect value={editPerson} onChange={setEditPerson} placeholder="Keresés (családnév, keresztnév)…" />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">
                      Egyházi anyakönyvi szám
                      <span className="ml-1 text-[10px] font-normal text-violet-600">(automatikus)</span>
                    </Label>
                    <Input value={egyhaziSzam} onChange={e => setEgyhaziSzam(e.target.value)} className={`font-mono text-violet-700 ${FIELD_INPUT_CLASS}`} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Dátum *</Label>
                    <Input type="date" value={datum} onChange={e => setDatum(e.target.value)} className={FIELD_INPUT_CLASS} />
                  </div>
                </div>
                <div className="space-y-1.5"><Label>Lelkész</Label><Input value={lelkesz} onChange={e => setLelkesz(e.target.value)} className={FIELD_INPUT_CLASS} /></div>
                <div className="space-y-1.5">
                  <Label>Főgondnok <span className="text-[10px] font-normal text-slate-500">(az emléklapra)</span></Label>
                  <Input
                    value={fogondnok}
                    onChange={e => setFogondnok(e.target.value)}
                    placeholder="Főgondnok teljes neve"
                    className={FIELD_INPUT_CLASS}
                    onBlur={() => { try { if (fogondnok) localStorage.setItem('kartoteka.emleklap.gondnokName', fogondnok) } catch {} }}
                  />
                </div>
                <div className="space-y-1.5"><Label>Megjegyzés</Label><Input value={megj} onChange={e => setMegj(e.target.value)} className={FIELD_INPUT_CLASS} /></div>
              </div>

              <aside className="md:sticky md:top-0 md:self-start">
                <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-3 mb-2">
                  <p className="text-[11px] text-amber-900 leading-relaxed">
                    <Sparkles className="size-3 inline mr-1 text-amber-600" />
                    A konfirmációi emléklap automatikusan kitöltődik a beírt adatokkal.
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
                <p className="mt-1.5 text-[10px] text-slate-400 text-center">A4 álló · EREK konfirmációi sablon</p>
              </aside>
            </div>

            <div className="flex flex-wrap gap-2 pt-4 border-t border-zinc-100 mt-4">
              <Button variant="outline" className="rounded-xl bg-zinc-50 hover:bg-zinc-100 text-zinc-600" onClick={() => onOpenChange(false)}>Mégse</Button>
              <div className="flex-1" />
              <Button variant="outline" onClick={handleSaveOnlyEdit} disabled={loading} className="border-purple-300 text-purple-700 hover:bg-purple-50">
                <Save className="size-4 mr-1.5" />
                {loading ? 'Mentés…' : 'Mentés'}
              </Button>
              <Button onClick={handleSaveAndPrintEdit} disabled={loading} className="bg-amber-600 hover:bg-amber-700 text-white">
                <Printer className="size-4 mr-1.5" />
                {loading ? 'Mentés…' : 'Mentés és nyomtatás'}
              </Button>
            </div>
          </>
        ) : (
          // ─── BATCH MÓD (2026-05-30: 2-oszlopos fúzió + élő preview) ──────────
          <>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,400px)]">
              <div className="space-y-3 md:max-h-[78vh] md:overflow-y-auto md:pr-2">
                {egyhaziSzam && candidates.length === 0 && (
                  <div className="rounded-lg border border-violet-200 bg-violet-50/50 p-2.5 text-xs text-violet-700">
                    <span className="font-medium">Automatikus egyházi anyakönyvi szám:</span>{' '}
                    <span className="font-mono">{egyhaziSzam}</span>
                    {' '}<span className="text-violet-500">(és ettől folyamatosan a többi konfirmandusnak)</span>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label>Konfirmandus hozzáadása</Label>
                  <MemberSearchSelect value={null} onChange={handlePick} placeholder="Keresés (családnév, keresztnév)…" />
                </div>

                {candidates.length > 0 && (
                  <div className="border rounded-lg overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 border-b">
                        <tr>
                          <th className="p-2 text-left w-8">#</th>
                          <th className="p-2 text-left">Név</th>
                          <th className="p-2 text-left">Életkor</th>
                          <th className="p-2 w-8"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {candidates.map((c, i) => {
                          const ageVal = age(c.szDatum.includes('—') ? null : c.szDatum)
                          const isLast = i === candidates.length - 1
                          return (
                            <tr key={c.id} className={`border-b ${isLast ? 'bg-amber-50/30' : ''}`}>
                              <td className="p-2 text-muted-foreground">{i + 1}</td>
                              <td className="p-2 font-medium">
                                {c.name}{' '}
                                {c.ferfi !== null && <span className="text-xs text-slate-400">{c.ferfi ? '♂' : '♀'}</span>}
                                {isLast && <span className="ml-2 text-[10px] text-amber-700">← preview</span>}
                              </td>
                              <td className="p-2 text-xs text-slate-600">{ageVal !== null ? `${ageVal} éves` : '—'}</td>
                              <td className="p-2">
                                <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-400" onClick={() => removeCandidate(c.id)}>✕</Button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                    <div className="p-2 flex justify-between items-center bg-slate-50">
                      <Badge variant="secondary">{candidates.length} fő</Badge>
                      <Button variant="ghost" size="sm" className="text-xs text-red-500" onClick={() => setCandidates([])}>Mindent töröl</Button>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label>Dátum *</Label><Input type="date" value={datum} onChange={e => setDatum(e.target.value)} className={FIELD_INPUT_CLASS} /></div>
                  <div className="space-y-1.5"><Label>Lelkész</Label><Input value={lelkesz} onChange={e => setLelkesz(e.target.value)} className={FIELD_INPUT_CLASS} /></div>
                </div>
                <div className="space-y-1.5">
                  <Label>Főgondnok <span className="text-[10px] font-normal text-slate-500">(az emléklapra)</span></Label>
                  <Input
                    value={fogondnok}
                    onChange={e => setFogondnok(e.target.value)}
                    placeholder="Főgondnok teljes neve"
                    className={FIELD_INPUT_CLASS}
                    onBlur={() => { try { if (fogondnok) localStorage.setItem('kartoteka.emleklap.gondnokName', fogondnok) } catch {} }}
                  />
                </div>
                <div className="space-y-1.5"><Label>Megjegyzés</Label><Input value={megj} onChange={e => setMegj(e.target.value)} className={FIELD_INPUT_CLASS} /></div>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={munkanaploba} onChange={e => setMunkanaploba(e.target.checked)} /> Rögzítés a munkanaplóba</label>
              </div>

              <aside className="md:sticky md:top-0 md:self-start">
                <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-3 mb-2">
                  <p className="text-[11px] text-amber-900 leading-relaxed">
                    <Sparkles className="size-3 inline mr-1 text-amber-600" />
                    Az emléklap-vászon az <strong>utoljára hozzáadott</strong> konfirmandus adataival töltődik. Új jelölt hozzáadásakor a vászon automatikusan vált.
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
                <p className="mt-1.5 text-[10px] text-slate-400 text-center">A4 álló · EREK konfirmációi sablon</p>
              </aside>
            </div>

            <div className="flex gap-2 pt-4 border-t border-zinc-100 mt-4">
              <Button variant="outline" className="flex-1 rounded-xl bg-zinc-50 hover:bg-zinc-100 text-zinc-600" onClick={() => onOpenChange(false)}>Mégse</Button>
              <Button className="bg-purple-600 hover:bg-purple-700" onClick={handleSubmitBatch} disabled={loading || candidates.length === 0}>
                {loading ? 'Mentés...' : `Mentés (${candidates.length} fő)`}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
