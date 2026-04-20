'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { saveInternalTransfer } from '@/app/(dashboard)/penzugy/actions'
import type { BankAccount } from '@/lib/constants/finance'
import { toast } from 'sonner'
import { ArrowLeftRight, Wallet, Landmark } from 'lucide-react'

interface InternalTransferDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  bankAccounts: BankAccount[]
}

type TransferType = 'kassza_bank' | 'bank_kassza' | 'bank_bank' | 'valutacsere'

const TYPES: { value: TransferType; label: string; desc: string }[] = [
  { value: 'kassza_bank', label: 'Kassza → Bank', desc: 'Készpénz befizetés bankba' },
  { value: 'bank_kassza', label: 'Bank → Kassza', desc: 'Készpénz felvétel bankból' },
  { value: 'bank_bank', label: 'Bank → Bank', desc: 'Átutalás számlák között' },
  { value: 'valutacsere', label: 'Valutacsere', desc: 'RON ↔ EUR átváltás' },
]

export function InternalTransferDialog({ open, onOpenChange, bankAccounts }: InternalTransferDialogProps) {
  const [tipus, setTipus] = useState<TransferType>('kassza_bank')
  const [datum, setDatum] = useState(new Date().toISOString().split('T')[0])
  const [osszeg, setOsszeg] = useState('')
  const [celOsszeg, setCelOsszeg] = useState('')
  const [arfolyam, setArfolyam] = useState('')
  const [forras, setForras] = useState('')
  const [cel, setCel] = useState('')
  const [megjegyzes, setMegjegyzes] = useState('')
  const [saving, setSaving] = useState(false)

  const isValuta = tipus === 'valutacsere'
  const bankOpts = bankAccounts.map(b => ({ value: String(b.id), label: `${b.bank_neve} (${b.valuta})` }))
  const ronBanks = bankAccounts.filter(b => b.valuta === 'RON').map(b => ({ value: String(b.id), label: `${b.bank_neve} (RON)` }))
  const eurBanks = bankAccounts.filter(b => b.valuta === 'EUR').map(b => ({ value: String(b.id), label: `${b.bank_neve} (EUR)` }))

  function getForrasOptions() {
    if (tipus === 'kassza_bank') return [{ value: 'kassza', label: 'Kassza (készpénz)' }]
    if (tipus === 'bank_kassza') return bankOpts
    if (tipus === 'bank_bank') return bankOpts
    return ronBanks
  }

  function getCelOptions() {
    if (tipus === 'kassza_bank') return bankOpts
    if (tipus === 'bank_kassza') return [{ value: 'kassza', label: 'Kassza (készpénz)' }]
    if (tipus === 'bank_bank') return bankOpts
    return eurBanks
  }

  function handleTipusChange(t: TransferType) {
    setTipus(t)
    setForras('')
    setCel('')
    const fOpts = t === 'kassza_bank' ? 'kassza' : ''
    const cOpts = t === 'bank_kassza' ? 'kassza' : ''
    setForras(fOpts)
    setCel(cOpts)
  }

  async function handleSave() {
    setSaving(true)
    const res = await saveInternalTransfer({
      tipus, datum, forras, cel,
      osszeg: Number(osszeg) || 0,
      celOsszeg: isValuta ? Number(celOsszeg) || 0 : undefined,
      arfolyam: isValuta ? Number(arfolyam) || 0 : undefined,
      megjegyzes: megjegyzes || undefined,
    })
    if ('error' in res && res.error) {
      toast.error(res.error)
    } else {
      toast.success('Belső mozgás sikeresen rögzítve!')
      onOpenChange(false)
      setOsszeg(''); setCelOsszeg(''); setArfolyam(''); setMegjegyzes('')
    }
    setSaving(false)
  }

  const preview = Number(osszeg) > 0
  const forrasLabel = getForrasOptions().find(o => o.value === forras)?.label || '?'
  const celLabel = getCelOptions().find(o => o.value === cel)?.label || '?'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="icon-raised w-10 h-10 bg-gradient-to-br from-violet-500 to-purple-600">
              <ArrowLeftRight className="w-5 h-5 text-white" />
            </div>
            <DialogTitle>Belső mozgás rögzítése</DialogTitle>
          </div>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Típus választó */}
          <div className="grid grid-cols-2 gap-2">
            {TYPES.map(t => (
              <button
                key={t.value}
                onClick={() => handleTipusChange(t.value)}
                className={`p-3 rounded-xl border text-left transition-all ${
                  tipus === t.value
                    ? 'border-violet-300 bg-violet-50 ring-1 ring-violet-200'
                    : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <p className={`text-sm font-semibold ${tipus === t.value ? 'text-violet-700' : 'text-slate-700'}`}>{t.label}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">{t.desc}</p>
              </button>
            ))}
          </div>

          {/* Dátum */}
          <div className="space-y-1.5">
            <Label>Dátum</Label>
            <Input type="date" value={datum} onChange={e => setDatum(e.target.value)} className="rounded-xl" />
          </div>

          {/* Forrás + Cél */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                {tipus.startsWith('kassza') ? <Wallet className="w-3.5 h-3.5 text-slate-400" /> : <Landmark className="w-3.5 h-3.5 text-slate-400" />}
                Forrás
              </Label>
              <select value={forras} onChange={e => setForras(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm">
                <option value="">Válasszon...</option>
                {getForrasOptions().map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                {tipus.endsWith('kassza') ? <Wallet className="w-3.5 h-3.5 text-slate-400" /> : <Landmark className="w-3.5 h-3.5 text-slate-400" />}
                Cél
              </Label>
              <select value={cel} onChange={e => setCel(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm">
                <option value="">Válasszon...</option>
                {getCelOptions().map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>

          {/* Összeg */}
          <div className={`grid gap-3 ${isValuta ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1'}`}>
            <div className="space-y-1.5">
              <Label>Összeg (RON)</Label>
              <Input type="number" min={0} step="0.01" value={osszeg} onChange={e => setOsszeg(e.target.value)} placeholder="0.00" className="rounded-xl" />
            </div>
            {isValuta && (
              <>
                <div className="space-y-1.5">
                  <Label>Cél összeg (EUR)</Label>
                  <Input type="number" min={0} step="0.01" value={celOsszeg} onChange={e => setCelOsszeg(e.target.value)} placeholder="0.00" className="rounded-xl" />
                </div>
                <div className="space-y-1.5">
                  <Label>Árfolyam (RON/EUR)</Label>
                  <Input type="number" min={0} step="0.0001" value={arfolyam} onChange={e => setArfolyam(e.target.value)} placeholder="4.9700" className="rounded-xl" />
                </div>
              </>
            )}
          </div>

          {/* Megjegyzés */}
          <div className="space-y-1.5">
            <Label>Megjegyzés (opcionális)</Label>
            <Input value={megjegyzes} onChange={e => setMegjegyzes(e.target.value)} placeholder="Pl. havi készpénz befizetés" className="rounded-xl" />
          </div>

          {/* Előnézet */}
          {preview && forras && cel && (
            <div className="rounded-xl bg-violet-50 border border-violet-100 p-3 text-sm text-violet-700">
              <ArrowLeftRight className="w-4 h-4 inline mr-1.5" />
              {forrasLabel} → {celLabel} : <strong>{Number(osszeg).toFixed(2)} RON</strong>
              {isValuta && celOsszeg && <> → <strong>{Number(celOsszeg).toFixed(2)} EUR</strong></>}
            </div>
          )}

          {/* Gombok */}
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <Button variant="ghost" size="sm" className="rounded-xl" onClick={() => onOpenChange(false)}>Mégse</Button>
            <Button size="sm" className="rounded-xl bg-violet-600 hover:bg-violet-700" onClick={handleSave} disabled={saving || !forras || !cel || !osszeg}>
              {saving ? 'Rögzítés...' : 'Belső mozgás rögzítése'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
