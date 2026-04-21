'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { activateGodMode } from '@/app/(dashboard)/god-mode/actions'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

interface GodModeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function GodModeDialog({ open, onOpenChange }: GodModeDialogProps) {
  const [pin, setPin] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const result = await activateGodMode(pin)

    if (result.error) {
      setError(result.error)
      setLoading(false)
      return
    }

    toast.success('God Mode aktiválva! 2 óra áll rendelkezésre.')
    setPin('')
    onOpenChange(false)
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-red-600">God Mode aktiválás</DialogTitle>
          <DialogDescription>
            Szuperadmin mód — 2 órás időkorláttal. Emelt jogosultságokat biztosít.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm text-center">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="god-pin">PIN kód</Label>
            <Input
              id="god-pin"
              type="password"
              placeholder="Adja meg a PIN kódot"
              value={pin}
              onChange={e => setPin(e.target.value)}
              autoFocus
              required
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Mégse
            </Button>
            <Button type="submit" variant="destructive" disabled={loading || !pin}>
              {loading ? 'Ellenőrzés...' : 'Aktiválás'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
