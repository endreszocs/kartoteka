'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { saveBurial, searchMemberForRegistry } from '@/app/(dashboard)/anyakonyv/actions'
import { toast } from 'sonner'

interface BurialDialogProps { open: boolean; onOpenChange: (open: boolean) => void; editEntry?: { id: number; hdatum?: string; tdatum?: string; hoka?: string; lelkeszneve?: string; megjegyzes?: string; szemely?: { id: number; csaladnev: string; k_nev: string } | null; [key: string]: unknown } | null }

export function BurialDialog({ open, onOpenChange, editEntry }: BurialDialogProps) {
  const [loading, setLoading] = useState(false)
  const [personId, setPersonId] = useState<number | null>(null)
  const [personName, setPersonName] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<{ id: number; csaladnev: string; k_nev: string }[]>([])
  const [showResults, setShowResults] = useState(false)
  const [hdatum, setHdatum] = useState('')
  const [tdatum, setTdatum] = useState('')
  const [hoka, setHoka] = useState('')
  const [lelkesz, setLelkesz] = useState('')
  const [megj, setMegj] = useState('')
  const [munkanaploba, setMunkanaploba] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false

    queueMicrotask(() => {
      if (cancelled) return
      if (editEntry) {
        setPersonId(editEntry.szemely?.id || null); setPersonName(editEntry.szemely ? `${editEntry.szemely.csaladnev} ${editEntry.szemely.k_nev}` : '')
        setSearchQuery(editEntry.szemely ? `${editEntry.szemely.csaladnev} ${editEntry.szemely.k_nev}` : '')
        setHdatum((editEntry.hdatum as string)?.split('T')[0] || ''); setTdatum((editEntry.tdatum as string)?.split('T')[0] || '')
        setHoka((editEntry.hoka as string) || ''); setLelkesz((editEntry.lelkeszneve as string) || ''); setMegj((editEntry.megjegyzes as string) || ''); setMunkanaploba(false)
        return
      }
      setPersonId(null); setPersonName(''); setSearchQuery(''); setHdatum(''); setTdatum(''); setHoka(''); setLelkesz(''); setMegj(''); setMunkanaploba(false)
    })

    return () => {
      cancelled = true
    }
  }, [open, editEntry])

  async function handleSearch(val: string) { setSearchQuery(val); if (val.length < 2) { setShowResults(false); return }; const r = await searchMemberForRegistry(val); setSearchResults(r as unknown as typeof searchResults); setShowResults(true) }

  async function handleSubmit() {
    if (!personId) { toast.error('Válasszon személyt!'); return }
    if (!hdatum || !tdatum) { toast.error('A halál és temetés dátuma kötelező!'); return }
    setLoading(true)
    const result = await saveBurial({ id: editEntry?.id, id_szemely: personId, hdatum, tdatum, hoka: hoka || null, lelkeszneve: lelkesz || null, munkanaploba, megjegyzes: megj || null })
    if (result.error) toast.error(result.error)
    else { toast.success('Temetés rögzítve!'); onOpenChange(false) }
    setLoading(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Haláleset rögzítése</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5 relative">
            <Label>Személy *</Label>
            <Input value={searchQuery} onChange={e => handleSearch(e.target.value)} placeholder="Keresés..." />
            {personId && <Badge variant="secondary" className="mt-1 text-xs bg-green-100 text-green-700">{personName}</Badge>}
            {showResults && searchResults.length > 0 && <div className="absolute z-10 top-full left-0 right-0 bg-white border rounded-lg shadow-lg mt-1 max-h-40 overflow-y-auto">{searchResults.map(r => <div key={r.id} className="p-2 hover:bg-slate-50 cursor-pointer text-sm border-b" onClick={() => { setPersonId(r.id); setPersonName(`${r.csaladnev} ${r.k_nev}`); setSearchQuery(`${r.csaladnev} ${r.k_nev}`); setShowResults(false) }}>{r.csaladnev} {r.k_nev}</div>)}</div>}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Halál dátuma *</Label><Input type="date" value={hdatum} onChange={e => setHdatum(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Temetés dátuma *</Label><Input type="date" value={tdatum} onChange={e => setTdatum(e.target.value)} /></div>
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
