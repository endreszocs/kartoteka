'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { saveConfirmationBatch, searchMemberForRegistry } from '@/app/(dashboard)/anyakonyv/actions'
import { toast } from 'sonner'

interface Candidate { id: number; name: string; ferfi: boolean; szDatum: string }

interface ConfirmationDialogProps { open: boolean; onOpenChange: (open: boolean) => void }

export function ConfirmationDialog({ open, onOpenChange }: ConfirmationDialogProps) {
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [datum, setDatum] = useState('')
  const [lelkesz, setLelkesz] = useState('')
  const [megj, setMegj] = useState('')
  const [munkanaploba, setMunkanaploba] = useState(false)
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<{ id: number; csaladnev: string; k_nev: string; ferfi: boolean; sz_datum: string | null }[]>([])
  const [showResults, setShowResults] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      setCandidates([]); setDatum(new Date().toISOString().slice(0, 10)); setLelkesz(''); setMegj(''); setMunkanaploba(false); setSearchQuery('')
    })
    return () => {
      cancelled = true
    }
  }, [open])

  async function handleSearch(val: string) {
    setSearchQuery(val)
    if (val.length < 2) { setShowResults(false); return }
    const results = await searchMemberForRegistry(val)
    setSearchResults(results as unknown as typeof searchResults)
    setShowResults(true)
  }

  function addCandidate(r: typeof searchResults[0]) {
    if (candidates.find(c => c.id === r.id)) { toast.error('Már hozzáadva!'); return }
    setCandidates(prev => [...prev, { id: r.id, name: `${r.csaladnev} ${r.k_nev}`, ferfi: r.ferfi, szDatum: r.sz_datum || '—' }])
    setSearchQuery(''); setShowResults(false)
  }

  function removeCandidate(id: number) { setCandidates(prev => prev.filter(c => c.id !== id)) }

  async function handleSubmit() {
    if (candidates.length === 0) { toast.error('Minimum 1 konfirmandus szükséges!'); return }
    if (!datum) { toast.error('A dátum kötelező!'); return }
    setLoading(true)
    const result = await saveConfirmationBatch({ datum, lelkeszneve: lelkesz || null, megjegyzes: megj || null, munkanaploba, candidates: candidates.map(c => c.id) })
    if (result.error) toast.error(result.error)
    else { toast.success(`${result.count} konfirmáció rögzítve!`); onOpenChange(false) }
    setLoading(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Konfirmandusok rögzítése</DialogTitle></DialogHeader>
        <div className="space-y-4">
          {/* Keresés */}
          <div className="space-y-1.5 relative">
            <Label>Konfirmandus hozzáadása</Label>
            <Input value={searchQuery} onChange={e => handleSearch(e.target.value)} placeholder="Keresés név alapján (2+ karakter)..." />
            {showResults && searchResults.length > 0 && (
              <div className="absolute z-10 top-full left-0 right-0 bg-white border rounded-lg shadow-lg mt-1 max-h-40 overflow-y-auto">
                {searchResults.map(r => <div key={r.id} className="p-2 hover:bg-slate-50 cursor-pointer text-sm border-b last:border-0" onClick={() => addCandidate(r)}><div className="font-medium">{r.ferfi ? '♂' : '♀'} {r.csaladnev} {r.k_nev}</div><div className="text-xs text-muted-foreground">{r.sz_datum || '?'}</div></div>)}
              </div>
            )}
          </div>

          {/* Lista */}
          {candidates.length > 0 && (
            <div className="border rounded-lg overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b"><tr><th className="p-2 text-left w-8">#</th><th className="p-2 text-left">Név</th><th className="p-2 text-left">Nem</th><th className="p-2 text-left">Szül.dátum</th><th className="p-2 w-8"></th></tr></thead>
                <tbody>
                  {candidates.map((c, i) => (
                    <tr key={c.id} className="border-b"><td className="p-2 text-muted-foreground">{i + 1}</td><td className="p-2 font-medium">{c.name}</td><td className="p-2">{c.ferfi ? '♂' : '♀'}</td><td className="p-2 text-muted-foreground text-xs">{c.szDatum}</td>
                      <td className="p-2"><Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-400" onClick={() => removeCandidate(c.id)}>✕</Button></td></tr>
                  ))}
                </tbody>
              </table>
              <div className="p-2 flex justify-between items-center bg-slate-50"><Badge variant="secondary">{candidates.length} fő</Badge><Button variant="ghost" size="sm" className="text-xs text-red-500" onClick={() => setCandidates([])}>Mindent töröl</Button></div>
            </div>
          )}

          {/* Közös mezők */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Dátum *</Label><Input type="date" value={datum} onChange={e => setDatum(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Lelkész</Label><Input value={lelkesz} onChange={e => setLelkesz(e.target.value)} /></div>
          </div>
          <div className="space-y-1.5"><Label>Megjegyzés</Label><Input value={megj} onChange={e => setMegj(e.target.value)} /></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={munkanaploba} onChange={e => setMunkanaploba(e.target.checked)} /> Rögzítés a munkanaplóba</label>

          <div className="flex gap-2 pt-4 border-t border-zinc-100">
            <Button variant="outline" className="flex-1 rounded-xl bg-zinc-50 hover:bg-zinc-100 text-zinc-600" onClick={() => onOpenChange(false)}>Mégse</Button>
            <Button className="bg-purple-600 hover:bg-purple-700" onClick={handleSubmit} disabled={loading || candidates.length === 0}>{loading ? 'Mentés...' : `Mentés (${candidates.length} fő)`}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
