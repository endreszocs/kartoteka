'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { savePresbyter, getDistricts, type DistrictRow, type PresbiterRow } from '@/app/(dashboard)/tagnyilvantartas/presbyter-actions'
import { searchParent } from '@/app/(dashboard)/tagnyilvantartas/actions'
import { toast } from 'sonner'

interface PresbiterFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editSzemelId: number | null
  presbiters: PresbiterRow[]
}

export function PresbiterFormDialog({ open, onOpenChange, editSzemelId, presbiters }: PresbiterFormDialogProps) {
  const [loading, setLoading] = useState(false)
  const [districts, setDistricts] = useState<DistrictRow[]>([])
  const [szemelId, setSzemelId] = useState<number | null>(null)
  const [szemelName, setSzemelName] = useState('')
  const [tisztseg, setTisztseg] = useState('Presbiter')
  const [korzetId, setKorzetId] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<{ id: number; csaladnev: string; k_nev: string; sz_datum: string | null; adrlocality: { name: string } | null; adrstreet: { name: string } | null; c_szam: string | null }[]>([])
  const [showResults, setShowResults] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      getDistricts().then(data => {
        if (!cancelled) setDistricts(data)
      })
      if (editSzemelId) {
        const existing = presbiters.filter(p => p.szemely?.id === editSzemelId)
        if (existing.length > 0) {
          const s = existing[0].szemely!
          setSzemelId(s.id)
          setSzemelName(`${s.csaladnev} ${s.k_nev}`)
          setTisztseg(existing[0].tisztseg || 'Presbiter')
          setKorzetId(existing[0].id_csoport?.toString() || '')
        }
      } else {
        setSzemelId(null)
        setSzemelName('')
        setTisztseg('Presbiter')
        setKorzetId('')
      }
      setSearchQuery('')
      setSearchResults([])
      setShowResults(false)
    })
    return () => {
      cancelled = true
    }
  }, [open, editSzemelId, presbiters])

  async function handleSearch(val: string) {
    setSearchQuery(val)
    if (val.length < 3) { setShowResults(false); return }
    const results = await searchParent(val, true) // keresés mindkét nemben (true = férfi, de itt mindkettőre keresünk)
    setSearchResults(results as unknown as typeof searchResults)
    setShowResults(true)
  }

  async function handleSubmit() {
    if (!szemelId) { toast.error('Kérem, válasszon egyháztagot!'); return }
    setLoading(true)
    const result = await savePresbyter({
      id_szemely: szemelId,
      tisztseg,
      id_csoport: korzetId ? parseInt(korzetId) : null,
    })
    if (result.error) toast.error(result.error)
    else { toast.success('Presbiter mentve!'); onOpenChange(false) }
    setLoading(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Presbiter felvétele / szerkesztése</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5 relative">
            <Label>Személy *</Label>
            {szemelId ? (
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{szemelName}</span>
                <Button variant="ghost" size="sm" className="h-6 text-xs text-red-500" onClick={() => { setSzemelId(null); setSzemelName('') }}>✕</Button>
              </div>
            ) : (
              <Input placeholder="Keresés név alapján (3+ karakter)..." value={searchQuery} onChange={e => handleSearch(e.target.value)} />
            )}
            {showResults && searchResults.length > 0 && (
              <div className="absolute z-10 top-full left-0 right-0 bg-white border rounded-lg shadow-lg mt-1 max-h-40 overflow-y-auto">
                {searchResults.map(r => (
                  <div key={r.id} className="p-2 hover:bg-slate-50 cursor-pointer text-sm border-b last:border-0"
                    onClick={() => { setSzemelId(r.id); setSzemelName(`${r.csaladnev} ${r.k_nev}`); setShowResults(false); setSearchQuery('') }}>
                    <div className="font-medium">{r.csaladnev} {r.k_nev}</div>
                    <div className="text-xs text-muted-foreground">{r.adrlocality?.name || ''}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Tisztség</Label>
            <Input value={tisztseg} onChange={e => setTisztseg(e.target.value)} placeholder="Presbiter" />
          </div>

          <div className="space-y-1.5">
            <Label>Körzet</Label>
            <select value={korzetId} onChange={e => setKorzetId(e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="">— Nincs körzet —</option>
              {districts.map(d => <option key={d.id} value={d.id}>{d.nev}</option>)}
            </select>
          </div>

          <div className="flex gap-2 pt-4 border-t border-zinc-100">
            <Button variant="outline" className="flex-1 rounded-xl bg-zinc-50 hover:bg-zinc-100 text-zinc-600" onClick={() => onOpenChange(false)}>Mégse</Button>
            <Button onClick={handleSubmit} disabled={loading}>{loading ? 'Mentés...' : 'Mentés'}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
