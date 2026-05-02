'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { saveBurial, getNextEgyhaziSzam } from '@/app/(dashboard)/anyakonyv/actions'
import { MemberSearchSelect, type MemberSearchResult } from '@/components/registry/member-search-select'
import { toast } from 'sonner'

interface BurialDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
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

export function BurialDialog({ open, onOpenChange, editEntry }: BurialDialogProps) {
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
      // Auto-fill egyházi anyakönyvi szám
      getNextEgyhaziSzam('burial', new Date().getFullYear()).then(v => {
        if (!cancelled) setEgyhaziSzam(v)
      })
    })
    return () => { cancelled = true }
  }, [open, editEntry])

  async function handleSubmit() {
    if (!person) { toast.error('Válasszon személyt!'); return }
    if (!hdatum || !tdatum) { toast.error('A halál és temetés dátuma kötelező!'); return }
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
    if (result.error) toast.error(result.error)
    else { toast.success('Temetés rögzítve!'); onOpenChange(false) }
    setLoading(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{editEntry ? 'Haláleset szerkesztése' : 'Haláleset rögzítése'}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Személy *</Label>
            <MemberSearchSelect value={person} onChange={setPerson} placeholder="Keresés (családnév, keresztnév)…" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Halál dátuma *</Label><Input type="date" value={hdatum} onChange={e => setHdatum(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Temetés dátuma *</Label><Input type="date" value={tdatum} onChange={e => setTdatum(e.target.value)} /></div>
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
              <Label className="text-xs">Állami halotti anyakönyvi szám</Label>
              <Input value={okirat} onChange={e => setOkirat(e.target.value)} placeholder="opcionális" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Halál oka</Label><Input value={hoka} onChange={e => setHoka(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Lelkész</Label><Input value={lelkesz} onChange={e => setLelkesz(e.target.value)} /></div>
          </div>
          <div className="space-y-1.5"><Label>Megjegyzés</Label><Input value={megj} onChange={e => setMegj(e.target.value)} /></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={munkanaploba} onChange={e => setMunkanaploba(e.target.checked)} /> Rögzítés a munkanaplóba</label>
          <p className="text-xs text-amber-600 bg-amber-50 p-2 rounded">A temetés rögzítése NEM módosítja a tag státuszát. A tag kivezetéséhez használja a Tagnyilvántartás modult.</p>
          <div className="flex gap-2 pt-4 border-t border-zinc-100">
            <Button variant="outline" className="flex-1 rounded-xl bg-zinc-50 hover:bg-zinc-100 text-zinc-600" onClick={() => onOpenChange(false)}>Mégse</Button>
            <Button className="bg-gray-700 hover:bg-gray-800" onClick={handleSubmit} disabled={loading}>{loading ? 'Mentés...' : 'Mentés'}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
