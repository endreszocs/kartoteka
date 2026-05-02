'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { saveConfirmationBatch, saveConfirmationSingle, getNextEgyhaziSzam } from '@/app/(dashboard)/anyakonyv/actions'
import { MemberSearchSelect, type MemberSearchResult } from '@/components/registry/member-search-select'
import { toast } from 'sonner'

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

export function ConfirmationDialog({ open, onOpenChange, editEntry }: ConfirmationDialogProps) {
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
      // Auto-fill: a következő EGYHÁZI anyakönyvi szám előnézet
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

  async function handleSubmit() {
    if (!datum) { toast.error('A dátum kötelező!'); return }

    if (isEdit) {
      if (!editPerson || !editEntry) { toast.error('Hiányos adat.'); return }
      setLoading(true)
      const result = await saveConfirmationSingle({
        id: editEntry.id,
        id_szemely: editPerson.id,
        datum,
        egyhazi_szam: egyhaziSzam || null,
        lelkeszneve: lelkesz || null,
        megjegyzes: megj || null,
      })
      if (result.error) toast.error(result.error)
      else { toast.success('Konfirmáció szerkesztve!'); onOpenChange(false) }
      setLoading(false)
      return
    }

    // Batch insert
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Konfirmáció szerkesztése' : 'Konfirmandusok rögzítése'}</DialogTitle>
        </DialogHeader>

        {isEdit ? (
          // ─── SZERKESZTÉS MÓD ────────────────────────────────
          <div className="space-y-4">
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
                <Input value={egyhaziSzam} onChange={e => setEgyhaziSzam(e.target.value)} className="font-mono text-violet-700" />
              </div>
              <div className="space-y-1.5">
                <Label>Dátum *</Label>
                <Input type="date" value={datum} onChange={e => setDatum(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5"><Label>Lelkész</Label><Input value={lelkesz} onChange={e => setLelkesz(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Megjegyzés</Label><Input value={megj} onChange={e => setMegj(e.target.value)} /></div>

            <div className="flex gap-2 pt-4 border-t border-zinc-100">
              <Button variant="outline" className="flex-1 rounded-xl bg-zinc-50 hover:bg-zinc-100 text-zinc-600" onClick={() => onOpenChange(false)}>Mégse</Button>
              <Button className="bg-purple-600 hover:bg-purple-700" onClick={handleSubmit} disabled={loading}>{loading ? 'Mentés...' : 'Mentés'}</Button>
            </div>
          </div>
        ) : (
          // ─── BATCH MÓD ──────────────────────────────────────
          <div className="space-y-4">
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
                      <th className="p-2 text-left">Lakhely / Utca</th>
                      <th className="p-2 w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {candidates.map((c, i) => {
                      const ageVal = age(c.szDatum.includes('—') ? null : c.szDatum)
                      return (
                        <tr key={c.id} className="border-b">
                          <td className="p-2 text-muted-foreground">{i + 1}</td>
                          <td className="p-2 font-medium">
                            {c.name}{' '}
                            {c.ferfi !== null && <span className="text-xs text-slate-400">{c.ferfi ? '♂' : '♀'}</span>}
                          </td>
                          <td className="p-2 text-xs text-slate-600">{ageVal !== null ? `${ageVal} éves` : '—'}</td>
                          <td className="p-2 text-xs text-slate-500">
                            {c.helyseg || '—'}{c.utca ? `, ${c.utca}` : ''}
                          </td>
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
              <div className="space-y-1.5"><Label>Dátum *</Label><Input type="date" value={datum} onChange={e => setDatum(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Lelkész</Label><Input value={lelkesz} onChange={e => setLelkesz(e.target.value)} /></div>
            </div>
            <div className="space-y-1.5"><Label>Megjegyzés</Label><Input value={megj} onChange={e => setMegj(e.target.value)} /></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={munkanaploba} onChange={e => setMunkanaploba(e.target.checked)} /> Rögzítés a munkanaplóba</label>

            <div className="flex gap-2 pt-4 border-t border-zinc-100">
              <Button variant="outline" className="flex-1 rounded-xl bg-zinc-50 hover:bg-zinc-100 text-zinc-600" onClick={() => onOpenChange(false)}>Mégse</Button>
              <Button className="bg-purple-600 hover:bg-purple-700" onClick={handleSubmit} disabled={loading || candidates.length === 0}>
                {loading ? 'Mentés...' : `Mentés (${candidates.length} fő)`}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
