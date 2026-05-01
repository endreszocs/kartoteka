'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  getDistrictsWithCounts, saveDistrict, deleteDistrict,
  getDistrictFamilies, assignFamilyToDistrict, removeFamilyFromDistrict,
} from '@/app/(dashboard)/tagnyilvantartas/presbyter-actions'
import { toast } from 'sonner'
import { MapPin, Users, Edit2, Trash2, Plus, Check, X } from 'lucide-react'

interface DistrictWithCount { id: number; nev: string; isaktiv: boolean; familyCount: number }

export function DistrictsTab() {
  const [districts, setDistricts] = useState<DistrictWithCount[]>([])
  const [loading, setLoading] = useState(true)

  const [formOpen, setFormOpen] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [formNev, setFormNev] = useState('')
  const [formAktiv, setFormAktiv] = useState(true)
  const [saving, setSaving] = useState(false)

  const [familiesOpen, setFamiliesOpen] = useState(false)
  const [currentDistrictId, setCurrentDistrictId] = useState<number | null>(null)
  const [currentDistrictName, setCurrentDistrictName] = useState('')
  const [allFamilies, setAllFamilies] = useState<{ id: number; c_szam: string | null; id_csoport: number | null; ferfi: { csaladnev: string; k_nev: string } | null; no: { csaladnev: string; k_nev: string } | null; utca: { name: string } | null }[]>([])
  const [assignedIds, setAssignedIds] = useState<Set<number>>(new Set())

  const load = useCallback(async () => {
    const data = await getDistrictsWithCounts()
    setDistricts(data)
    setLoading(false)
  }, [])

  const refreshDistricts = useCallback(() => {
    setLoading(true)
    void load()
  }, [load])

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) {
        void load()
      }
    })
    return () => {
      cancelled = true
    }
  }, [load])

  function openForm(d?: DistrictWithCount) {
    setEditId(d?.id || null); setFormNev(d?.nev || ''); setFormAktiv(d?.isaktiv ?? true); setFormOpen(true)
  }

  async function handleSave() {
    setSaving(true)
    const result = await saveDistrict({ id: editId || undefined, nev: formNev, isaktiv: formAktiv })
    if (result.error) toast.error(result.error)
    else { toast.success(editId ? 'Körzet frissítve!' : 'Körzet létrehozva!'); setFormOpen(false); refreshDistricts() }
    setSaving(false)
  }

  async function handleDelete(id: number, nev: string) {
    if (!confirm(`Biztosan törli a(z) "${nev}" körzetet?`)) return
    const result = await deleteDistrict(id)
    if (result.error) toast.error(result.error)
    else { toast.success('Körzet törölve.'); refreshDistricts() }
  }

  async function openFamilies(id: number, nev: string) {
    setCurrentDistrictId(id); setCurrentDistrictName(nev); setFamiliesOpen(true)
    const data = await getDistrictFamilies(id)
    setAllFamilies(data.families); setAssignedIds(new Set(data.assignedIds))
  }

  async function handleAssign(familyId: number) {
    if (!currentDistrictId) return
    const result = await assignFamilyToDistrict(familyId, currentDistrictId)
    if (result.error) toast.error(result.error)
    else { setAssignedIds(prev => new Set([...prev, familyId])); refreshDistricts() }
  }

  async function handleRemove(familyId: number) {
    const result = await removeFamilyFromDistrict(familyId)
    if (result.error) toast.error(result.error)
    else { setAssignedIds(prev => { const s = new Set(prev); s.delete(familyId); return s }); refreshDistricts() }
  }

  return (
    <div className="space-y-4">
      {/* Fejléc */}
      <div className="card-raised flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
        <div className="flex items-center gap-3">
          <div className="icon-raised w-10 h-10 bg-gradient-to-br from-cyan-500 to-cyan-600">
            <MapPin className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-700">{districts.length} körzet</p>
            <p className="text-xs text-slate-400">Gyülekezeti körzetek és család-hozzárendelések</p>
          </div>
        </div>
        <Button size="sm" className="rounded-lg shadow-sm" onClick={() => openForm()}>+ Új körzet</Button>
      </div>

      <div className="card-raised px-4 py-3 text-xs leading-5 text-muted-foreground">
        A rendszer itt csak azokat a körzeteket mutatja, amelyek ehhez a gyülekezethez kapcsolódnak, vagy még sehol nincsenek használatban. Ez segít megelőzni, hogy más gyülekezet adatai véletlenül megjelenjenek vagy szerkeszthetővé váljanak.
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-slate-400 animate-pulse">Betöltés...</div>
      ) : districts.length === 0 ? (
        <div className="card-raised p-8 text-center">
          <MapPin className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">Még nincs körzet rögzítve.</p>
          <p className="text-xs text-slate-400 mt-1">Kattintson az &quot;+ Új körzet&quot; gombra a hozzáadáshoz.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {districts.map(d => (
            <div key={d.id} className="card-raised p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="icon-raised w-9 h-9 bg-gradient-to-br from-cyan-500 to-teal-600">
                    <MapPin className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-700">{d.nev}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                        <Users className="w-3 h-3" /> {d.familyCount} család
                      </span>
                      {d.isaktiv
                        ? <Badge className="text-[10px] bg-emerald-100 text-emerald-700 border-0">Aktív</Badge>
                        : <Badge className="text-[10px] bg-slate-100 text-slate-500 border-0">Inaktív</Badge>}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-1 mt-3 pt-3 border-t border-slate-100">
                <Button variant="ghost" size="sm" className="h-7 text-xs text-slate-500 gap-1" onClick={() => openForm(d)}>
                  <Edit2 className="w-3 h-3" /> Szerkesztés
                </Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs text-cyan-600 gap-1" onClick={() => openFamilies(d.id, d.nev)}>
                  <Users className="w-3 h-3" /> Családok
                </Button>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-slate-400 hover:text-red-500" onClick={() => handleDelete(d.id, d.nev)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Körzet form */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>{editId ? 'Körzet szerkesztése' : 'Új körzet'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Név *</Label><Input value={formNev} onChange={e => setFormNev(e.target.value)} placeholder="Körzet neve" className="rounded-lg" /></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={formAktiv} onChange={e => setFormAktiv(e.target.checked)} className="rounded" /> Aktív</label>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="ghost" onClick={() => setFormOpen(false)}>Mégse</Button>
              <Button onClick={handleSave} disabled={saving || !formNev.trim()}>{saving ? 'Mentés...' : 'Mentés'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Családok hozzárendelés */}
      <Dialog open={familiesOpen} onOpenChange={setFamiliesOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>&bdquo;{currentDistrictName}&rdquo; körzet — Családok</DialogTitle></DialogHeader>
          <div className="space-y-1 max-h-96 overflow-y-auto">
            {allFamilies.map(f => {
              const isAssigned = assignedIds.has(f.id)
              const ferfiNev = f.ferfi ? `${f.ferfi.csaladnev} ${f.ferfi.k_nev}` : '—'
              const noNev = f.no ? `${f.no.csaladnev} ${f.no.k_nev}` : ''
              return (
                <div key={f.id} className={`flex items-center justify-between p-2.5 rounded-lg text-sm transition-colors ${isAssigned ? 'bg-emerald-50' : 'hover:bg-slate-50'}`}>
                  <div className="min-w-0">
                    <div className="font-medium text-slate-700">{ferfiNev}</div>
                    {noNev && <div className="text-xs text-slate-400">{noNev}</div>}
                    <div className="text-xs text-slate-400">{f.utca?.name || ''} {f.c_szam || ''}</div>
                  </div>
                  {isAssigned ? (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Badge className="text-[10px] bg-emerald-100 text-emerald-700 border-0 gap-1"><Check className="w-3 h-3" /> Hozzárendelve</Badge>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-400 hover:text-red-600" onClick={() => handleRemove(f.id)}>
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <Button variant="outline" size="sm" className="h-7 text-xs gap-1 shrink-0" onClick={() => handleAssign(f.id)}>
                      <Plus className="w-3 h-3" /> Hozzárendel
                    </Button>
                  )}
                </div>
              )
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
