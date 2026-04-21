'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ModuleHero } from '@/components/shared/module-hero'
import {
  deleteInventoryItem,
  finalizeLeltar,
  getInventoryItems,
  getLeltarFinalizationStatus,
  requestLeltarUnlock,
  saveInventoryItem,
} from '@/app/(dashboard)/leltar/actions'
import { INVENTORY_CATEGORIES, INVENTORY_CATEGORY_LABELS } from '@/lib/constants/inventory'
import { formatCurrency } from '@/lib/constants/finance'
import type { InventoryCategory, InventoryItem } from '@/lib/constants/inventory'
import { toast } from 'sonner'

interface InventoryMainProps {
  congregationName?: string
}

export function InventoryMain({ congregationName }: InventoryMainProps) {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [categoryFilter, setCategoryFilter] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editItem, setEditItem] = useState<InventoryItem | null>(null)
  const [isFinalized, setIsFinalized] = useState(false)
  const [unlockRequested, setUnlockRequested] = useState(false)

  const [fMegnevezes, setFMegnevezes] = useState('')
  const [fKategoria, setFKategoria] = useState<InventoryCategory>('alapeszkoz')
  const [fErtek, setFErtek] = useState<number>(0)
  const [fDatum, setFDatum] = useState('')
  const [fHelyszin, setFHelyszin] = useState('')
  const [fFelelos, setFFelelos] = useState('')
  const [fMegj, setFMegj] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [data, status] = await Promise.all([getInventoryItems(), getLeltarFinalizationStatus()])
    setItems(data)
    setIsFinalized(status.finalized)
    setUnlockRequested(status.unlockRequested)
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(
    () => (categoryFilter ? items.filter((item) => item.kategoria === categoryFilter) : items),
    [items, categoryFilter],
  )
  const totalValue = useMemo(
    () => filtered.reduce((sum, item) => sum + (Number(item.beszerzes_erteke) || 0), 0),
    [filtered],
  )

  async function handleFinalize() {
    if (!confirm('A véglegesítés után a leltár nem szerkeszthető. Folytatja?')) return
    const result = await finalizeLeltar()
    if (result.error) toast.error(result.error)
    else {
      toast.success('Leltár véglegesítve!')
      await load()
    }
  }

  async function handleUnlockRequest() {
    const reason = window.prompt('Miért kér feloldást a leltárhoz?', '')
    if (reason === null) return
    const result = await requestLeltarUnlock(reason)
    if (result.error) toast.error(result.error)
    else {
      toast.success('Feloldás kérelem elküldve!')
      await load()
    }
  }

  function openDialog(item?: InventoryItem) {
    if (item) {
      setEditItem(item)
      setFMegnevezes(item.megnevezes)
      setFKategoria(item.kategoria as InventoryCategory)
      setFErtek(item.beszerzes_erteke)
      setFDatum(item.beszerzes_datuma?.split('T')[0] || '')
      setFHelyszin(item.helyszin || '')
      setFFelelos(item.felelos_nev || '')
      setFMegj(item.megjegyzes || '')
    } else {
      setEditItem(null)
      setFMegnevezes('')
      setFKategoria('alapeszkoz')
      setFErtek(0)
      setFDatum('')
      setFHelyszin('')
      setFFelelos('')
      setFMegj('')
    }
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!fMegnevezes) {
      toast.error('A megnevezés kötelező!')
      return
    }
    if (fErtek <= 0) {
      toast.error('Az érték pozitív szám kell legyen!')
      return
    }

    setSaving(true)
    const result = await saveInventoryItem({
      id: editItem?.id,
      megnevezes: fMegnevezes,
      kategoria: fKategoria,
      beszerzes_erteke: fErtek,
      beszerzes_datuma: fDatum || null,
      helyszin: fHelyszin || null,
      felelos_nev: fFelelos || null,
      megjegyzes: fMegj || null,
    })

    if (result.error) toast.error(result.error)
    else {
      toast.success(editItem ? 'Frissítve!' : 'Rögzítve!')
      setDialogOpen(false)
      await load()
    }
    setSaving(false)
  }

  async function handleDelete(id: string) {
    if (!confirm('Biztosan törli?')) return
    const result = await deleteInventoryItem(id)
    if (result.error) toast.error(result.error)
    else {
      toast.success('Törölve.')
      await load()
    }
  }

  async function handlePrint() {
    const { printToPdf, PRINT_STYLES } = await import('@/lib/utils/print-engine')
    const rows = filtered.map((item, index) => (
      `<tr><td>${index + 1}</td><td>${item.leltari_szam || '—'}</td><td>${item.megnevezes || '—'}</td><td>${INVENTORY_CATEGORY_LABELS[item.kategoria as InventoryCategory] || item.kategoria || '—'}</td><td>${item.helyszin || '—'}</td><td class="text-right">${Number(item.beszerzes_erteke || 0).toFixed(2)}</td></tr>`
    )).join('')

    const html = `<html><head><style>${PRINT_STYLES}</style></head><body><h1>Leltári kimutatás</h1><div class="meta">Nyomtatva: ${new Date().toLocaleDateString('hu-HU')} · ${filtered.length} tétel · Összérték: ${Number(totalValue).toFixed(2)} RON</div><table><thead><tr><th>#</th><th>Leltári szám</th><th>Megnevezés</th><th>Kategória</th><th>Helyszín</th><th class="text-right">Érték (RON)</th></tr></thead><tbody>${rows}</tbody></table><div class="footer">Kartotéka - Egyházi Nyilvántartási Rendszer</div></body></html>`
    await printToPdf(html, 'Leltar_kimutatas.pdf')
    toast.success('Leltár PDF elkészült!')
  }

  return (
    <>
      <ModuleHero
        eyebrow="Leltár"
        title="Gyülekezeti vagyonleltár"
        description="Az eszközök, berendezések és nagyobb értékű tárgyak rendezett, nyomtatható és véglegesíthető nyilvántartása."
        pills={[
          congregationName ? { label: congregationName, tone: 'neutral' } : undefined,
          { label: `${filtered.length} látható tétel`, tone: 'emerald' },
          { label: isFinalized ? 'Leltár véglegesítve' : 'Szerkeszthető állapot', tone: isFinalized ? 'amber' : 'teal' },
        ].filter(Boolean) as { label: string; tone?: 'neutral' | 'emerald' | 'amber' | 'teal' }[]}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label="Tétel" value={String(filtered.length)} />
        <StatCard label="Összérték (RON)" value={formatCurrency(totalValue)} accent="text-emerald-600" />
        <StatCard label="Kategória" value={String(INVENTORY_CATEGORIES.length)} className="hidden sm:block" />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className="rounded-md border border-input bg-background px-3 py-2 text-sm">
          <option value="">Minden kategória</option>
          {INVENTORY_CATEGORIES.map((category) => (
            <option key={category} value={category}>{INVENTORY_CATEGORY_LABELS[category]}</option>
          ))}
        </select>

        <Badge variant="secondary" className="text-xs">{filtered.length} tétel</Badge>

        <div className="ml-auto flex flex-wrap gap-2">
          <Button size="sm" variant="outline" className="gap-1.5 rounded-lg" onClick={handlePrint}>Nyomtatás</Button>
          {!isFinalized ? (
            <>
              <Button size="sm" onClick={() => openDialog()}>+ Új tétel</Button>
              <Button size="sm" variant="outline" className="border-green-300 text-green-700" onClick={handleFinalize}>Véglegesítés</Button>
            </>
          ) : unlockRequested ? (
            <Button size="sm" variant="outline" disabled>Feloldás elbírálás alatt...</Button>
          ) : (
            <Button size="sm" variant="outline" className="border-amber-300 text-amber-700" onClick={handleUnlockRequest}>Feloldás kérelem</Button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="py-8 text-center text-sm text-muted-foreground">Betöltés...</div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            A leltárban jelenleg nincs megjeleníthető tétel.
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b bg-slate-50">
              <tr>
                <th className="p-2 text-left">Lelt. szám</th>
                <th className="p-2 text-left">Megnevezés</th>
                <th className="p-2 text-left hidden md:table-cell">Kategória</th>
                <th className="p-2 text-right">Érték</th>
                <th className="p-2 text-left hidden lg:table-cell">Helyszín</th>
                <th className="w-20 p-2" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.id} className="border-b hover:bg-slate-50">
                  <td className="p-2 font-mono text-xs text-muted-foreground">{item.leltari_szam || '—'}</td>
                  <td className="p-2 font-medium">{item.megnevezes}</td>
                  <td className="hidden p-2 md:table-cell">
                    <Badge variant="outline" className="text-xs">
                      {INVENTORY_CATEGORY_LABELS[item.kategoria as InventoryCategory] || item.kategoria}
                    </Badge>
                  </td>
                  <td className="p-2 text-right font-semibold text-green-700">{formatCurrency(item.beszerzes_erteke)}</td>
                  <td className="hidden p-2 text-xs text-muted-foreground lg:table-cell">{item.helyszin || '—'}</td>
                  <td className="p-2">
                    <div className="flex justify-end gap-1">
                      {!isFinalized ? (
                        <>
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-blue-600" onClick={() => openDialog(item)}>Szerk.</Button>
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-red-500" onClick={() => handleDelete(item.id)}>Törlés</Button>
                        </>
                      ) : (
                        <Badge variant="secondary" className="text-[10px]">Zárolt</Badge>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editItem ? 'Tétel szerkesztése' : 'Új leltár tétel'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Megnevezés *</Label>
              <Input value={fMegnevezes} onChange={(event) => setFMegnevezes(event.target.value)} />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Kategória *</Label>
                <select value={fKategoria} onChange={(event) => setFKategoria(event.target.value as InventoryCategory)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  {INVENTORY_CATEGORIES.map((category) => (
                    <option key={category} value={category}>{INVENTORY_CATEGORY_LABELS[category]}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Beszerzési érték (RON) *</Label>
                <Input type="number" min={0.01} step={0.01} value={fErtek || ''} onChange={(event) => setFErtek(Number(event.target.value))} />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Beszerzési dátum</Label>
                <Input type="date" value={fDatum} onChange={(event) => setFDatum(event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Helyszín</Label>
                <Input value={fHelyszin} onChange={(event) => setFHelyszin(event.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Felelős személy</Label>
              <Input value={fFelelos} onChange={(event) => setFFelelos(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Megjegyzés</Label>
              <Input value={fMegj} onChange={(event) => setFMegj(event.target.value)} />
            </div>
            <div className="flex justify-end gap-2 border-t pt-2">
              <Button variant="ghost" onClick={() => setDialogOpen(false)}>Mégse</Button>
              <Button onClick={handleSave} disabled={saving}>{saving ? 'Mentés...' : 'Mentés'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

function StatCard({
  label,
  value,
  accent = 'text-slate-800',
  className = '',
}: {
  label: string
  value: string
  accent?: string
  className?: string
}) {
  return (
    <div className={`card-raised p-3 text-center ${className}`.trim()}>
      <p className={`text-2xl font-bold ${accent}`}>{value}</p>
      <p className="text-xs text-slate-400">{label}</p>
    </div>
  )
}
