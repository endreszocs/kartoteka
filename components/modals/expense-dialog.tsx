'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { saveExpense } from '@/app/(dashboard)/penzugy/actions'
import { RECEIPT_TYPES, isInventoryCategory } from '@/lib/constants/finance'
import { toast } from 'sonner'

interface Category { id: number; kod: string; nev: string }

interface ExpenseDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  categories: Category[]
}

export function ExpenseDialog({ open, onOpenChange, categories }: ExpenseDialogProps) {
  const [loading, setLoading] = useState(false)
  const [osszeg, setOsszeg] = useState<number>(0)
  const [datum, setDatum] = useState(new Date().toISOString().slice(0, 10))
  const [categoryId, setCategoryId] = useState<number | ''>('')
  const [partner, setPartner] = useState('')
  const [iratszam, setIratszam] = useState('')
  const [irattipus, setIrattipus] = useState<typeof RECEIPT_TYPES[number]>('Készpénz')
  const [megjegyzes, setMegjegyzes] = useState('')
  const [isInventory, setIsInventory] = useState(false)
  const [dateBadge, setDateBadge] = useState('')

  useEffect(() => {
    if (!open) return
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      setOsszeg(0)
      setDatum(new Date().toISOString().slice(0, 10))
      setCategoryId('')
      setPartner('')
      setIratszam('')
      setIrattipus('Készpénz')
      setMegjegyzes('')
      setIsInventory(false)
      setDateBadge('')
    })
    return () => {
      cancelled = true
    }
  }, [open])

  function handleCategoryChange(id: number) {
    setCategoryId(id)
    const cat = categories.find(c => c.id === id)
    if (cat) setIsInventory(isInventoryCategory(cat.nev))
  }

  function checkDate(val: string) {
    setDatum(val)
    const today = new Date().toISOString().slice(0, 10)
    if (val > today) setDateBadge('Jövőbeli dátum nem engedélyezett!')
    else setDateBadge('')
  }

  async function handleSubmit() {
    const today = new Date().toISOString().slice(0, 10)
    if (datum > today) { toast.error('Jövőbeli dátum nem engedélyezett!'); return }
    if (!categoryId) { toast.error('Válasszon kategóriát!'); return }
    if (osszeg <= 0) { toast.error('Az összeg pozitív szám kell legyen!'); return }

    setLoading(true)
    const result = await saveExpense({
      osszeg,
      datum,
      id_kiadascel: Number(categoryId),
      kedvezmenyzett: partner || null,
      iratszam: iratszam || null,
      irattipus,
      megjegyzes: megjegyzes || null,
      is_inventory: isInventory,
    })

    if (result.error) toast.error(result.error)
    else { toast.success('Kiadás sikeresen rögzítve!'); onOpenChange(false) }
    setLoading(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg p-0">
        <div className="px-6 pt-6 pb-4 border-b border-zinc-100">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center shadow-md">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
              </div>
              <div>
                <DialogTitle className="font-heading text-lg">Kiadás rögzítése</DialogTitle>
                <p className="text-xs text-zinc-400 mt-0.5">Új kiadás hozzáadása a pénztárkönyvhöz</p>
              </div>
            </div>
          </DialogHeader>
        </div>

        <div className="px-6 pb-6 pt-4 space-y-3">
          <div className="space-y-1.5">
            <Label>Partner / Kedvezményezett</Label>
            <Input value={partner} onChange={e => setPartner(e.target.value)} placeholder="Pl. Villámszolgáltató Kft." />
          </div>

          <div className="space-y-1.5">
            <Label>Kategória *</Label>
            <select value={categoryId} onChange={e => handleCategoryChange(Number(e.target.value))} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="">— Válasszon —</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.kod} — {c.nev}</option>)}
            </select>
          </div>

          {isInventory && (
            <div className="flex items-center gap-2 p-2 bg-amber-50 rounded-lg">
              <input type="checkbox" checked={isInventory} onChange={e => setIsInventory(e.target.checked)} className="shrink-0" />
              <Label className="text-xs text-amber-700">Leltárba helyezés (a kategória alapján automatikusan bejelölve)</Label>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Összeg (RON) *</Label>
              <Input type="number" min={0.01} step={0.01} value={osszeg || ''} onChange={e => setOsszeg(Number(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label>Dátum *</Label>
              <Input type="date" value={datum} onChange={e => checkDate(e.target.value)} />
              {dateBadge && <Badge variant="secondary" className="text-[10px] bg-red-100 text-red-700">{dateBadge}</Badge>}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Iratszám</Label>
              <Input value={iratszam} onChange={e => setIratszam(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Típus *</Label>
              <select value={irattipus} onChange={e => setIrattipus(e.target.value as typeof irattipus)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                {RECEIPT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Megjegyzés</Label>
            <Input value={megjegyzes} onChange={e => setMegjegyzes(e.target.value)} />
          </div>

          <div className="flex gap-2 pt-4 border-t border-zinc-100">
            <Button variant="outline" className="flex-1 rounded-xl bg-zinc-50 hover:bg-zinc-100 text-zinc-600" onClick={() => onOpenChange(false)}>Mégse</Button>
            <Button className="flex-[2] rounded-xl bg-red-600 hover:bg-red-700" onClick={handleSubmit} disabled={loading || datum > new Date().toISOString().slice(0, 10)}>
              {loading ? 'Mentés...' : 'Kiadás mentése'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
