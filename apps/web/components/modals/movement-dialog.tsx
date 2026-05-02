'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { saveMovement, getNextEgyhaziSzam, type EgyhaziProfileKey } from '@/app/(dashboard)/anyakonyv/actions'
import { listCongregationsTree, type DioceseTreeNode, type CongregationOption } from '@/lib/notifications/congregations-tree-action'
import { MemberSearchSelect, type MemberSearchResult } from '@/components/registry/member-search-select'
import { CongregationSearchSelect } from '@/components/notifications/congregation-search-select'
import type { MovementType } from '@/lib/constants/registry'
import { toast } from 'sonner'

const MOVEMENT_LABELS: Record<MovementType, string> = {
  bekoltozott: 'Beköltözés rögzítése',
  elkoltozott: 'Elköltözés rögzítése',
  attert: 'Áttérés rögzítése',
  kitert: 'Kitérés rögzítése',
}

const PROFILE_KEY: Record<MovementType, EgyhaziProfileKey> = {
  bekoltozott: 'movement_bekoltozott',
  elkoltozott: 'movement_elkoltozott',
  attert: 'movement_attert',
  kitert: 'movement_kitert',
}

interface MovementDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  movementType: MovementType
  editEntry?: {
    id: number
    datum?: string
    mikor?: string
    egyhazi_szam?: string
    megjegyzes?: string
    felekezet?: string
    igazolas?: string
    kulfoldre?: boolean
    hova_congregation_id?: string | null
    szemely?: { id: number; csaladnev: string; k_nev: string; ferfi: boolean | null; sz_datum: string | null } | null
    [key: string]: unknown
  } | null
}

export function MovementDialog({ open, onOpenChange, movementType, editEntry }: MovementDialogProps) {
  const [loading, setLoading] = useState(false)
  const [person, setPerson] = useState<MemberSearchResult | null>(null)
  const [datum, setDatum] = useState('')
  const [egyhaziSzam, setEgyhaziSzam] = useState('')
  const [hely, setHely] = useState('')
  const [felekezet, setFelekezet] = useState('')
  const [igazolas, setIgazolas] = useState('')
  const [kulfoldre, setKulfoldre] = useState(false)
  const [hovaCongregationId, setHovaCongregationId] = useState<string | null>(null)
  const [megj, setMegj] = useState('')

  // Célgyülekezet-fa az elköltözéshez
  const [tree, setTree] = useState<DioceseTreeNode[]>([])
  const [unassigned, setUnassigned] = useState<CongregationOption[]>([])

  useEffect(() => {
    if (!open) return
    if (movementType !== 'elkoltozott') return
    let cancelled = false
    listCongregationsTree().then(res => {
      if (cancelled) return
      if (res.error) {
        toast.error(`Célgyülekezet-lista hiba: ${res.error}`)
        return
      }
      setTree(res.data || [])
      setUnassigned(res.unassigned || [])
    })
    return () => { cancelled = true }
  }, [open, movementType])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      if (editEntry) {
        setPerson(editEntry.szemely
          ? { ...editEntry.szemely, cnp: null, c_szam: null }
          : null)
        setDatum(((editEntry.datum || editEntry.mikor) as string)?.split('T')[0] || '')
        setEgyhaziSzam((editEntry.egyhazi_szam as string) || '')
        setFelekezet((editEntry.felekezet as string) || '')
        setIgazolas((editEntry.igazolas as string) || '')
        setKulfoldre(!!editEntry.kulfoldre)
        setHovaCongregationId((editEntry.hova_congregation_id as string | null) || null)
        setMegj((editEntry.megjegyzes as string) || '')
        setHely('')
        return
      }
      setPerson(null)
      setDatum(new Date().toISOString().slice(0, 10))
      setHely(''); setFelekezet(''); setIgazolas(''); setKulfoldre(false); setHovaCongregationId(null); setMegj('')
      // Auto-fill egyházi anyakönyvi szám
      getNextEgyhaziSzam(PROFILE_KEY[movementType], new Date().getFullYear()).then(v => {
        if (!cancelled) setEgyhaziSzam(v)
      })
    })
    return () => { cancelled = true }
  }, [open, editEntry, movementType])

  async function handleSubmit() {
    if (!person) { toast.error('Válasszon személyt!'); return }
    if (!datum) { toast.error('A dátum kötelező!'); return }
    setLoading(true)
    const result = await saveMovement({
      id: editEntry?.id,
      tipus: movementType,
      id_szemely: person.id,
      datum,
      egyhazi_szam: egyhaziSzam || null,
      helyid: null,
      felekezet: felekezet || null,
      igazolas: igazolas || null,
      kulfoldre,
      hova_congregation_id: movementType === 'elkoltozott' ? hovaCongregationId : null,
      megjegyzes: megj || null,
    })
    if (result.error) toast.error(result.error)
    else { toast.success('Bejegyzés rögzítve!'); onOpenChange(false) }
    setLoading(false)
  }

  if (!['bekoltozott', 'elkoltozott', 'attert', 'kitert'].includes(movementType)) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{editEntry ? MOVEMENT_LABELS[movementType].replace('rögzítése', 'szerkesztése') : MOVEMENT_LABELS[movementType]}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Személy *</Label>
            <MemberSearchSelect value={person} onChange={setPerson} placeholder="Keresés (családnév, keresztnév)…" />
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

          {/* Típusfüggő mezők */}
          {movementType === 'bekoltozott' && (
            <>
              <div className="space-y-1.5"><Label>Honnan (település)</Label><Input value={hely} onChange={e => setHely(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Igazolás száma</Label><Input value={igazolas} onChange={e => setIgazolas(e.target.value)} placeholder="opcionális" /></div>
            </>
          )}
          {movementType === 'elkoltozott' && (
            <>
              <div className="space-y-1.5">
                <Label>Hová — Célgyülekezet</Label>
                <CongregationSearchSelect
                  value={hovaCongregationId}
                  onChange={setHovaCongregationId}
                  tree={tree}
                  unassigned={unassigned}
                  placeholder="Külföldre / ismeretlen"
                  tone="slate"
                />
                <p className="text-[11px] text-slate-500">
                  Ha kiválasztasz egy célgyülekezetet, automatikusan átjelentkezési értesítést kap az új gyülekezet lelkésze.
                </p>
              </div>
              <div className="space-y-1.5"><Label>Hová (település, ha külföldre vagy ismeretlen)</Label><Input value={hely} onChange={e => setHely(e.target.value)} /></div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={kulfoldre} onChange={e => setKulfoldre(e.target.checked)} /> Külföldre költözött
              </label>
            </>
          )}
          {(movementType === 'attert' || movementType === 'kitert') && (
            <>
              <div className="space-y-1.5">
                <Label>{movementType === 'attert' ? 'Korábbi felekezet' : 'Új felekezet'}</Label>
                <Input value={felekezet} onChange={e => setFelekezet(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>{movementType === 'attert' ? 'Honnan (település)' : 'Hová (település)'}</Label>
                <Input value={hely} onChange={e => setHely(e.target.value)} />
              </div>
              {movementType === 'attert' && (
                <div className="space-y-1.5"><Label>Igazolás száma</Label><Input value={igazolas} onChange={e => setIgazolas(e.target.value)} placeholder="opcionális" /></div>
              )}
            </>
          )}

          <div className="space-y-1.5"><Label>Megjegyzés</Label><Input value={megj} onChange={e => setMegj(e.target.value)} /></div>
          <p className="text-xs text-amber-600 bg-amber-50 p-2 rounded">A tagmozgás rögzítése a tag státuszát is állítja (elköltözött / kitért). A státusz visszaállításához használja a Tagnyilvántartás modult.</p>
          <div className="flex gap-2 pt-4 border-t border-zinc-100">
            <Button variant="outline" className="flex-1 rounded-xl bg-zinc-50 hover:bg-zinc-100 text-zinc-600" onClick={() => onOpenChange(false)}>Mégse</Button>
            <Button onClick={handleSubmit} disabled={loading}>{loading ? 'Mentés...' : 'Mentés'}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
