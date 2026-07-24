'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createYearlySettings } from '@/app/(dashboard)/penzugy/actions'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

interface YearlySettingsDialogProps {
  year: number
}

export function YearlySettingsDialog({ year }: YearlySettingsDialogProps) {
  const [loading, setLoading] = useState(false)
  const [jarulek, setJarulek] = useState(100)
  const [hatarid, setHatarid] = useState('07-01')
  const router = useRouter()

  async function handleSubmit() {
    if (jarulek <= 0) { toast.error('Az éves járulék pozitív szám kell legyen!'); return }
    // 2026-07-17 (F5): beírt-de-érvénytelen határidőnél hibaüzenet — a szerver néma
    // '07-01' defaultja csak ÜRES inputra indokolt.
    if (hatarid.trim() !== '' && !/^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/.test(hatarid.trim())) {
      toast.error('Érvénytelen határidő: hónap-nap (HH-NN) alakban add meg, pl. 07-01 = július 1.')
      return
    }
    setLoading(true)
    const result = await createYearlySettings(year, jarulek, hatarid)
    if (result.error) toast.error(result.error)
    else { toast.success('Éves beállítás létrehozva!'); router.refresh() }
    setLoading(false)
  }

  return (
    <Dialog open={true}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Éves Pénzügyi Beállítások — {year}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            A {year}. évre még nincs pénzügyi beállítás. Kérem, adja meg az éves járulék összegét és a fizetési határidőt.
          </p>
          <div className="space-y-1.5">
            <Label>Éves járulék összeg (RON) *</Label>
            <Input type="number" min={1} value={jarulek} onChange={e => setJarulek(Number(e.target.value))} />
          </div>
          <div className="space-y-1.5">
            <Label>Járulék fizetési határidő (HH-NN)</Label>
            <Input value={hatarid} onChange={e => setHatarid(e.target.value)} placeholder="07-01" />
            <p className="text-xs text-muted-foreground">Pl. 07-01 = július 1.</p>
          </div>
          <Button className="w-full" onClick={handleSubmit} disabled={loading}>
            {loading ? 'Létrehozás...' : 'Beállítás létrehozása'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
