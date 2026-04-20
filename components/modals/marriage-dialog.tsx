'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { saveMarriage, getNextOkiratNumber, searchMemberForRegistry } from '@/app/(dashboard)/anyakonyv/actions'
import { toast } from 'sonner'

interface MarriageDialogProps { open: boolean; onOpenChange: (open: boolean) => void; editEntry?: { id: number; datum?: string; hlevel?: string; lelkeszneve?: string; tanuk?: string; ferfi?: { id: number; csaladnev: string; k_nev: string } | null; no?: { id: number; csaladnev: string; k_nev: string } | null; [key: string]: unknown } | null }

export function MarriageDialog({ open, onOpenChange, editEntry }: MarriageDialogProps) {
  const [loading, setLoading] = useState(false)
  const [groomId, setGroomId] = useState<number | null>(null)
  const [groomName, setGroomName] = useState('')
  const [brideId, setBrideId] = useState<number | null>(null)
  const [brideName, setBrideName] = useState('')
  const [datum, setDatum] = useState('')
  const [hlevel, setHlevel] = useState('')
  const [lelkesz, setLelkesz] = useState('')
  const [tanuk, setTanuk] = useState('')
  const [groomSearch, setGroomSearch] = useState('')
  const [brideSearch, setBrideSearch] = useState('')
  const [groomResults, setGroomResults] = useState<{ id: number; csaladnev: string; k_nev: string }[]>([])
  const [brideResults, setBrideResults] = useState<{ id: number; csaladnev: string; k_nev: string }[]>([])
  const [showGroom, setShowGroom] = useState(false)
  const [showBride, setShowBride] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      if (editEntry) {
        setGroomId(editEntry.ferfi?.id || null); setGroomName(editEntry.ferfi ? `${editEntry.ferfi.csaladnev} ${editEntry.ferfi.k_nev}` : '')
        setBrideId(editEntry.no?.id || null); setBrideName(editEntry.no ? `${editEntry.no.csaladnev} ${editEntry.no.k_nev}` : '')
        setDatum((editEntry.datum as string)?.split('T')[0] || ''); setHlevel((editEntry.hlevel as string) || '')
        setLelkesz((editEntry.lelkeszneve as string) || ''); setTanuk((editEntry.tanuk as string) || '')
        setGroomSearch(''); setBrideSearch('')
        return
      }
      setGroomId(null); setGroomName(''); setBrideId(null); setBrideName('')
      setDatum(new Date().toISOString().slice(0, 10)); setLelkesz(''); setTanuk('')
      setGroomSearch(''); setBrideSearch('')
      getNextOkiratNumber('hazassag', new Date().getFullYear()).then(value => {
        if (!cancelled) setHlevel(value)
      })
    })
    return () => {
      cancelled = true
    }
  }, [open, editEntry])

  async function searchGroom(val: string) { setGroomSearch(val); if (val.length < 2) { setShowGroom(false); return }; const r = await searchMemberForRegistry(val, true); setGroomResults(r as unknown as typeof groomResults); setShowGroom(true) }
  async function searchBride(val: string) { setBrideSearch(val); if (val.length < 2) { setShowBride(false); return }; const r = await searchMemberForRegistry(val, false); setBrideResults(r as unknown as typeof brideResults); setShowBride(true) }

  async function handleSubmit() {
    if (!groomId || !brideId) { toast.error('Mindkét fél kötelező!'); return }
    if (!datum) { toast.error('A dátum kötelező!'); return }
    setLoading(true)
    const result = await saveMarriage({ id: editEntry?.id, id_ferfi: groomId, id_no: brideId, datum, hlevel, lelkeszneve: lelkesz || null, tanuk: tanuk || null })
    if (result.error) toast.error(result.error)
    else { toast.success('Házasság rögzítve!'); onOpenChange(false) }
    setLoading(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Házasságkötés rögzítése</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5 relative">
              <Label>Vőlegény *</Label>
              {groomId ? <div className="flex items-center gap-2"><Badge className="bg-blue-100 text-blue-700">{groomName}</Badge><Button variant="ghost" size="sm" className="h-6 text-xs text-red-500" onClick={() => { setGroomId(null); setGroomName('') }}>✕</Button></div>
                : <Input value={groomSearch} onChange={e => searchGroom(e.target.value)} placeholder="Keresés (férfi)..." />}
              {showGroom && groomResults.length > 0 && <div className="absolute z-10 top-full left-0 right-0 bg-white border rounded-lg shadow-lg mt-1 max-h-32 overflow-y-auto">{groomResults.map(r => <div key={r.id} className="p-2 hover:bg-slate-50 cursor-pointer text-xs border-b" onClick={() => { setGroomId(r.id); setGroomName(`${r.csaladnev} ${r.k_nev}`); setShowGroom(false); setGroomSearch('') }}>{r.csaladnev} {r.k_nev}</div>)}</div>}
            </div>
            <div className="space-y-1.5 relative">
              <Label>Menyasszony *</Label>
              {brideId ? <div className="flex items-center gap-2"><Badge className="bg-pink-100 text-pink-700">{brideName}</Badge><Button variant="ghost" size="sm" className="h-6 text-xs text-red-500" onClick={() => { setBrideId(null); setBrideName('') }}>✕</Button></div>
                : <Input value={brideSearch} onChange={e => searchBride(e.target.value)} placeholder="Keresés (nő)..." />}
              {showBride && brideResults.length > 0 && <div className="absolute z-10 top-full left-0 right-0 bg-white border rounded-lg shadow-lg mt-1 max-h-32 overflow-y-auto">{brideResults.map(r => <div key={r.id} className="p-2 hover:bg-slate-50 cursor-pointer text-xs border-b" onClick={() => { setBrideId(r.id); setBrideName(`${r.csaladnev} ${r.k_nev}`); setShowBride(false); setBrideSearch('') }}>{r.csaladnev} {r.k_nev}</div>)}</div>}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5"><Label>Házassági levél *</Label><Input value={hlevel} onChange={e => setHlevel(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Dátum *</Label><Input type="date" value={datum} onChange={e => setDatum(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Lelkész</Label><Input value={lelkesz} onChange={e => setLelkesz(e.target.value)} /></div>
          </div>
          <div className="space-y-1.5"><Label>Tanúk</Label><Input value={tanuk} onChange={e => setTanuk(e.target.value)} placeholder="Tanúk neve" /></div>
          <div className="flex gap-2 pt-4 border-t border-zinc-100">
            <Button variant="outline" className="flex-1 rounded-xl bg-zinc-50 hover:bg-zinc-100 text-zinc-600" onClick={() => onOpenChange(false)}>Mégse</Button>
            <Button className="bg-orange-600 hover:bg-orange-700" onClick={handleSubmit} disabled={loading}>{loading ? 'Mentés...' : 'Mentés'}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
