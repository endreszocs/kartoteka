'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { saveMovement, searchMemberForRegistry } from '@/app/(dashboard)/anyakonyv/actions'
import type { MovementType } from '@/lib/constants/registry'
import { toast } from 'sonner'

const MOVEMENT_LABELS: Record<MovementType, string> = {
  bekoltozott: 'Beköltözés rögzítése', elkoltozott: 'Elköltözés rögzítése',
  attert: 'Áttérés rögzítése', kitert: 'Kitérés rögzítése',
}

interface MovementDialogProps { open: boolean; onOpenChange: (open: boolean) => void; movementType: MovementType; editEntry?: { id: number; datum?: string; mikor?: string; megjegyzes?: string; felekezet?: string; igazolas?: string; kulfoldre?: boolean; szemely?: { id: number; csaladnev: string; k_nev: string } | null; [key: string]: unknown } | null }

export function MovementDialog({ open, onOpenChange, movementType, editEntry }: MovementDialogProps) {
  const [loading, setLoading] = useState(false)
  const [personId, setPersonId] = useState<number | null>(null)
  const [personName, setPersonName] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<{ id: number; csaladnev: string; k_nev: string }[]>([])
  const [showResults, setShowResults] = useState(false)
  const [datum, setDatum] = useState('')
  const [hely, setHely] = useState('')
  const [felekezet, setFelekezet] = useState('')
  const [igazolas, setIgazolas] = useState('')
  const [kulfoldre, setKulfoldre] = useState(false)
  const [megj, setMegj] = useState('')

  useEffect(() => {
    if (!open) return
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      if (editEntry) {
        setPersonId(editEntry.szemely?.id || null); setPersonName(editEntry.szemely ? `${editEntry.szemely.csaladnev} ${editEntry.szemely.k_nev}` : '')
        setSearchQuery(editEntry.szemely ? `${editEntry.szemely.csaladnev} ${editEntry.szemely.k_nev}` : '')
        setDatum(((editEntry.datum || editEntry.mikor) as string)?.split('T')[0] || ''); setFelekezet((editEntry.felekezet as string) || '')
        setIgazolas((editEntry.igazolas as string) || ''); setKulfoldre(!!editEntry.kulfoldre); setMegj((editEntry.megjegyzes as string) || ''); setHely('')
        return
      }
      setPersonId(null); setPersonName(''); setSearchQuery(''); setDatum(new Date().toISOString().slice(0, 10)); setHely(''); setFelekezet(''); setIgazolas(''); setKulfoldre(false); setMegj('')
    })
    return () => {
      cancelled = true
    }
  }, [open, editEntry])

  async function handleSearch(val: string) { setSearchQuery(val); if (val.length < 2) { setShowResults(false); return }; const r = await searchMemberForRegistry(val); setSearchResults(r as unknown as typeof searchResults); setShowResults(true) }

  async function handleSubmit() {
    if (!personId) { toast.error('Válasszon személyt!'); return }
    if (!datum) { toast.error('A dátum kötelező!'); return }
    setLoading(true)
    const result = await saveMovement({ id: editEntry?.id, tipus: movementType, id_szemely: personId, datum, helyid: null, felekezet: felekezet || null, igazolas: igazolas || null, kulfoldre, megjegyzes: megj || null })
    if (result.error) toast.error(result.error)
    else { toast.success('Bejegyzés rögzítve!'); onOpenChange(false) }
    setLoading(false)
  }

  // Ha nem tagmozgás típusú fül aktív, ne rendereljünk
  if (!['bekoltozott', 'elkoltozott', 'attert', 'kitert'].includes(movementType)) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{MOVEMENT_LABELS[movementType]}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5 relative">
            <Label>Személy *</Label>
            <Input value={searchQuery} onChange={e => handleSearch(e.target.value)} placeholder="Keresés..." />
            {personId && <Badge variant="secondary" className="mt-1 text-xs bg-green-100 text-green-700">{personName}</Badge>}
            {showResults && searchResults.length > 0 && <div className="absolute z-10 top-full left-0 right-0 bg-white border rounded-lg shadow-lg mt-1 max-h-40 overflow-y-auto">{searchResults.map(r => <div key={r.id} className="p-2 hover:bg-slate-50 cursor-pointer text-sm border-b" onClick={() => { setPersonId(r.id); setPersonName(`${r.csaladnev} ${r.k_nev}`); setSearchQuery(`${r.csaladnev} ${r.k_nev}`); setShowResults(false) }}>{r.csaladnev} {r.k_nev}</div>)}</div>}
          </div>
          <div className="space-y-1.5"><Label>Dátum *</Label><Input type="date" value={datum} onChange={e => setDatum(e.target.value)} /></div>

          {/* Típusfüggő mezők */}
          {movementType === 'bekoltozott' && (
            <><div className="space-y-1.5"><Label>Honnan (település)</Label><Input value={hely} onChange={e => setHely(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Igazolás száma</Label><Input value={igazolas} onChange={e => setIgazolas(e.target.value)} /></div></>
          )}
          {movementType === 'elkoltozott' && (
            <><div className="space-y-1.5"><Label>Hová (település)</Label><Input value={hely} onChange={e => setHely(e.target.value)} /></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={kulfoldre} onChange={e => setKulfoldre(e.target.checked)} /> Külföldre költözött</label></>
          )}
          {(movementType === 'attert' || movementType === 'kitert') && (
            <><div className="space-y-1.5"><Label>{movementType === 'attert' ? 'Korábbi felekezet' : 'Új felekezet'}</Label><Input value={felekezet} onChange={e => setFelekezet(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>{movementType === 'attert' ? 'Honnan' : 'Hová'}</Label><Input value={hely} onChange={e => setHely(e.target.value)} /></div></>
          )}

          <div className="space-y-1.5"><Label>Megjegyzés</Label><Input value={megj} onChange={e => setMegj(e.target.value)} /></div>
          <p className="text-xs text-amber-600 bg-amber-50 p-2 rounded">A tagmozgás rögzítése NEM módosítja a tag státuszát. A státusz változtatáshoz használja a Tagnyilvántartás modult.</p>
          <div className="flex gap-2 pt-4 border-t border-zinc-100">
            <Button variant="outline" className="flex-1 rounded-xl bg-zinc-50 hover:bg-zinc-100 text-zinc-600" onClick={() => onOpenChange(false)}>Mégse</Button>
            <Button onClick={handleSubmit} disabled={loading}>{loading ? 'Mentés...' : 'Mentés'}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
