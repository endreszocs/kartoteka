'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { saveMarriage, getNextEgyhaziSzam } from '@/app/(dashboard)/anyakonyv/actions'
import { MemberSearchSelect, type MemberSearchResult } from '@/components/registry/member-search-select'
import { toast } from 'sonner'

interface MarriageDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editEntry?: {
    id: number
    datum?: string
    hlevel?: string
    egyhazi_szam?: string
    lelkeszneve?: string
    tanuk?: string
    vegyes?: boolean
    megjegyzes?: string
    ferfi?: { id: number; csaladnev: string; k_nev: string } | null
    no?: { id: number; csaladnev: string; k_nev: string } | null
    [key: string]: unknown
  } | null
}

export function MarriageDialog({ open, onOpenChange, editEntry }: MarriageDialogProps) {
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

  useEffect(() => {
    if (!open) return
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      if (editEntry) {
        setGroom(editEntry.ferfi
          ? { id: editEntry.ferfi.id, csaladnev: editEntry.ferfi.csaladnev, k_nev: editEntry.ferfi.k_nev, ferfi: true, sz_datum: null, cnp: null, c_szam: null }
          : null)
        setBride(editEntry.no
          ? { id: editEntry.no.id, csaladnev: editEntry.no.csaladnev, k_nev: editEntry.no.k_nev, ferfi: false, sz_datum: null, cnp: null, c_szam: null }
          : null)
        setDatum((editEntry.datum as string)?.split('T')[0] || '')
        setEgyhaziSzam((editEntry.egyhazi_szam as string) || '')
        setHlevel((editEntry.hlevel as string) || '')
        setLelkesz((editEntry.lelkeszneve as string) || '')
        setTanuk((editEntry.tanuk as string) || '')
        setVegyes(!!editEntry.vegyes)
        setMegj((editEntry.megjegyzes as string) || '')
        return
      }
      setGroom(null); setBride(null)
      setDatum(new Date().toISOString().slice(0, 10))
      setHlevel(''); setLelkesz(''); setTanuk(''); setVegyes(false); setMegj('')
      // Auto-fill egyházi anyakönyvi szám
      getNextEgyhaziSzam('marriage', new Date().getFullYear()).then(v => {
        if (!cancelled) setEgyhaziSzam(v)
      })
    })
    return () => { cancelled = true }
  }, [open, editEntry])

  async function handleSubmit() {
    if (!groom || !bride) { toast.error('Mindkét fél kötelező!'); return }
    if (!datum) { toast.error('A dátum kötelező!'); return }
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
    })
    if (result.error) toast.error(result.error)
    else { toast.success('Házasság rögzítve!'); onOpenChange(false) }
    setLoading(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{editEntry ? 'Házasságkötés szerkesztése' : 'Házasságkötés rögzítése'}</DialogTitle></DialogHeader>
        <div className="space-y-3">
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
              <Input value={egyhaziSzam} onChange={e => setEgyhaziSzam(e.target.value)} className="font-mono text-violet-700" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Állami házassági levél</Label>
              <Input value={hlevel} onChange={e => setHlevel(e.target.value)} placeholder="opcionális" />
            </div>
            <div className="space-y-1.5">
              <Label>Dátum *</Label>
              <Input type="date" value={datum} onChange={e => setDatum(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Lelkész</Label><Input value={lelkesz} onChange={e => setLelkesz(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Tanúk</Label><Input value={tanuk} onChange={e => setTanuk(e.target.value)} placeholder="Tanúk neve" /></div>
          </div>
          <div className="space-y-1.5"><Label>Megjegyzés</Label><Input value={megj} onChange={e => setMegj(e.target.value)} /></div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={vegyes} onChange={e => setVegyes(e.target.checked)} />
            Vegyes házasság (egyik fél nem református)
          </label>

          <div className="flex gap-2 pt-4 border-t border-zinc-100">
            <Button variant="outline" className="flex-1 rounded-xl bg-zinc-50 hover:bg-zinc-100 text-zinc-600" onClick={() => onOpenChange(false)}>Mégse</Button>
            <Button className="bg-orange-600 hover:bg-orange-700" onClick={handleSubmit} disabled={loading}>{loading ? 'Mentés...' : 'Mentés'}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
