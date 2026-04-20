'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { saveBaptism, getNextOkiratNumber, searchMemberForRegistry } from '@/app/(dashboard)/anyakonyv/actions'
import { toast } from 'sonner'

interface BaptismDialogProps { open: boolean; onOpenChange: (open: boolean) => void; congregationName: string; editEntry?: { id: number; datum?: string; okirat?: string; lelkeszneve?: string; megjegyzes?: string; szemely?: { id: number; csaladnev: string; k_nev: string } | null; [key: string]: unknown } | null }

export function BaptismDialog({ open, onOpenChange, editEntry }: BaptismDialogProps) {
  const [loading, setLoading] = useState(false)
  const [personId, setPersonId] = useState<number | null>(null)
  const [personName, setPersonName] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<{ id: number; csaladnev: string; k_nev: string; sz_datum: string | null }[]>([])
  const [showResults, setShowResults] = useState(false)

  // Szülők
  const [fatherName, setFatherName] = useState('')
  const [fatherCnp, setFatherCnp] = useState('')
  const [motherName, setMotherName] = useState('')
  const [motherCnp, setMotherCnp] = useState('')

  // Mezők
  const [datum, setDatum] = useState('')
  const [okirat, setOkirat] = useState('')
  const [lelkesz, setLelkesz] = useState('')
  const [keresztszulok, setKeresztszulok] = useState('')
  const [alapige, setAlapige] = useState('')
  const [megjegyzes, setMegjegyzes] = useState('')
  const [munkanaploba, setMunkanaploba] = useState(false)
  const [apavallas, setApavallas] = useState('')
  const [anyavallas, setAnyavallas] = useState('')
  const [anyaLeanykori, setAnyaLeanykori] = useState('')

  useEffect(() => {
    if (!open) return
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
    if (editEntry) {
      // Szerkesztés mód: előtöltés
      setPersonId(editEntry.szemely?.id || null)
      setPersonName(editEntry.szemely ? `${editEntry.szemely.csaladnev} ${editEntry.szemely.k_nev}` : '')
      setSearchQuery(editEntry.szemely ? `${editEntry.szemely.csaladnev} ${editEntry.szemely.k_nev}` : '')
      setDatum((editEntry.datum as string)?.split('T')[0] || '')
      setOkirat((editEntry.okirat as string) || '')
      setLelkesz((editEntry.lelkeszneve as string) || '')
      setKeresztszulok((editEntry.keresztszulok as string) || '')
      setAlapige((editEntry.alapige as string) || '')
      // Sablon JSON szétbontás
      const megj = (editEntry.megjegyzes as string) || ''
      const sablonIdx = megj.indexOf('|sablon:')
      if (sablonIdx > -1) { setMegjegyzes(megj.slice(0, sablonIdx)); try { const s = JSON.parse(megj.slice(sablonIdx + 8)); setApavallas(s.apa_vallas || ''); setAnyavallas(s.anya_vallas || ''); setAnyaLeanykori(s.anya_leanyneve || '') } catch { setApavallas(''); setAnyavallas(''); setAnyaLeanykori('') } }
      else { setMegjegyzes(megj); setApavallas(''); setAnyavallas(''); setAnyaLeanykori('') }
      setFatherName(''); setFatherCnp(''); setMotherName(''); setMotherCnp('')
      setMunkanaploba(false)
      return // Ne generáljunk okiratszámot szerkesztésnél
    }
    setPersonId(null); setPersonName(''); setSearchQuery('')
    setFatherName(''); setFatherCnp(''); setMotherName(''); setMotherCnp('')
    setDatum(new Date().toISOString().slice(0, 10)); setLelkesz(''); setKeresztszulok('')
    setAlapige(''); setMegjegyzes(''); setMunkanaploba(false)
    setApavallas(''); setAnyavallas(''); setAnyaLeanykori('')
    getNextOkiratNumber('keresztseg', new Date().getFullYear()).then(value => {
      if (!cancelled) setOkirat(value)
    })
    })
    return () => {
      cancelled = true
    }
  }, [open, editEntry])

  async function handleSearch(val: string) {
    setSearchQuery(val)
    if (val.length < 2) { setShowResults(false); return }
    const results = await searchMemberForRegistry(val)
    setSearchResults(results as unknown as typeof searchResults)
    setShowResults(true)
  }

  function selectPerson(r: typeof searchResults[0]) {
    setPersonId(r.id); setPersonName(`${r.csaladnev} ${r.k_nev}`); setSearchQuery(`${r.csaladnev} ${r.k_nev}`); setShowResults(false)
  }

  // Szülő keresők (egyszerűsített — reuse a searchMemberForRegistry-t)
  const [fatherSearch, setFatherSearch] = useState(''); const [fatherResults, setFatherResults] = useState<typeof searchResults>([]); const [showFather, setShowFather] = useState(false)
  const [motherSearch, setMotherSearch] = useState(''); const [motherResults, setMotherResults] = useState<typeof searchResults>([]); const [showMother, setShowMother] = useState(false)

  async function searchFather(val: string) { setFatherSearch(val); setFatherName(val); if (val.length < 2) { setShowFather(false); return }; const r = await searchMemberForRegistry(val, true); setFatherResults(r as unknown as typeof searchResults); setShowFather(true) }
  async function searchMother(val: string) { setMotherSearch(val); setMotherName(val); if (val.length < 2) { setShowMother(false); return }; const r = await searchMemberForRegistry(val, false); setMotherResults(r as unknown as typeof searchResults); setShowMother(true) }

  function selectFather(r: { id: number; csaladnev: string; k_nev: string; cnp?: string }) { setFatherName(`${r.csaladnev} ${r.k_nev}`); setFatherCnp((r as unknown as { cnp: string }).cnp || ''); setFatherSearch(`${r.csaladnev} ${r.k_nev}`); setShowFather(false) }
  function selectMother(r: { id: number; csaladnev: string; k_nev: string; cnp?: string }) { setMotherName(`${r.csaladnev} ${r.k_nev}`); setMotherCnp((r as unknown as { cnp: string }).cnp || ''); setMotherSearch(`${r.csaladnev} ${r.k_nev}`); setShowMother(false) }

  async function handleSubmit() {
    if (!personId) { toast.error('Válasszon személyt!'); return }
    if (!datum) { toast.error('A dátum kötelező!'); return }
    setLoading(true)
    const result = await saveBaptism({
      id: editEntry?.id,
      id_szemely: personId, datum, okirat, lelkeszneve: lelkesz || null, keresztszulok: keresztszulok || null,
      alapige: alapige || null, apjaneve: fatherName || null, anyjaneve: motherName || null,
      id_apja_cnp: fatherCnp || null, id_anyja_cnp: motherCnp || null,
      apa_vallas: apavallas || null, anya_vallas: anyavallas || null, anya_leanyneve: anyaLeanykori || null,
      munkanaploba, megjegyzes: megjegyzes || null,
    })
    if (result.error) toast.error(result.error)
    else { toast.success('Keresztelés rögzítve!'); onOpenChange(false) }
    setLoading(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{editEntry ? 'Keresztelés szerkesztése' : 'Keresztelés rögzítése'}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          {/* Személy */}
          <div className="space-y-1.5 relative">
            <Label>Személy *</Label>
            <Input value={searchQuery} onChange={e => handleSearch(e.target.value)} placeholder="Keresés (2+ karakter)..." />
            {personId && <Badge variant="secondary" className="mt-1 text-xs bg-green-100 text-green-700">{personName}</Badge>}
            {showResults && searchResults.length > 0 && (
              <div className="absolute z-10 top-full left-0 right-0 bg-white border rounded-lg shadow-lg mt-1 max-h-40 overflow-y-auto">
                {searchResults.map(r => <div key={r.id} className="p-2 hover:bg-slate-50 cursor-pointer text-sm border-b last:border-0" onClick={() => selectPerson(r)}><div className="font-medium">{r.csaladnev} {r.k_nev}</div><div className="text-xs text-muted-foreground">{r.sz_datum || '?'}</div></div>)}
              </div>
            )}
          </div>

          <Separator />
          <h4 className="text-sm font-semibold">Szülők</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5 relative">
              <Label>Édesapa</Label>
              <Input value={fatherSearch} onChange={e => searchFather(e.target.value)} placeholder="Keresés..." />
              {fatherCnp && <Badge variant="outline" className="text-[10px] mt-0.5">CNP ✅</Badge>}
              {showFather && fatherResults.length > 0 && (
                <div className="absolute z-10 top-full left-0 right-0 bg-white border rounded-lg shadow-lg mt-1 max-h-32 overflow-y-auto">
                  {fatherResults.map(r => <div key={r.id} className="p-2 hover:bg-slate-50 cursor-pointer text-xs border-b" onClick={() => selectFather(r as unknown as { id: number; csaladnev: string; k_nev: string; cnp: string })}>{r.csaladnev} {r.k_nev}</div>)}
                </div>
              )}
              <div className="space-y-1"><Label className="text-xs text-muted-foreground">Apa vallása</Label><Input value={apavallas} onChange={e => setApavallas(e.target.value)} className="h-7 text-xs" placeholder="Református" /></div>
            </div>
            <div className="space-y-1.5 relative">
              <Label>Édesanya</Label>
              <Input value={motherSearch} onChange={e => searchMother(e.target.value)} placeholder="Keresés..." />
              {motherCnp && <Badge variant="outline" className="text-[10px] mt-0.5">CNP ✅</Badge>}
              {showMother && motherResults.length > 0 && (
                <div className="absolute z-10 top-full left-0 right-0 bg-white border rounded-lg shadow-lg mt-1 max-h-32 overflow-y-auto">
                  {motherResults.map(r => <div key={r.id} className="p-2 hover:bg-slate-50 cursor-pointer text-xs border-b" onClick={() => selectMother(r as unknown as { id: number; csaladnev: string; k_nev: string; cnp: string })}>{r.csaladnev} {r.k_nev}</div>)}
                </div>
              )}
              <div className="space-y-1"><Label className="text-xs text-muted-foreground">Anya vallása</Label><Input value={anyavallas} onChange={e => setAnyavallas(e.target.value)} className="h-7 text-xs" placeholder="Református" /></div>
              <div className="space-y-1"><Label className="text-xs text-muted-foreground">Leánykori név</Label><Input value={anyaLeanykori} onChange={e => setAnyaLeanykori(e.target.value)} className="h-7 text-xs" /></div>
            </div>
          </div>

          <Separator />
          <h4 className="text-sm font-semibold">Részletek</h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5"><Label>Okiratszám *</Label><Input value={okirat} onChange={e => setOkirat(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Dátum *</Label><Input type="date" value={datum} onChange={e => setDatum(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Lelkész</Label><Input value={lelkesz} onChange={e => setLelkesz(e.target.value)} /></div>
          </div>
          <div className="space-y-1.5"><Label>Keresztszülők</Label><Input value={keresztszulok} onChange={e => setKeresztszulok(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Alapige</Label><Input value={alapige} onChange={e => setAlapige(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Megjegyzés</Label><Input value={megjegyzes} onChange={e => setMegjegyzes(e.target.value)} /></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={munkanaploba} onChange={e => setMunkanaploba(e.target.checked)} /> Rögzítés a munkanaplóba</label>

          <div className="flex gap-2 pt-4 border-t border-zinc-100">
            <Button variant="outline" className="flex-1 rounded-xl bg-zinc-50 hover:bg-zinc-100 text-zinc-600" onClick={() => onOpenChange(false)}>Mégse</Button>
            <Button className="bg-blue-600 hover:bg-blue-700" onClick={handleSubmit} disabled={loading}>{loading ? 'Mentés...' : 'Mentés'}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
