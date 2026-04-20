'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'

import { activateGodMode } from '@/app/(dashboard)/god-mode/actions-v2'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface GodModeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function GodModeDialogV3({ open, onOpenChange }: GodModeDialogProps) {
  const [pin, setPin] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setLoading(true)

    const result = await activateGodMode(pin)
    if ('error' in result) {
      setError(result.error || 'Ismeretlen hiba történt.')
      setLoading(false)
      return
    }

    toast.success('God Mode aktiválva. A kiemelt jogosultság 2 órán át él.')
    setPin('')
    onOpenChange(false)
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-600">
            <ShieldAlert className="size-6" />
          </div>
          <DialogTitle className="text-red-600">God Mode aktiválás</DialogTitle>
          <DialogDescription>
            A God Mode 2 órás, kiemelt rendszergazdai hozzáférést ad. A belépéshez 6 számjegyű PIN szükséges.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="god-pin">God Mode PIN</Label>
            <Input
              id="god-pin"
              type="password"
              inputMode="numeric"
              maxLength={6}
              placeholder="6 számjegy"
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 6))}
              autoFocus
              required
            />
            <p className="text-xs text-slate-500">
              Csak főadmin jogosultsággal használható. A lejárat után a rendszer automatikusan kiléptet.
            </p>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Mégse
            </Button>
            <Button type="submit" variant="destructive" disabled={loading || pin.length !== 6}>
              {loading ? 'Ellenőrzés...' : 'Aktiválás'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
