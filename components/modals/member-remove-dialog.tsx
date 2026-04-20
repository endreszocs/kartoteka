'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { removeMember } from '@/app/(dashboard)/tagnyilvantartas/actions'
import { REMOVE_REASONS, REMOVE_REASON_LABELS } from '@/lib/constants/members'
import type { RemoveReason } from '@/lib/constants/members'
import { toast } from 'sonner'

interface MemberRemoveDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  member: { id: number; name: string } | null
}

export function MemberRemoveDialog({ open, onOpenChange, member }: MemberRemoveDialogProps) {
  const [step, setStep] = useState<'choose' | 'form'>('choose')
  const [reason, setReason] = useState<RemoveReason | null>(null)
  const [loading, setLoading] = useState(false)

  // Form mezők
  const [hdatum, setHdatum] = useState('')
  const [tdatum, setTdatum] = useState('')
  const [hhely, setHhely] = useState('')
  const [thely, setThely] = useState('')
  const [hoka, setHoka] = useState('')
  const [lelkesz, setLelkesz] = useState('')
  const [koltDatum, setKoltDatum] = useState('')
  const [koltHova, setKoltHova] = useState('')
  const [kulfold, setKulfold] = useState(false)
  const [koltMegj, setKoltMegj] = useState('')
  const [kitDatum, setKitDatum] = useState('')
  const [kitVallas, setKitVallas] = useState('')
  const [kitHova, setKitHova] = useState('')
  const [kitMegj, setKitMegj] = useState('')

  function resetForm() {
    setStep('choose'); setReason(null)
    setHdatum(''); setTdatum(''); setHhely(''); setThely(''); setHoka(''); setLelkesz('')
    setKoltDatum(''); setKoltHova(''); setKulfold(false); setKoltMegj('')
    setKitDatum(''); setKitVallas(''); setKitHova(''); setKitMegj('')
  }

  function selectReason(r: RemoveReason) {
    setReason(r)
    setStep('form')
  }

  async function handleSubmit() {
    if (!member || !reason) return

    if (reason === 'torles' && !confirm('Biztosan törli ezt a tagot? Ez a művelet visszavonhatatlan.')) return

    setLoading(true)
    const result = await removeMember({
      id: member.id,
      reason,
      hdatum: hdatum || undefined,
      tdatum: tdatum || undefined,
      hhely: hhely || undefined,
      thely: thely || undefined,
      hoka: hoka || undefined,
      lelkesz: lelkesz || undefined,
      kolt_datum: koltDatum || undefined,
      kolt_hova: koltHova || undefined,
      kulfold,
      kolt_megj: koltMegj || undefined,
      kitert_datum: kitDatum || undefined,
      kitert_vallas: kitVallas || undefined,
      kitert_hova: kitHova || undefined,
      kitert_megj: kitMegj || undefined,
    })

    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success(result.message || 'Művelet sikeresen végrehajtva.')
      resetForm()
      onOpenChange(false)
    }
    setLoading(false)
  }

  if (!member) return null

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v) }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Tag kivezetése: {member.name}</DialogTitle>
        </DialogHeader>

        {step === 'choose' && (
          <div className="space-y-2 py-2">
            <p className="text-sm text-muted-foreground">Válassza ki a kivezetés okát:</p>
            {REMOVE_REASONS.map(r => (
              <Button key={r} variant="outline" className={`w-full justify-start ${r === 'torles' ? 'border-red-300 text-red-600 hover:bg-red-50' : ''}`} onClick={() => selectReason(r)}>
                {r === 'meghalt' && '✝ '}{r === 'elkoltozott' && '🚚 '}{r === 'kitert' && '↪ '}{r === 'torles' && '🗑️ '}
                {REMOVE_REASON_LABELS[r]}
              </Button>
            ))}
          </div>
        )}

        {step === 'form' && reason === 'meghalt' && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Halál dátuma *</Label><Input type="date" value={hdatum} onChange={e => setHdatum(e.target.value)} required /></div>
              <div className="space-y-1.5"><Label>Temetés dátuma *</Label><Input type="date" value={tdatum} onChange={e => setTdatum(e.target.value)} required /></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Halál helye</Label><Input value={hhely} onChange={e => setHhely(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Temetés helye</Label><Input value={thely} onChange={e => setThely(e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Halál oka</Label><Input value={hoka} onChange={e => setHoka(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Lelkész neve</Label><Input value={lelkesz} onChange={e => setLelkesz(e.target.value)} /></div>
            </div>
          </div>
        )}

        {step === 'form' && reason === 'elkoltozott' && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Dátum</Label><Input type="date" value={koltDatum} onChange={e => setKoltDatum(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Hová költözött</Label><Input value={koltHova} onChange={e => setKoltHova(e.target.value)} /></div>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={kulfold} onChange={e => setKulfold(e.target.checked)} /> Külföldre költözött</label>
            <div className="space-y-1.5"><Label>Megjegyzés</Label><Input value={koltMegj} onChange={e => setKoltMegj(e.target.value)} /></div>
          </div>
        )}

        {step === 'form' && reason === 'kitert' && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Dátum</Label><Input type="date" value={kitDatum} onChange={e => setKitDatum(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Új felekezet *</Label><Input value={kitVallas} onChange={e => setKitVallas(e.target.value)} placeholder="Pl. Római katolikus" /></div>
            </div>
            <div className="space-y-1.5"><Label>Megjegyzés</Label><Input value={kitMegj} onChange={e => setKitMegj(e.target.value)} /></div>
          </div>
        )}

        {step === 'form' && reason === 'torles' && (
          <div className="bg-red-50 p-3 rounded-lg text-sm text-red-700">
            <p className="font-semibold">Figyelem!</p>
            <p>Ha a taghoz pénzügyi tranzakció tartozik, a rendszer nem törli véglegesen, hanem elrejti a névsorból.</p>
          </div>
        )}

        {step === 'form' && (
          <div className="flex justify-end gap-2 pt-3 border-t">
            <Button variant="ghost" onClick={() => setStep('choose')}>Vissza</Button>
            <Button variant="destructive" onClick={handleSubmit} disabled={loading || (reason === 'meghalt' && (!hdatum || !tdatum))}>
              {loading ? 'Feldolgozás...' : 'Végrehajtás'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
